/**
 * CSV Import Tool
 * Import calls from OpenPhone CSV export
 */

import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { getDb } from '../db';
import { calls, transcripts } from '../../drizzle/schema';
import { fetchTranscript } from '../openphone';
import { analyzeCall } from '../analysis';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';

export interface CSVImportOptions {
  csvPath: string; // Path to CSV file exported from OpenPhone
  userFilter?: string; // Filter by user name (e.g., "Joy Libed", "Ali Simms")
  autoAnalyze?: boolean;
}

export interface CSVImportStats {
  processed: number;
  imported: number;
  transcriptsFetched: number;
  analyzed: number;
  skipped: number;
  errors: string[];
}

export async function importFromOpenPhoneCSV(options: CSVImportOptions): Promise<CSVImportStats> {
  const { csvPath, userFilter, autoAnalyze = true } = options;

  console.log('[CSV Import] ═══════════════════════════════════');
  console.log('[CSV Import] Starting CSV import...');
  console.log('[CSV Import] File:', csvPath);
  if (userFilter) {
    console.log('[CSV Import] Filtering by user:', userFilter);
  }
  console.log('[CSV Import] ═══════════════════════════════════');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`[CSV Import] Found ${records.length} calls in CSV`);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const stats: CSVImportStats = {
    processed: 0,
    imported: 0,
    transcriptsFetched: 0,
    analyzed: 0,
    skipped: 0,
    errors: [],
  };

  const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID;
  const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID;

  for (const record of records) {
    try {
      stats.processed++;

      // Apply user filter if specified
      if (userFilter) {
        const userField = record['User'] || record['user'] || record['User Name'] || record['user_name'] || '';
        if (!userField.toLowerCase().includes(userFilter.toLowerCase())) {
          stats.skipped++;
          continue;
        }
      }

      // Extract call data from CSV
      // CSV columns from OpenPhone export may vary - try multiple field names
      const callId = record['Call ID'] || record['CallID'] || record['ID'] || record['id'] || record['call_id'];
      const direction = (record['Direction'] || record['direction'] || record['Type'] || record['type'] || '').toLowerCase();
      const fromNumber = record['From'] || record['from'] || record['From Number'] || record['from_number'] || '';
      const toNumber = record['To'] || record['to'] || record['To Number'] || record['to_number'] || '';
      const duration = parseInt(record['Duration'] || record['duration'] || '0', 10);
      const status = (record['Status'] || record['status'] || record['Call Status'] || 'completed').toLowerCase();
      const dateStr = record['Date'] || record['date'] || record['Created At'] || record['created_at'] || record['Timestamp'] || record['timestamp'];
      const userId = record['User ID'] || record['user_id'] || record['UserId'] || null;
      const phoneNumberId = record['Phone Number ID'] || record['phone_number_id'] || record['PhoneNumberId'] || 
                           (direction === 'outgoing' ? outboundPhoneId : mainPhoneId) || null;

      if (!callId) {
        stats.errors.push(`Row ${stats.processed}: Missing Call ID`);
        continue;
      }

      if (!direction || (direction !== 'incoming' && direction !== 'outgoing')) {
        stats.errors.push(`Row ${stats.processed}: Invalid direction "${direction}"`);
        continue;
      }

      const createdAt = dateStr ? new Date(dateStr) : new Date();

      console.log(`[CSV Import] Processing call ${callId} (${direction})`);

      // Check if call already exists
      const existing = await db
        .select()
        .from(calls)
        .where(eq(calls.callId, callId))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[CSV Import] Call ${callId} already exists, skipping`);
        stats.skipped++;
        continue;
      }

      // Insert call
      await db.insert(calls).values({
        callId,
        phoneNumberId: phoneNumberId || (direction === 'outgoing' ? outboundPhoneId : mainPhoneId),
        fromNumber,
        toNumber,
        direction: direction as 'incoming' | 'outgoing',
        status: status || 'completed',
        duration,
        createdAt,
        completedAt: status === 'completed' ? createdAt : null,
        userId,
        participants: JSON.stringify([]),
        metadata: JSON.stringify({
          importedFrom: 'csv',
          importedAt: new Date().toISOString(),
          csvUser: record['User'] || record['user'] || record['User Name'] || '',
        }),
      });

      stats.imported++;
      console.log(`[CSV Import] ✓ Call ${callId} imported`);

      // Fetch transcript from OpenPhone API
      if (status === 'completed' && duration > 0) {
        try {
          console.log(`[CSV Import] Fetching transcript for ${callId}...`);
          const transcriptResponse = await fetchTranscript(callId);
          const transcript = transcriptResponse.data;

          if (transcript && transcript.dialogue && transcript.dialogue.length > 0) {
            const fullText = transcript.dialogue
              .map(segment => `${segment.speaker}: ${segment.text}`)
              .join("\n");

            const transcriptData = {
              callId: transcript.callId,
              fullText,
              jsonPayload: {
                segments: transcript.dialogue.map(d => ({
                  start: d.start,
                  end: d.end,
                  speaker: d.speaker,
                  text: d.text,
                })),
              },
              duration: transcript.duration,
              status: transcript.status,
            };

            // Check if transcript already exists
            const existingTranscript = await db
              .select()
              .from(transcripts)
              .where(eq(transcripts.callId, callId))
              .limit(1);

            if (existingTranscript.length > 0) {
              await db
                .update(transcripts)
                .set(transcriptData)
                .where(eq(transcripts.callId, callId));
            } else {
              await db.insert(transcripts).values(transcriptData);
            }

            stats.transcriptsFetched++;
            console.log(`[CSV Import] ✓ Transcript fetched for ${callId}`);

            // Auto-analyze if enabled and transcript has content
            if (autoAnalyze && fullText.trim().length > 0) {
              try {
                await analyzeCall({
                  callId,
                  phoneNumberId: phoneNumberId || (direction === 'outgoing' ? outboundPhoneId : mainPhoneId),
                  callDirection: direction as 'incoming' | 'outgoing',
                });
                stats.analyzed++;
                console.log(`[CSV Import] ✓ Call ${callId} analyzed`);
              } catch (analysisError) {
                console.error(`[CSV Import] Analysis failed for ${callId}:`, analysisError);
              }
            }
          } else {
            console.log(`[CSV Import] No transcript available for ${callId}`);
          }
        } catch (transcriptError) {
          // Transcript might not be available - that's okay
          if (transcriptError instanceof Error && !transcriptError.message.includes('404')) {
            console.error(`[CSV Import] Transcript fetch error for ${callId}:`, transcriptError);
          }
        }
      }

      // Rate limiting: delay between calls to avoid API throttling
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

      // Progress update every 10 calls
      if (stats.processed % 10 === 0) {
        console.log(`[CSV Import] Progress: ${stats.processed}/${records.length} processed, ${stats.imported} imported`);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const callId = record['Call ID'] || record['CallID'] || record['ID'] || 'unknown';
      stats.errors.push(`Call ${callId}: ${errorMsg}`);
      console.error(`[CSV Import] Error processing call ${callId}:`, errorMsg);
    }
  }

  console.log('[CSV Import] ═══════════════════════════════════');
  console.log('[CSV Import] Import Complete!');
  console.log('[CSV Import] ═══════════════════════════════════');
  console.log(`[CSV Import] Processed: ${stats.processed}`);
  console.log(`[CSV Import] Imported: ${stats.imported}`);
  console.log(`[CSV Import] Transcripts fetched: ${stats.transcriptsFetched}`);
  console.log(`[CSV Import] Analyzed: ${stats.analyzed}`);
  console.log(`[CSV Import] Skipped: ${stats.skipped}`);
  console.log(`[CSV Import] Errors: ${stats.errors.length}`);
  if (stats.errors.length > 0 && stats.errors.length <= 20) {
    console.log('[CSV Import] Error details:');
    stats.errors.forEach(err => console.log(`  - ${err}`));
  } else if (stats.errors.length > 20) {
    console.log(`[CSV Import] First 20 errors:`);
    stats.errors.slice(0, 20).forEach(err => console.log(`  - ${err}`));
  }
  console.log('[CSV Import] ═══════════════════════════════════');

  return stats;
}

