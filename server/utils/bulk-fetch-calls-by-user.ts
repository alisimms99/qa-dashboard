/**
 * Bulk Fetch Calls by User
 * Fetches ALL historical calls from OpenPhone API, filters by user, and processes them
 */

import 'dotenv/config'; // Load environment variables from .env file

import { getDb } from '../db';
import { calls, transcripts } from '../../drizzle/schema';
import { fetchCalls, fetchTranscript } from '../openphone';
import { analyzeCall } from '../analysis';
import { eq } from 'drizzle-orm';
import { extractParticipantsFromCSV } from './extract-participants-from-csv';

export interface BulkFetchOptions {
  userId: string; // OpenPhone user ID (email address)
  phoneNumberId?: string; // Optional: specific phone number to query (if not provided, queries both)
  direction?: 'incoming' | 'outgoing'; // Optional: filter by direction
  startDate?: Date; // Optional: only import calls after this date
  endDate?: Date; // Optional: only import calls before this date
  maxCalls?: number; // Safety limit (default 500)
  autoAnalyze?: boolean; // Auto-analyze calls with transcripts (default true)
  delayMs?: number; // Delay between API calls in milliseconds (default 1500)
  csvPaths?: string[]; // Optional: CSV file paths to extract participants from
  participantBatchSize?: number; // Must be 1 - OpenPhone API limitation (only allows 1 participant per request)
}

export interface BulkFetchStats {
  totalCallsFetched: number;
  userCallsFound: number;
  callsImported: number;
  callsSkipped: number;
  transcriptsFetched: number;
  transcriptsEmpty: number;
  transcriptsFailed: number;
  callsAnalyzed: number;
  errors: string[];
}

/**
 * Fetch transcript for a call and save to database
 * 
 * IMPORTANT: OpenPhone API returns "dialogue" array, NOT "segments"
 * - API response: { data: { dialogue: [...] } }
 * - We transform dialogue → segments for database storage
 */
async function fetchTranscriptForCall(callId: string): Promise<{ fullText: string; wordCount: number } | null> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    const response = await fetchTranscript(callId);
    const transcript = response.data;

    // OpenPhone API returns dialogue array (NOT segments)
    if (!transcript || !transcript.dialogue || transcript.dialogue.length === 0) {
      return null;
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
    const transcriptData = {
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

    const wordCount = fullText.split(/\s+/).length;
    return { fullText, wordCount };
  } catch (error) {
    // If transcript doesn't exist (404), that's okay
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    throw error;
  }
}

export async function bulkFetchCallsByUser(options: BulkFetchOptions): Promise<BulkFetchStats> {
  const {
    userId,
    phoneNumberId,
    direction,
    startDate,
    endDate,
    maxCalls = 500,
    autoAnalyze = true,
    delayMs = 1500,
    csvPaths = [],
    participantBatchSize = 1, // OpenPhone only allows 1 participant per request
  } = options;

  console.log('[Bulk Fetch] ═══════════════════════════════════════');
  console.log('[Bulk Fetch] Starting bulk import');
  console.log('[Bulk Fetch] User:', userId);
  if (phoneNumberId) {
    const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID;
    const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID;
    const phoneName = phoneNumberId === mainPhoneId ? 'Main Business Number' : 
                     phoneNumberId === outboundPhoneId ? 'OJPM Operations' : 
                     'Unknown Phone Number';
    console.log('[Bulk Fetch] Phone Number:', phoneName);
  } else {
    console.log('[Bulk Fetch] Phone Number: both (main + outbound)');
  }
  console.log('[Bulk Fetch] Direction:', direction || 'all');
  console.log('[Bulk Fetch] Max calls:', maxCalls);
  console.log('[Bulk Fetch] Auto-analyze:', autoAnalyze);
  console.log('[Bulk Fetch] Rate limit delay:', delayMs, 'ms');
  console.log('[Bulk Fetch] ═══════════════════════════════════════');

  const stats: BulkFetchStats = {
    totalCallsFetched: 0,
    userCallsFound: 0,
    callsImported: 0,
    callsSkipped: 0,
    transcriptsFetched: 0,
    transcriptsEmpty: 0,
    transcriptsFailed: 0,
    callsAnalyzed: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Get phone number IDs from environment
  const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID;
  const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID;

  if (!mainPhoneId || !outboundPhoneId) {
    throw new Error('Missing OPENPHONE_MAIN_PHONE_NUMBER_ID or OPENPHONE_OUTBOUND_PHONE_NUMBER_ID in .env');
  }

  // Use specified phone number, or default to both
  const phoneNumbers = phoneNumberId
    ? [{ 
        id: phoneNumberId, 
        name: phoneNumberId === mainPhoneId ? 'Main Business Number' : 
              phoneNumberId === outboundPhoneId ? 'OJPM Operations' : 
              'Unknown Phone Number'
      }]
    : [
        { id: mainPhoneId, name: 'Main Business Number' },
        { id: outboundPhoneId, name: 'OJPM Operations' },
      ];

  // Fetch calls from each phone number
  for (const phone of phoneNumbers) {
    console.log(`\n[Bulk Fetch] ───────────────────────────────────────`);
    console.log(`[Bulk Fetch] Fetching calls for: ${phone.name}`);
    console.log(`[Bulk Fetch] ───────────────────────────────────────`);

    try {
      let callsForPhone: any[] = [];

      // Extract participants from CSV files if provided
      let allParticipants: string[] = [];
      if (csvPaths && csvPaths.length > 0) {
        console.log(`[Bulk Fetch] Extracting participants from ${csvPaths.length} CSV file(s)...`);
        for (const csvPath of csvPaths) {
          const participants = extractParticipantsFromCSV(csvPath);
          allParticipants.push(...participants);
        }
        // Remove duplicates
        allParticipants = Array.from(new Set(allParticipants));
        console.log(`[Bulk Fetch] Found ${allParticipants.length} unique participants`);
        console.log(`[Bulk Fetch] Will make ${allParticipants.length} API requests (1 participant per request due to OpenPhone limitation)`);
        const estimatedMinutes = Math.ceil((allParticipants.length * 2) / 60);
        console.log(`[Bulk Fetch] Estimated API fetch time: ~${estimatedMinutes} minutes (2 second delay between requests)`);
      }

      if (allParticipants.length === 0) {
        console.log(`[Bulk Fetch] ⚠️ No participants found in CSV files. Fetching without participants filter...`);
        console.log(`[Bulk Fetch] Note: OpenPhone API may return limited results without participants parameter.`);
        
        // Fallback: try fetching without participants (may return limited results)
        let pageToken: string | undefined;
        let pageCount = 0;
        
        do {
          pageCount++;
          console.log(`[Bulk Fetch] Fetching page ${pageCount}...`);

          const response = await fetchCalls({
            phoneNumberId: phone.id,
            maxResults: 100,
            pageToken,
          });

          const fetchedCalls = response.data || [];
          callsForPhone.push(...fetchedCalls);
          stats.totalCallsFetched += fetchedCalls.length;

          pageToken = response.nextPageToken;

          console.log(`[Bulk Fetch] Page ${pageCount}: ${fetchedCalls.length} calls (total for ${phone.name}: ${callsForPhone.length})`);

          if (callsForPhone.length >= maxCalls) {
            console.log(`[Bulk Fetch] ⚠️ Reached max calls limit (${maxCalls})`);
            break;
          }

          if (pageToken) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } while (pageToken);
      } else {
        // Batch participants (OpenPhone only allows 1 participant per request)
        const batches: string[][] = [];
        for (let i = 0; i < allParticipants.length; i += participantBatchSize) {
          batches.push(allParticipants.slice(i, i + participantBatchSize));
        }

        console.log(`[Bulk Fetch] Processing ${batches.length} participant requests...`);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          const participant = batch[0]; // Only one participant per batch
          console.log(`[Bulk Fetch] Request ${batchIndex + 1}/${batches.length}: Participant ${participant.substring(0, 12)}...`);

          let pageToken: string | undefined;
          let pageCount = 0;

          do {
            pageCount++;
            console.log(`[Bulk Fetch]   Fetching page ${pageCount} for participant ${batchIndex + 1}...`);

            try {
              const response = await fetchCalls({
                phoneNumberId: phone.id,
                participants: batch, // batch contains only 1 participant due to OpenPhone limitation
                maxResults: 100,
                pageToken,
              });

              const fetchedCalls = response.data || [];
              callsForPhone.push(...fetchedCalls);
              stats.totalCallsFetched += fetchedCalls.length;

              pageToken = response.nextPageToken;

              console.log(`[Bulk Fetch]   Page ${pageCount}: ${fetchedCalls.length} calls (total so far: ${callsForPhone.length})`);

              if (callsForPhone.length >= maxCalls) {
                console.log(`[Bulk Fetch] ⚠️ Reached max calls limit (${maxCalls})`);
                break;
              }

              if (pageToken) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              console.error(`[Bulk Fetch]   ❌ Error fetching participant ${batchIndex + 1}, page ${pageCount}: ${errorMsg}`);
              stats.errors.push(`Participant ${batchIndex + 1}: ${errorMsg}`);
              break; // Skip to next batch
            }
          } while (pageToken);

          // Delay between participant requests (2 seconds to avoid rate limiting)
          // With 190 participants, this adds ~6-7 minutes to the import time
          if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      // Remove duplicates (in case same call appears in multiple batches)
      const uniqueCalls = new Map<string, any>();
      callsForPhone.forEach(call => {
        if (!uniqueCalls.has(call.id)) {
          uniqueCalls.set(call.id, call);
        }
      });
      callsForPhone = Array.from(uniqueCalls.values());

      console.log(`[Bulk Fetch] Total unique calls fetched for ${phone.name}: ${callsForPhone.length}`);

      // DEBUG: Log unique userIds found in the API response
      if (callsForPhone.length > 0) {
        const uniqueUserIds = [...new Set(callsForPhone.map(call => call.userId).filter(Boolean))];
        console.log(`[Bulk Fetch] DEBUG: Unique userIds found in API response:`);
        uniqueUserIds.forEach(id => {
          const count = callsForPhone.filter(c => c.userId === id).length;
          console.log(`[Bulk Fetch]   - "${id}": ${count} calls`);
        });
        console.log(`[Bulk Fetch] DEBUG: Filtering for userId: "${userId}"`);

        // Show first call as example
        console.log(`[Bulk Fetch] DEBUG: Sample call data:`, {
          id: callsForPhone[0].id,
          userId: callsForPhone[0].userId,
          direction: callsForPhone[0].direction,
          participants: callsForPhone[0].participants,
        });
      }

      // Filter by userId (strict match)
      let userCalls = callsForPhone.filter(call => call.userId === userId);
      console.log(`[Bulk Fetch] Calls for user ${userId} (exact match): ${userCalls.length}`);

      // If no matches found, try partial email match (before @ symbol)
      if (userCalls.length === 0 && userId.includes('@')) {
        const emailPrefix = userId.split('@')[0]; // e.g., "operations"
        console.log(`[Bulk Fetch] No exact matches, trying partial match with: "${emailPrefix}"`);

        userCalls = callsForPhone.filter(call =>
          call.userId?.includes(emailPrefix) ||
          call.userId?.includes(userId)
        );

        console.log(`[Bulk Fetch] Calls with partial match: ${userCalls.length}`);
      }

      // If still no matches, log warning and show available userIds
      if (userCalls.length === 0) {
        const availableUserIds = [...new Set(callsForPhone.map(c => c.userId).filter(Boolean))];
        console.log(`[Bulk Fetch] ⚠️ WARNING: No calls matched userId filter`);
        console.log(`[Bulk Fetch] Available userIds: ${availableUserIds.join(', ')}`);
        console.log(`[Bulk Fetch] NOTE: Continuing with 0 calls for this phone number`);
        console.log(`[Bulk Fetch] TIP: Check if userId format matches (email vs user ID vs name)`);
      }

      // Filter by direction if specified
      if (direction) {
        userCalls = userCalls.filter(call => call.direction === direction);
        console.log(`[Bulk Fetch] After direction filter (${direction}): ${userCalls.length}`);
      }

      // Filter by date range if specified
      if (startDate) {
        userCalls = userCalls.filter(call => new Date(call.createdAt) >= startDate);
        console.log(`[Bulk Fetch] After start date filter: ${userCalls.length}`);
      }

      if (endDate) {
        userCalls = userCalls.filter(call => new Date(call.createdAt) <= endDate);
        console.log(`[Bulk Fetch] After end date filter: ${userCalls.length}`);
      }

      stats.userCallsFound += userCalls.length;

      // Process each call
      console.log(`\n[Bulk Fetch] Processing ${userCalls.length} calls...`);

      for (let i = 0; i < userCalls.length; i++) {
        const call = userCalls[i];

        console.log(`\n[Bulk Fetch] [${i + 1}/${userCalls.length}] Processing call ${call.id}`);
        console.log(`[Bulk Fetch]   Direction: ${call.direction}`);
        console.log(`[Bulk Fetch]   Duration: ${call.duration}s`);
        console.log(`[Bulk Fetch]   Date: ${new Date(call.createdAt).toLocaleString()}`);

        try {
          // Check if call already exists
          const existing = await db
            .select()
            .from(calls)
            .where(eq(calls.callId, call.id))
            .limit(1);

          if (existing.length > 0) {
            console.log(`[Bulk Fetch]   ⏭️  Already exists, skipping`);
            stats.callsSkipped++;
            continue;
          }

          // Extract participant phone numbers
          const participants = call.participants || [];
          const fromNumber = call.direction === 'incoming'
            ? (participants[1]?.phoneNumber || call.from || '')
            : (participants[0]?.phoneNumber || call.from || '');

          const toNumber = call.direction === 'incoming'
            ? (participants[0]?.phoneNumber || call.to || '')
            : (participants[1]?.phoneNumber || call.to || '');

          // Insert call into database
          await db.insert(calls).values({
            callId: call.id,
            phoneNumberId: call.phoneNumberId,
            fromNumber,
            toNumber,
            direction: call.direction as 'incoming' | 'outgoing',
            status: call.status || 'completed',
            duration: call.duration || 0,
            createdAt: call.createdAt ? new Date(call.createdAt) : new Date(),
            answeredAt: call.answeredAt ? new Date(call.answeredAt) : null,
            completedAt: call.completedAt ? new Date(call.completedAt) : null,
            userId: call.userId,
            metadata: JSON.stringify({
              bulkImport: true,
              importedAt: new Date().toISOString(),
              answeredBy: call.answeredBy,
              initiatedBy: call.initiatedBy,
              participants: participants,
            }),
          });

          stats.callsImported++;
          console.log(`[Bulk Fetch]   ✅ Call imported to database`);

          // Fetch transcript
          if (call.status === 'completed' && call.duration > 0) {
            console.log(`[Bulk Fetch]   📝 Fetching transcript...`);

            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, delayMs));

            try {
              const transcriptResult = await fetchTranscriptForCall(call.id);

              if (transcriptResult && transcriptResult.fullText.trim().length > 0) {
                stats.transcriptsFetched++;
                console.log(`[Bulk Fetch]   ✅ Transcript fetched (${transcriptResult.wordCount} words)`);

                // Auto-analyze if enabled
                if (autoAnalyze) {
                  console.log(`[Bulk Fetch]   🤖 Analyzing call...`);

                  try {
                    await analyzeCall({
                      callId: call.id,
                      phoneNumberId: call.phoneNumberId,
                      callDirection: call.direction as 'incoming' | 'outgoing',
                    });

                    stats.callsAnalyzed++;
                    console.log(`[Bulk Fetch]   ✅ Analysis complete`);
                  } catch (analysisError) {
                    const errorMsg = analysisError instanceof Error ? analysisError.message : String(analysisError);
                    console.log(`[Bulk Fetch]   ⚠️  Analysis failed: ${errorMsg}`);
                    stats.errors.push(`Analysis failed for ${call.id}: ${errorMsg}`);
                  }
                }
              } else {
                stats.transcriptsEmpty++;
                console.log(`[Bulk Fetch]   ⚠️  No transcript available (empty or missing)`);
              }
            } catch (transcriptError) {
              stats.transcriptsFailed++;
              const errorMsg = transcriptError instanceof Error ? transcriptError.message : String(transcriptError);
              console.log(`[Bulk Fetch]   ❌ Transcript fetch failed: ${errorMsg}`);
              stats.errors.push(`Transcript fetch failed for ${call.id}: ${errorMsg}`);
            }
          } else {
            console.log(`[Bulk Fetch]   ⏭️  Skipping transcript (not completed or no duration)`);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`[Bulk Fetch]   ❌ Error processing call: ${errorMsg}`);
          stats.errors.push(`Call ${call.id}: ${errorMsg}`);
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Bulk Fetch] ❌ Error fetching calls for ${phone.name}:`, errorMsg);
      stats.errors.push(`Phone ${phone.name}: ${errorMsg}`);
    }
  }

  // Print final summary
  console.log('\n[Bulk Fetch] ═══════════════════════════════════════');
  console.log('[Bulk Fetch] IMPORT COMPLETE');
  console.log('[Bulk Fetch] ═══════════════════════════════════════');
  console.log(`[Bulk Fetch] Total calls fetched from API: ${stats.totalCallsFetched}`);
  console.log(`[Bulk Fetch] Calls matching user filter: ${stats.userCallsFound}`);
  console.log(`[Bulk Fetch] New calls imported: ${stats.callsImported}`);
  console.log(`[Bulk Fetch] Existing calls skipped: ${stats.callsSkipped}`);
  console.log(`[Bulk Fetch] ───────────────────────────────────────`);
  console.log(`[Bulk Fetch] Transcripts fetched: ${stats.transcriptsFetched}`);
  console.log(`[Bulk Fetch] Transcripts empty/missing: ${stats.transcriptsEmpty}`);
  console.log(`[Bulk Fetch] Transcript fetch failures: ${stats.transcriptsFailed}`);
  console.log(`[Bulk Fetch] ───────────────────────────────────────`);
  console.log(`[Bulk Fetch] Calls analyzed: ${stats.callsAnalyzed}`);
  console.log(`[Bulk Fetch] Errors: ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log(`[Bulk Fetch] ───────────────────────────────────────`);
    console.log(`[Bulk Fetch] Error details:`);
    stats.errors.slice(0, 10).forEach(err => console.log(`[Bulk Fetch]   • ${err}`));
    if (stats.errors.length > 10) {
      console.log(`[Bulk Fetch]   ... and ${stats.errors.length - 10} more errors`);
    }
  }

  console.log('[Bulk Fetch] ═══════════════════════════════════════\n');

  return stats;
}

