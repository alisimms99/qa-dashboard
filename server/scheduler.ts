/**
 * Scheduled Sync Service
 * Handles daily automated syncs and startup catch-up syncs
 */

import cron from "node-cron";
import { syncCalls, SyncResult } from "./sync";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Store config file in server directory
// Using process.cwd() which should work when running from project root
const SYNC_CONFIG_FILE = join(process.cwd(), "server", ".sync-config.json");

interface SyncConfig {
  lastSyncTimestamp: number | null;
  lastSyncResult: SyncResult | null;
}

/**
 * Load sync configuration from file
 */
function loadSyncConfig(): SyncConfig {
  try {
    if (existsSync(SYNC_CONFIG_FILE)) {
      const content = readFileSync(SYNC_CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("[Scheduler] Failed to load sync config:", error);
  }
  return {
    lastSyncTimestamp: null,
    lastSyncResult: null,
  };
}

/**
 * Save sync configuration to file
 */
function saveSyncConfig(config: SyncConfig): void {
  try {
    writeFileSync(SYNC_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error("[Scheduler] Failed to save sync config:", error);
  }
}

/**
 * Get OpenPhone phoneNumberId from environment or use default
 * Note: This should be the OpenPhone ID (e.g., "PN123abc"), not the phone number
 * Set OPENPHONE_PHONE_NUMBER_ID environment variable
 */
function getPhoneNumberId(): string {
  const phoneNumberId = process.env.OPENPHONE_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    console.warn(
      "[Scheduler] OPENPHONE_PHONE_NUMBER_ID not set. Using default. Please set this environment variable."
    );
    // Return empty string - sync will fail gracefully with proper error message
    return "";
  }
  return phoneNumberId;
}

/**
 * Perform scheduled sync for last 24 hours
 * Syncs both main line and outbound line
 */
async function performScheduledSync(): Promise<{ mainLine: SyncResult; outboundLine: SyncResult }> {
  const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID || "PNVbbBqeqM";
  const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID || "PNBANAZERt";

  console.log(`[Scheduler] Starting scheduled sync at ${new Date().toISOString()}`);
  console.log(`[Scheduler] Syncing calls from last 24 hours`);

  const results = {
    mainLine: {} as SyncResult,
    outboundLine: {} as SyncResult,
  };

  // Sync main line first
  console.log(`[Scheduler] Syncing main line (${mainPhoneId})...`);
  try {
    results.mainLine = await syncCalls({
      phoneNumberId: mainPhoneId,
      participants: [], // All participants
      daysToSync: 1, // Last 24 hours (1 day)
      autoAnalyze: true,
    });
    console.log(
      `[Scheduler] Main line sync completed: ${results.mainLine.callsSynced} calls, ` +
      `${results.mainLine.transcriptsSynced} transcripts, ${results.mainLine.analysesTriggered} analyses`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Scheduler] Main line sync failed: ${errorMessage}`);
    results.mainLine = {
      success: false,
      callsSynced: 0,
      transcriptsSynced: 0,
      analysesTriggered: 0,
      errors: [errorMessage],
      duration: 0,
    };
  }

  // Sync outbound line
  console.log(`[Scheduler] Syncing outbound line (${outboundPhoneId})...`);
  try {
    results.outboundLine = await syncCalls({
      phoneNumberId: outboundPhoneId,
      participants: [], // All participants
      daysToSync: 1, // Last 24 hours (1 day)
      autoAnalyze: true,
    });
    console.log(
      `[Scheduler] Outbound line sync completed: ${results.outboundLine.callsSynced} calls, ` +
      `${results.outboundLine.transcriptsSynced} transcripts, ${results.outboundLine.analysesTriggered} analyses`
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Scheduler] Outbound line sync failed: ${errorMessage}`);
    results.outboundLine = {
      success: false,
      callsSynced: 0,
      transcriptsSynced: 0,
      analysesTriggered: 0,
      errors: [errorMessage],
      duration: 0,
    };
  }

  // Save sync result and timestamp (use combined results)
  const combinedResult: SyncResult = {
    success: results.mainLine.success && results.outboundLine.success,
    callsSynced: results.mainLine.callsSynced + results.outboundLine.callsSynced,
    transcriptsSynced: results.mainLine.transcriptsSynced + results.outboundLine.transcriptsSynced,
    analysesTriggered: results.mainLine.analysesTriggered + results.outboundLine.analysesTriggered,
    errors: [...results.mainLine.errors, ...results.outboundLine.errors],
    duration: results.mainLine.duration + results.outboundLine.duration,
  };

  saveSyncConfig({
    lastSyncTimestamp: Date.now(),
    lastSyncResult: combinedResult,
  });

  const totalCalls = results.mainLine.callsSynced + results.outboundLine.callsSynced;
  const totalAnalyses = results.mainLine.analysesTriggered + results.outboundLine.analysesTriggered;
  
  console.log(
    `[Scheduler] Scheduled sync completed: ${totalCalls} total calls, ${totalAnalyses} total analyses`
  );

  return results;
}

/**
 * Check if startup sync is needed (last sync was >24 hours ago)
 */
async function checkAndRunStartupSync(): Promise<void> {
  const config = loadSyncConfig();
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // If no previous sync or last sync was more than 24 hours ago
  if (!config.lastSyncTimestamp || config.lastSyncTimestamp < twentyFourHoursAgo) {
    console.log("[Scheduler] Startup sync needed - last sync was more than 24 hours ago");
    
    try {
      const syncResults = await performScheduledSync();
      // Save combined result for tracking
      const combinedResult: SyncResult = {
        success: syncResults.mainLine.success && syncResults.outboundLine.success,
        callsSynced: syncResults.mainLine.callsSynced + syncResults.outboundLine.callsSynced,
        transcriptsSynced: syncResults.mainLine.transcriptsSynced + syncResults.outboundLine.transcriptsSynced,
        analysesTriggered: syncResults.mainLine.analysesTriggered + syncResults.outboundLine.analysesTriggered,
        errors: [...syncResults.mainLine.errors, ...syncResults.outboundLine.errors],
        duration: syncResults.mainLine.duration + syncResults.outboundLine.duration,
      };
      saveSyncConfig({
        lastSyncTimestamp: Date.now(),
        lastSyncResult: combinedResult,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Scheduler] Startup sync failed: ${errorMessage}`);
      // Don't throw - allow server to start even if sync fails
    }
  } else {
    const hoursSinceLastSync = (now - config.lastSyncTimestamp) / (1000 * 60 * 60);
    console.log(
      `[Scheduler] Startup sync skipped - last sync was ${hoursSinceLastSync.toFixed(1)} hours ago`
    );
  }
}

/**
 * Initialize scheduled syncs
 */
export function initializeScheduler(): void {
  console.log("[Scheduler] Initializing scheduled sync service...");

  // Run startup sync check
  checkAndRunStartupSync().catch((error) => {
    console.error("[Scheduler] Startup sync check failed:", error);
  });

  // Schedule daily sync at 2 AM EST/EDT
  const cronJob = cron.schedule(
    "0 2 * * *",
    async () => {
      console.log("[Scheduler] Daily sync triggered at 2 AM");
      try {
        const syncResults = await performScheduledSync();
        // Results are already logged and saved in performScheduledSync
        console.log(
          `[Scheduler] Daily sync completed: Main line ${syncResults.mainLine.analysesTriggered} analyses, ` +
          `Outbound line ${syncResults.outboundLine.analysesTriggered} analyses`
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Scheduler] Scheduled sync error: ${errorMessage}`);
        // Log error but don't crash - cron will retry next day
      }
    },
    {
      timezone: "America/New_York",
    }
  );

  console.log("[Scheduler] Daily sync scheduled for 2 AM EST/EDT");
  console.log("[Scheduler] Cron job status:", cronJob.getStatus());

  // Export function for manual trigger
  (globalThis as any).triggerManualSync = async (): Promise<{ mainLine: SyncResult; outboundLine: SyncResult }> => {
    console.log("[Scheduler] Manual sync triggered");
    return await performScheduledSync();
  };
}

/**
 * Manual sync trigger function (for testing/API endpoint)
 */
export async function triggerManualSync(): Promise<{ mainLine: SyncResult; outboundLine: SyncResult }> {
  return await performScheduledSync();
}

