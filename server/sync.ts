/**
 * OpenPhone Call Sync Service
 * Handles syncing call data and transcripts from OpenPhone API to local database
 */

import { fetchCalls, fetchTranscript, OpenPhoneCall } from "./openphone";
import { getDb } from "./db";
import { calls, transcripts, InsertCall, InsertTranscript } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { analyzeCall } from "./analysis";

export interface SyncResult {
  success: boolean;
  callsSynced: number;
  transcriptsSynced: number;
  analysesTriggered: number;
  errors: string[];
  duration: number;
}

export interface SyncOptions {
  phoneNumberId: string;
  participants?: string[];
  daysToSync: number;
  userId?: string;
  autoAnalyze?: boolean; // Default: true
}

/**
 * Sync calls from OpenPhone API to local database
 * Handles pagination automatically and filters for completed calls only
 */
export async function syncCalls(options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();
  const result: SyncResult = {
    success: true,
    callsSynced: 0,
    transcriptsSynced: 0,
    analysesTriggered: 0,
    errors: [],
    duration: 0,
  };

  console.log("[Sync] ========================================");
  console.log("[Sync] Starting sync process");
  console.log("[Sync] Parameters:", {
    phoneNumberId: options.phoneNumberId,
    participants: options.participants || [],
    daysToSync: options.daysToSync,
    userId: options.userId,
    autoAnalyze: options.autoAnalyze !== false,
  });
  console.log("[Sync] ========================================");

  try {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date(now.getTime() - options.daysToSync * 24 * 60 * 60 * 1000);
    const createdAfter = startDate.toISOString();

    console.log(`[Sync] Date range: Last ${options.daysToSync} days`);
    console.log(`[Sync] Created after: ${createdAfter} (${startDate.toLocaleString()})`);
    console.log(`[Sync] Created before: ${now.toISOString()} (${now.toLocaleString()})`);

    let pageToken: string | undefined;
    let totalCallsFetched = 0;
    let pageNumber = 0;
    const allCalls: OpenPhoneCall[] = [];

    // Fetch all pages of calls
    do {
      pageNumber++;
      try {
        console.log(`[Sync] Fetching page ${pageNumber}${pageToken ? ` (with pageToken)` : ""}...`);
        
        // Build fetch params - only include participants if filtering by specific numbers
        const fetchParams: Parameters<typeof fetchCalls>[0] = {
          phoneNumberId: options.phoneNumberId,
          createdAfter,
          maxResults: 100, // Max allowed by API
        };
        
        if (options.participants && options.participants.length > 0) {
          fetchParams.participants = options.participants;
        }
        
        if (options.userId) {
          fetchParams.userId = options.userId;
        }
        
        if (pageToken) {
          fetchParams.pageToken = pageToken;
        }
        
        const response = await fetchCalls(fetchParams);

        allCalls.push(...response.data);
        totalCallsFetched += response.data.length;
        pageToken = response.nextPageToken;

        console.log(`[Sync] Page ${pageNumber}: Fetched ${response.data.length} calls (total so far: ${totalCallsFetched})`);

        // If there's a next page, continue
        if (pageToken) {
          console.log(`[Sync] More pages available, fetching next page...`);
        } else {
          console.log(`[Sync] All pages fetched. Total calls retrieved: ${totalCallsFetched}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.success = false;
        result.errors.push(`Failed to fetch calls: ${errorMessage}`);
        console.error("[Sync] Error fetching calls:", {
          pageNumber,
          phoneNumberId: options.phoneNumberId,
          error: errorMessage,
        });
        
        // Check for specific error types to provide better messages
        if (errorMessage.includes("API key is invalid")) {
          result.errors.push("OpenPhone API key is invalid");
        } else if (errorMessage.includes("Phone number ID not found")) {
          result.errors.push(`Phone number ID "${options.phoneNumberId}" not found in your OpenPhone account`);
        }
        
        break;
      }
    } while (pageToken);

    // Check if we got any calls at all
    if (totalCallsFetched === 0 && result.errors.length === 0) {
      console.log(`[Sync] No calls found in the last ${options.daysToSync} days for phone number ${options.phoneNumberId}`);
      result.errors.push(`No calls found in the last ${options.daysToSync} days for this phone number`);
    }

    // Filter for completed calls only
    const completedCalls = allCalls.filter(call => call.status === "completed");
    const nonCompletedCalls = allCalls.length - completedCalls.length;
    
    console.log(`[Sync] Call filtering results:`);
    console.log(`[Sync]   - Total calls fetched: ${totalCallsFetched}`);
    console.log(`[Sync]   - Completed calls: ${completedCalls.length}`);
    console.log(`[Sync]   - Non-completed calls (filtered out): ${nonCompletedCalls}`);
    
    if (completedCalls.length === 0 && totalCallsFetched > 0) {
      console.log(`[Sync] Warning: All ${totalCallsFetched} calls were filtered out (not completed)`);
    }

    // Upsert calls to database
    console.log(`[Sync] Saving ${completedCalls.length} calls to database...`);
    let callsSaved = 0;
    let callsUpdated = 0;
    let callsFailed = 0;
    
    for (const call of completedCalls) {
      try {
        const existing = await upsertCall(call);
        result.callsSynced++;
        if (existing) {
          callsUpdated++;
        } else {
          callsSaved++;
        }
      } catch (error) {
        callsFailed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to save call ${call.id}: ${errorMessage}`);
        console.error(`[Sync] Error saving call ${call.id}:`, errorMessage);
      }
    }
    
    console.log(`[Sync] Database save results:`);
    console.log(`[Sync]   - New calls saved: ${callsSaved}`);
    console.log(`[Sync]   - Existing calls updated: ${callsUpdated}`);
    console.log(`[Sync]   - Failed to save: ${callsFailed}`);

    // Fetch and save transcripts for completed calls
    console.log(`[Sync] Fetching transcripts for ${completedCalls.length} calls...`);
    let transcriptsFound = 0;
    let transcriptsNotFound = 0;
    let transcriptsFailed = 0;
    
    for (const call of completedCalls) {
      try {
        const transcript = await fetchTranscriptForCall(call.id);
        if (transcript) {
          result.transcriptsSynced++;
          transcriptsFound++;
        } else {
          transcriptsNotFound++;
        }
      } catch (error) {
        transcriptsFailed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        // Transcripts might not exist for all calls, so we log but don't fail
        console.log(`[Sync] No transcript available for call ${call.id}: ${errorMessage}`);
      }
    }
    
    console.log(`[Sync] Transcript fetch results:`);
    console.log(`[Sync]   - Transcripts found and saved: ${transcriptsFound}`);
    console.log(`[Sync]   - Transcripts not available: ${transcriptsNotFound}`);
    console.log(`[Sync]   - Transcript fetch errors: ${transcriptsFailed}`);

    // Auto-analyze qualifying calls if enabled
    const shouldAutoAnalyze = options.autoAnalyze !== false; // Default to true
    if (shouldAutoAnalyze) {
      const callsToAnalyze = filterCallsForAnalysis(completedCalls, options.phoneNumberId);
      console.log(`[Sync] Auto-analysis enabled`);
      console.log(`[Sync]   - Qualifying calls for analysis: ${callsToAnalyze.length} out of ${completedCalls.length} total`);
      
      if (callsToAnalyze.length > 0) {
        let analysesSucceeded = 0;
        let analysesFailed = 0;
        
        for (const call of callsToAnalyze) {
          try {
            // Pass phoneNumberId to analysis so it can be stored in metadata
            const analysisResult = await analyzeCall({ 
              callId: call.id,
              phoneNumberId: options.phoneNumberId,
            });
            if (analysisResult.success) {
              result.analysesTriggered++;
              analysesSucceeded++;
              console.log(`[Sync] ✓ Analyzed call ${call.id}`);
            } else {
              analysesFailed++;
              console.log(`[Sync] ✗ Failed to analyze call ${call.id}: ${analysisResult.error}`);
              result.errors.push(`Analysis failed for call ${call.id}: ${analysisResult.error}`);
            }
          } catch (error) {
            analysesFailed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[Sync] ✗ Error analyzing call ${call.id}: ${errorMessage}`);
            result.errors.push(`Analysis error for call ${call.id}: ${errorMessage}`);
            // Don't stop the sync process on analysis errors
          }
        }
        
        console.log(`[Sync] Analysis results:`);
        console.log(`[Sync]   - Successful analyses: ${analysesSucceeded}`);
        console.log(`[Sync]   - Failed analyses: ${analysesFailed}`);
      } else {
        console.log(`[Sync] No calls qualified for auto-analysis based on filtering rules`);
      }
    } else {
      console.log(`[Sync] Auto-analysis disabled`);
    }

    result.duration = Date.now() - startTime;
    console.log("[Sync] ========================================");
    console.log(`[Sync] Sync completed in ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`[Sync] Summary:`);
    console.log(`[Sync]   - Calls synced: ${result.callsSynced}`);
    console.log(`[Sync]   - Transcripts synced: ${result.transcriptsSynced}`);
    console.log(`[Sync]   - Analyses triggered: ${result.analysesTriggered}`);
    console.log(`[Sync]   - Errors: ${result.errors.length}`);
    if (result.errors.length > 0) {
      result.errors.forEach((error, index) => {
        console.log(`[Sync]     ${index + 1}. ${error}`);
      });
    }
    console.log(`[Sync]   - Success: ${result.success ? "✓" : "✗"}`);
    console.log("[Sync] ========================================");

  } catch (error) {
    result.success = false;
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    console.error("[Sync] ========================================");
    console.error("[Sync] Sync failed with error:", errorMessage);
    console.error("[Sync] ========================================");
  }

  result.duration = Date.now() - startTime;
  return result;
}

/**
 * Upsert a call record to the database
 * Returns true if call was updated, false if it was inserted
 */
async function upsertCall(call: OpenPhoneCall): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Extract from/to numbers from participants
  const fromNumber = call.from || call.participants[0]?.phoneNumber || "";
  const toNumber = call.to || call.participants[1]?.phoneNumber || "";

  const callData: InsertCall = {
    callId: call.id,
    direction: call.direction,
    fromNumber,
    toNumber,
    duration: call.duration || 0,
    status: call.status,
    createdAt: new Date(call.createdAt),
    answeredAt: call.answeredAt ? new Date(call.answeredAt) : null,
    completedAt: call.completedAt ? new Date(call.completedAt) : null,
    phoneNumberId: call.phoneNumberId,
    userId: call.userId,
    metadata: call as any,
  };

  // Check if call already exists
  const existing = await db
    .select()
    .from(calls)
    .where(eq(calls.callId, call.id))
    .limit(1);

  if (existing.length > 0) {
    // Update existing call
    await db
      .update(calls)
      .set(callData)
      .where(eq(calls.callId, call.id));
    return true; // Updated
  } else {
    // Insert new call
    await db.insert(calls).values(callData);
    return false; // Inserted
  }
}

/**
 * Normalize phone number to E.164 format for comparison
 * Handles various formats: (412) 573-9101, 412-573-9101, +14125739101, etc.
 */
function normalizePhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters except leading +
  const cleaned = phoneNumber.replace(/[^\d+]/g, "");
  
  // If it starts with +, return as-is (already E.164)
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  
  // If it's 10 digits, assume US number and add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // If it's 11 digits starting with 1, add +
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }
  
  // Return cleaned number as-is
  return cleaned;
}

/**
 * Filter calls that should be automatically analyzed based on business rules:
 * - Main line (PNVbbBqeqM): Only INCOMING calls >30 seconds duration
 * - Outbound line (PNBANAZERt): Only OUTGOING calls (all durations)
 */
function filterCallsForAnalysis(calls: OpenPhoneCall[], phoneNumberId: string): OpenPhoneCall[] {
  const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID || "PNVbbBqeqM";
  const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID || "PNBANAZERt";
  
  const isMainLine = phoneNumberId === mainPhoneId;
  const isOutboundLine = phoneNumberId === outboundPhoneId;
  
  const filtered = calls.filter(call => {
    if (isMainLine) {
      // Main line: only incoming calls >30 seconds
      if (call.direction === "incoming" && (call.duration || 0) > 30) {
        return true;
      }
    }
    
    if (isOutboundLine) {
      // Outbound line: only outgoing calls
      if (call.direction === "outgoing") {
        return true;
      }
    }
    
    return false;
  });
  
  console.log(
    `[Sync] Filtered ${filtered.length} calls for analysis out of ${calls.length} total ` +
    `(${isMainLine ? "main line" : isOutboundLine ? "outbound line" : "unknown line"})`
  );
  
  return filtered;
}

/**
 * Fetch and save transcript for a call
 * Exported for use in scripts
 * 
 * IMPORTANT: OpenPhone API returns "dialogue" array, NOT "segments"
 * - API response: { data: { dialogue: [...] } }
 * - We transform dialogue → segments for database storage
 * - Database stores: jsonPayload.segments[]
 */
export async function fetchTranscriptForCall(callId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    const response = await fetchTranscript(callId);
    const transcript = response.data;

    // OpenPhone API returns dialogue array (NOT segments)
    if (!transcript || !transcript.dialogue || transcript.dialogue.length === 0) {
      console.log(`[Sync] No transcript dialogue available for call ${callId}`);
      return false;
    }

    // Build full text from dialogue array
    // Map OpenPhone API fields: content -> text, identifier/userId -> speaker
    const fullText = transcript.dialogue
      .map(segment => {
        const speaker = segment.userId || segment.identifier || 'Unknown';
        const text = segment.content || '';
        return `${speaker}: ${text}`;
      })
      .join("\n");

    // Transform dialogue → segments for database storage
    // Database stores as "segments" but API provides "dialogue"
    const transcriptData: InsertTranscript = {
      callId: transcript.callId,
      fullText,
      jsonPayload: {
        segments: transcript.dialogue.map(d => ({
          start: d.start,
          end: d.end,
          speaker: d.userId || d.identifier || 'Unknown',
          text: d.content || '',
        })),
      },
      duration: transcript.duration,
      status: transcript.status,
    };

    // Check if transcript already exists
    const existing = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.callId, callId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing transcript
      await db
        .update(transcripts)
        .set(transcriptData)
        .where(eq(transcripts.callId, callId));
    } else {
      // Insert new transcript
      await db.insert(transcripts).values(transcriptData);
    }

    return true;
  } catch (error) {
    // If transcript doesn't exist (404), that's okay
    if (error instanceof Error && error.message.includes("404")) {
      return false;
    }
    throw error;
  }
}
