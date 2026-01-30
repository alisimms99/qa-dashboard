/**
 * Historical Call Import Tool
 * Bulk import historical calls and transcripts from OpenPhone
 */

import { getDb } from '../db';
import { calls, transcripts, analyses } from '../../drizzle/schema';
import { fetchCalls, fetchTranscript } from '../openphone';
import { analyzeCall } from '../analysis';
import { eq } from 'drizzle-orm';

export interface HistoricalImportOptions {
  userId?: string; // OpenPhone user ID to filter by
  phoneNumberId?: string; // Phone number to filter by
  startDate?: Date; // Import calls after this date
  endDate?: Date; // Import calls before this date
  autoAnalyze?: boolean; // Default true
  maxCalls?: number; // Safety limit, default 1000
}

export interface HistoricalImportStats {
  callsFetched: number;
  callsNew: number;
  callsUpdated: number;
  transcriptsFetched: number;
  analyzed: number;
  errors: string[];
}

export async function importHistoricalCalls(options: HistoricalImportOptions = {}): Promise<HistoricalImportStats> {
  const {
    userId,
    phoneNumberId,
    startDate,
    endDate,
    autoAnalyze = true,
    maxCalls = 1000,
  } = options;

  console.log('[Historical Import] ═══════════════════════════════════');
  console.log('[Historical Import] Starting bulk import...');
  console.log('[Historical Import] Options:', {
    userId: userId || 'all users',
    phoneNumberId: phoneNumberId || 'all numbers',
    startDate: startDate?.toISOString() || 'beginning of time',
    endDate: endDate?.toISOString() || 'now',
    autoAnalyze,
    maxCalls,
  });
  console.log('[Historical Import] ═══════════════════════════════════');

  const stats: HistoricalImportStats = {
    callsFetched: 0,
    callsNew: 0,
    callsUpdated: 0,
    transcriptsFetched: 0,
    analyzed: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID;
  const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID;

  if (!mainPhoneId && !outboundPhoneId) {
    throw new Error('No phone number IDs configured. Set OPENPHONE_MAIN_PHONE_NUMBER_ID and/or OPENPHONE_OUTBOUND_PHONE_NUMBER_ID');
  }

  // Import calls for each phone number
  const phoneNumbersToImport = phoneNumberId 
    ? [phoneNumberId]
    : [mainPhoneId, outboundPhoneId].filter(Boolean) as string[];

  for (const targetPhoneId of phoneNumbersToImport) {
    console.log(`[Historical Import] Processing phone number: ${targetPhoneId}`);
    
    let pageToken: string | undefined = undefined;
    let pageCount = 0;

    do {
      try {
        pageCount++;
        console.log(`[Historical Import] Fetching page ${pageCount}... (total calls so far: ${stats.callsFetched})`);

        const createdAfter = startDate ? startDate.toISOString() : undefined;
        const createdBefore = endDate ? endDate.toISOString() : undefined;

        const response = await fetchCalls({
          phoneNumberId: targetPhoneId,
          maxResults: 50, // OpenPhone API limit
          pageToken,
          createdAfter,
          createdBefore,
        });

        const fetchedCalls = response.data || [];
        stats.callsFetched += fetchedCalls.length;

        console.log(`[Historical Import] Fetched ${fetchedCalls.length} calls from page ${pageCount}`);

        // Process each call
        for (const call of fetchedCalls) {
          try {
            // Check if call already exists
            const existing = await db
              .select()
              .from(calls)
              .where(eq(calls.callId, call.id))
              .limit(1);

            const callData = {
              callId: call.id,
              phoneNumberId: call.phoneNumberId,
              fromNumber: call.from || call.participants?.[0]?.phoneNumber || '',
              toNumber: call.to || call.participants?.[1]?.phoneNumber || '',
              direction: call.direction as 'incoming' | 'outgoing',
              status: call.status || 'completed',
              duration: call.duration || 0,
              createdAt: call.createdAt ? new Date(call.createdAt) : new Date(),
              answeredAt: call.answeredAt ? new Date(call.answeredAt) : null,
              completedAt: call.completedAt ? new Date(call.completedAt) : null,
              userId: call.userId || userId || null,
              participants: JSON.stringify(call.participants || []),
              metadata: JSON.stringify({
                importedFrom: 'historical-import',
                importedAt: new Date().toISOString(),
                phoneLine: targetPhoneId === mainPhoneId ? 'main' : 
                          targetPhoneId === outboundPhoneId ? 'outbound' : 'unknown',
              }),
            };

            if (existing.length > 0) {
              // Update existing call
              await db
                .update(calls)
                .set(callData)
                .where(eq(calls.callId, call.id));
              stats.callsUpdated++;
            } else {
              // Insert new call
              await db.insert(calls).values(callData);
              stats.callsNew++;
            }

            // Fetch transcript if call is completed
            if (call.status === 'completed' && call.duration > 0) {
              try {
                const transcriptResponse = await fetchTranscript(call.id);
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

                  const existingTranscript = await db
                    .select()
                    .from(transcripts)
                    .where(eq(transcripts.callId, call.id))
                    .limit(1);

                  if (existingTranscript.length > 0) {
                    await db
                      .update(transcripts)
                      .set(transcriptData)
                      .where(eq(transcripts.callId, call.id));
                  } else {
                    await db.insert(transcripts).values(transcriptData);
                  }

                  stats.transcriptsFetched++;

                  // Auto-analyze if enabled
                  if (autoAnalyze && fullText.trim().length > 0) {
                    try {
                      await analyzeCall({
                        callId: call.id,
                        phoneNumberId: call.phoneNumberId,
                        callDirection: call.direction as 'incoming' | 'outgoing',
                      });
                      stats.analyzed++;
                    } catch (analysisError) {
                      console.error(`[Historical Import] Analysis failed for ${call.id}:`, analysisError);
                    }
                  }
                }
              } catch (transcriptError) {
                // Transcript might not be available yet - that's okay
                if (transcriptError instanceof Error && !transcriptError.message.includes('404')) {
                  console.error(`[Historical Import] Transcript fetch error for ${call.id}:`, transcriptError);
                }
              }
            }

            // Rate limiting: small delay between calls
            await new Promise(resolve => setTimeout(resolve, 200));

          } catch (callError) {
            const errorMsg = callError instanceof Error ? callError.message : String(callError);
            stats.errors.push(`Call ${call.id}: ${errorMsg}`);
            console.error(`[Historical Import] Error processing call ${call.id}:`, errorMsg);
          }
        }

        pageToken = response.nextPageToken;
        
        // Rate limiting: delay between pages
        if (pageToken) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (stats.callsFetched >= maxCalls) {
          console.log(`[Historical Import] Reached max calls limit (${maxCalls})`);
          break;
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        stats.errors.push(`Page ${pageCount}: ${errorMsg}`);
        console.error(`[Historical Import] Error fetching page ${pageCount}:`, errorMsg);
        break;
      }
    } while (pageToken);

    console.log(`[Historical Import] Completed import for phone number ${targetPhoneId}`);
  }

  console.log('[Historical Import] ═══════════════════════════════════');
  console.log('[Historical Import] Import Complete!');
  console.log('[Historical Import] ═══════════════════════════════════');
  console.log(`[Historical Import] Calls fetched: ${stats.callsFetched}`);
  console.log(`[Historical Import] New calls: ${stats.callsNew}`);
  console.log(`[Historical Import] Updated calls: ${stats.callsUpdated}`);
  console.log(`[Historical Import] Transcripts fetched: ${stats.transcriptsFetched}`);
  console.log(`[Historical Import] Analyzed: ${stats.analyzed}`);
  console.log(`[Historical Import] Errors: ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log('[Historical Import] Error details:', stats.errors.slice(0, 10));
  }
  console.log('[Historical Import] ═══════════════════════════════════');

  return stats;
}

/**
 * Request webhook replay from OpenPhone support
 * This is an informational function - actual replay must be requested from OpenPhone
 */
export async function requestWebhookReplay(options: {
  startDate: Date;
  endDate: Date;
  phoneNumberId: string;
}) {
  console.log('[Historical Import] ═══════════════════════════════════');
  console.log('[Historical Import] Webhook Replay Instructions');
  console.log('[Historical Import] ═══════════════════════════════════');
  console.log('');
  console.log('To request webhook replay from OpenPhone:');
  console.log('');
  console.log('1. Go to OpenPhone support: https://support.openphone.com');
  console.log('2. Request webhook replay for date range:');
  console.log(`   - Start: ${options.startDate.toISOString()}`);
  console.log(`   - End: ${options.endDate.toISOString()}`);
  console.log(`   - Phone Number ID: ${options.phoneNumberId}`);
  console.log('3. Provide your webhook URL');
  console.log('4. They will replay all call.completed events');
  console.log('5. Your webhook will receive all historical calls');
  console.log('');
  console.log('[Historical Import] ═══════════════════════════════════');

  return {
    message: 'Contact OpenPhone support to request webhook replay for historical data',
    instructions: [
      '1. Go to OpenPhone support: https://support.openphone.com',
      '2. Request webhook replay for date range',
      '3. Provide your webhook URL',
      '4. They will replay all call.completed events',
      '5. Your webhook will receive all historical calls',
    ],
  };
}

