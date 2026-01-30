/**
 * OpenPhone Webhook Receiver
 * Handles call.completed events from OpenPhone API
 */

import express from 'express';
import { getDb } from '../db';
import { calls, transcripts, InsertCall, InsertTranscript, webhookHealth, InsertWebhookHealth } from '../../drizzle/schema';
import { fetchTranscript } from '../openphone';
import { analyzeCall } from '../analysis';
import { eq } from 'drizzle-orm';

export const openphoneWebhookRouter = express.Router();

/**
 * Fetch and save transcript for a call
 * 
 * IMPORTANT: OpenPhone API returns "dialogue" array, NOT "segments"
 * - API response: { data: { dialogue: [...] } }
 * - We transform dialogue → segments for database storage
 */
async function fetchTranscriptForCall(callId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    const response = await fetchTranscript(callId);
    const transcript = response.data;

    // OpenPhone API returns dialogue array (NOT segments)
    if (!transcript || !transcript.dialogue || transcript.dialogue.length === 0) {
      console.log(`[Webhook] No transcript dialogue available for call ${callId}`);
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

// Webhook endpoint for OpenPhone call events
// Note: express.json() is already applied globally in server/_core/index.ts
openphoneWebhookRouter.post('/webhooks/openphone/calls', async (req, res) => {
  try {
    console.log('[Webhook] ═══════════════════════════════════════');
    console.log('[Webhook] Received OpenPhone webhook event');
    console.log('[Webhook] Event type:', req.body.type);
    console.log('[Webhook] Timestamp:', new Date().toISOString());
    console.log('[Webhook] ═══════════════════════════════════════');

    // Log the entire payload to see what OpenPhone is actually sending
    console.log('[Webhook] RAW PAYLOAD:');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('[Webhook] ═══════════════════════════════════════');

    const { data, type } = req.body;

    // Extract the actual call object from the nested structure
    // OpenPhone sends: { data: { object: { ...call data... } } }
    const callData = data?.object || data;

    // Track webhook health
    try {
      const db = await getDb();
      if (db) {
        const healthRecord: InsertWebhookHealth = {
          lastWebhookReceived: new Date(),
          eventType: type,
          callId: callData?.id || callData?.callId || null,
        };
        await db.insert(webhookHealth).values(healthRecord);
        console.log(`[Webhook] ✅ Health tracked: ${type} event`);
      }
    } catch (healthError) {
      // Don't fail webhook processing if health tracking fails
      console.error('[Webhook] Failed to track health:', healthError);
    }

    // Comprehensive logging of call data structure
    console.log('[Webhook] ═══════════════════════════════════════');
    console.log('[Webhook] DETAILED CALL DATA ANALYSIS:');
    console.log('[Webhook] ═══════════════════════════════════════');
    console.log('[Webhook] Call ID:', callData?.id);
    console.log('[Webhook] Phone Number ID:', callData?.phoneNumberId);
    console.log('[Webhook] Direction:', callData?.direction);
    console.log('[Webhook] Duration (raw):', callData?.duration, `(type: ${typeof callData?.duration})`);
    console.log('[Webhook] Status:', callData?.status);
    console.log('[Webhook] Created At:', callData?.createdAt);
    console.log('[Webhook] Answered At:', callData?.answeredAt);
    console.log('[Webhook] Completed At:', callData?.completedAt);
    console.log('[Webhook] User ID:', callData?.userId);
    console.log('[Webhook] Answered By:', callData?.answeredBy);
    console.log('[Webhook] Initiated By:', callData?.initiatedBy);
    console.log('[Webhook] Participants (raw):', JSON.stringify(callData?.participants, null, 2));
    console.log('[Webhook] Participants count:', callData?.participants?.length || 0);
    console.log('[Webhook] Full callData keys:', Object.keys(callData || {}));
    console.log('[Webhook] ═══════════════════════════════════════');

    // Process both call.completed AND call.transcript.completed events
    const isCallCompleted = type === 'call.completed';
    const isTranscriptCompleted = type === 'call.transcript.completed';
    
    if (!isCallCompleted && !isTranscriptCompleted) {
      console.log(`[Webhook] Ignoring event type: ${type}`);
      return res.status(200).json({ received: true, processed: false, reason: `Not a call event (type: ${type})` });
    }
    
    console.log(`[Webhook] Processing ${type} event`);

    // Handle different data structures for call.completed vs call.transcript.completed
    let callId: string;
    let phoneNumberId: string | undefined;
    let direction: string | undefined;
    let duration: number;
    let status: string;
    let fromNumber: string = '';
    let toNumber: string = '';
    let participants: any[] = [];
    let dialogue: any[] = [];
    let createdAt: Date | null = null;
    let answeredAt: Date | null = null;
    let completedAt: Date | null = null;
    let userId: string | undefined;
    let answeredBy: string | undefined;
    let initiatedBy: string | undefined;
    
    if (isTranscriptCompleted) {
      // call.transcript.completed has a different structure
      // Data is directly in the event.data object
      console.log('[Webhook] Processing call.transcript.completed event');
      
      callId = callData.callId || callData.id;
      duration = callData.duration || 0;
      status = callData.status || 'completed';
      
      // CRITICAL: Extract dialogue from multiple possible locations
      // OpenPhone may send dialogue in different places in the payload
      dialogue = callData.dialogue || callData.transcript?.dialogue || data?.dialogue || [];
      
      console.log('[Webhook] Dialogue extraction:', {
        hasCallDataDialogue: !!callData.dialogue,
        hasCallDataTranscriptDialogue: !!callData.transcript?.dialogue,
        hasDataDialogue: !!data?.dialogue,
        dialogueLength: dialogue.length,
        firstDialogueItem: dialogue[0] || null,
      });
      
      // Validate dialogue structure
      if (dialogue.length > 0) {
        const firstItem = dialogue[0];
        const hasContent = firstItem?.content !== undefined;
        const hasIdentifier = firstItem?.identifier !== undefined || firstItem?.userId !== undefined;
        
        console.log('[Webhook] Dialogue validation:', {
          hasContent,
          hasIdentifier,
          firstItemKeys: Object.keys(firstItem || {}),
        });
        
        if (!hasContent) {
          console.error('[Webhook] ⚠️ WARNING: Dialogue items missing "content" field!');
          console.error('[Webhook] First dialogue item:', JSON.stringify(firstItem, null, 2));
        }
        
        // Try to extract from dialogue metadata or use first/last speaker
        const speakers = [...new Set(dialogue.map(d => d.userId || d.identifier || 'Unknown'))];
        console.log('[Webhook] Found speakers in dialogue:', speakers);
      }
      
      // For transcript.completed, we may need to fetch the call details separately
      // or they might be in the event metadata
      phoneNumberId = callData.phoneNumberId;
      direction = callData.direction;
      createdAt = callData.createdAt ? new Date(callData.createdAt) : new Date();
      completedAt = callData.completedAt ? new Date(callData.completedAt) : new Date();
      
      // Extract from/to from callData if available
      fromNumber = callData.from || '';
      toNumber = callData.to || '';
      participants = callData.participants || [];
      
      console.log('[Webhook] Transcript event data:', {
        callId,
        duration,
        status,
        dialogueLength: dialogue.length,
        phoneNumberId,
        direction,
      });
    } else {
      // call.completed event (original structure)
      console.log('[Webhook] Processing call.completed event');
      
      callId = callData.id;
      phoneNumberId = callData.phoneNumberId;
      direction = callData.direction;
      
      // Check if transcript data is embedded in call.completed event
      // Some webhook configurations might send transcript with call.completed
      if (callData.transcript?.dialogue || callData.dialogue) {
        dialogue = callData.transcript?.dialogue || callData.dialogue || [];
        console.log('[Webhook] Found transcript data in call.completed event:', {
          dialogueLength: dialogue.length,
          source: callData.transcript?.dialogue ? 'transcript.dialogue' : 'dialogue',
        });
      }
      
      // Log duration extraction in detail
      const rawDuration = callData.duration;
      console.log('[Webhook] Duration extraction:');
      console.log('  - Raw value:', rawDuration);
      console.log('  - Type:', typeof rawDuration);
      console.log('  - Is null?', rawDuration === null);
      console.log('  - Is undefined?', rawDuration === undefined);
      console.log('  - Is zero?', rawDuration === 0);
      
      duration = rawDuration || 0;
      console.log('  - Final duration:', duration);
      
      // Extract from/to from participants array
      participants = callData.participants || [];
      
      console.log('[Webhook] Participant extraction:');
      console.log('  - Participants array:', JSON.stringify(participants, null, 2));
      console.log('  - Array length:', participants.length);
      
      fromNumber = direction === 'incoming' 
        ? (callData.participants?.[1] || callData.from || '')
        : (callData.participants?.[0] || callData.from || '');
      toNumber = direction === 'incoming'
        ? (callData.participants?.[0] || callData.to || '')
        : (callData.participants?.[1] || callData.to || '');
      
      console.log('  - Extracted from:', fromNumber);
      console.log('  - Extracted to:', toNumber);
      console.log('  - Fallback from field:', callData.from);
      console.log('  - Fallback to field:', callData.to);
      
      status = callData.status;
      createdAt = callData.createdAt ? new Date(callData.createdAt) : new Date();
      answeredAt = callData.answeredAt ? new Date(callData.answeredAt) : null;
      completedAt = callData.completedAt ? new Date(callData.completedAt) : null;
      userId = callData.userId;
      answeredBy = callData.answeredBy;
      initiatedBy = callData.initiatedBy;
    }

    console.log(`[Webhook] ═══════════════════════════════════════`);
    console.log(`[Webhook] PROCESSING SUMMARY:`);
    console.log(`[Webhook] ═══════════════════════════════════════`);
    console.log(`[Webhook] Call ID: ${callId}`);
    console.log(`[Webhook] Phone Number ID: ${phoneNumberId}`);
    console.log(`[Webhook] Direction: ${direction}`);
    console.log(`[Webhook] Duration: ${duration}s`);
    console.log(`[Webhook] From: ${fromNumber}`);
    console.log(`[Webhook] To: ${toNumber}`);
    console.log(`[Webhook] Status: ${status}`);
    console.log(`[Webhook] Has dialogue: ${dialogue.length > 0 ? 'Yes' : 'No'} (${dialogue.length} segments)`);
    console.log(`[Webhook] ═══════════════════════════════════════`);

    // Determine phone line and whether to analyze
    const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID;
    const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID;

    let shouldAnalyze = false;
    let phoneLine = 'unknown';
    let filterReason = '';

    if (phoneNumberId === mainPhoneId) {
      phoneLine = 'main';
      shouldAnalyze = direction === 'incoming' && duration > 30;
      filterReason = !shouldAnalyze 
        ? `Main line filter: ${direction} call, ${duration}s (need incoming >30s)` 
        : 'Qualifies: Incoming >30s';
    } else if (phoneNumberId === outboundPhoneId) {
      phoneLine = 'outbound';
      shouldAnalyze = direction === 'outgoing';
      filterReason = !shouldAnalyze 
        ? `Outbound line filter: ${direction} call (need outgoing)` 
        : 'Qualifies: Outgoing call';
    } else {
      filterReason = `Unknown phone number: ${phoneNumberId}`;
    }

    console.log(`[Webhook] Analysis decision:`, {
      phoneLine,
      shouldAnalyze,
      reason: filterReason,
    });

    // Save call to database
    try {
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const callRecord: InsertCall = {
        callId,
        phoneNumberId,
        fromNumber,
        toNumber,
        direction: direction as 'incoming' | 'outgoing' | undefined,
        status,
        createdAt: createdAt || new Date(),
        answeredAt,
        completedAt,
        duration,
        userId,
        metadata: {
          phoneLine,
          shouldAnalyze,
          filterReason,
          answeredBy,
          initiatedBy,
          webhookReceivedAt: new Date().toISOString(),
          webhookEventType: type,
          participants,
          hasTranscript: dialogue.length > 0,
        },
      };

      // Check if call already exists
      const existing = await db
        .select()
        .from(calls)
        .where(eq(calls.callId, callId))
        .limit(1);

      if (existing.length > 0) {
        // Update existing call with new data (especially duration from transcript.completed)
        await db
          .update(calls)
          .set({
            status,
            completedAt,
            duration, // Update duration from transcript.completed if available
            phoneNumberId: phoneNumberId || existing[0].phoneNumberId,
            fromNumber: fromNumber || existing[0].fromNumber,
            toNumber: toNumber || existing[0].toNumber,
            direction: direction as 'incoming' | 'outgoing' | undefined || existing[0].direction,
            metadata: callRecord.metadata,
          })
          .where(eq(calls.callId, callId));
        console.log(`[Webhook] Updated existing call ${callId} with new data`);
      } else {
        // Insert new call
        await db.insert(calls).values(callRecord);
        console.log(`[Webhook] Inserted new call ${callId}`);
      }

      console.log(`[Webhook] ✅ Call ${callId} saved to database`);
      console.log(`[Webhook] Database record details:`, {
        callId,
        duration,
        direction,
        fromNumber,
        toNumber,
        status,
        phoneLine,
        shouldAnalyze,
      });
    } catch (dbError) {
      console.error(`[Webhook] ❌ Database error:`, dbError);
      console.error(`[Webhook] Database error details:`, {
        message: dbError instanceof Error ? dbError.message : String(dbError),
        stack: dbError instanceof Error ? dbError.stack : undefined,
        callId,
        callData: JSON.stringify(callData, null, 2),
      });
      // Continue processing even if DB save fails
    }

    // Respond to OpenPhone immediately (don't wait for transcript/analysis)
    res.status(200).json({ 
      received: true,
      processed: true,
      callId,
      willAnalyze: shouldAnalyze,
      phoneLine,
    });

    // Handle transcript and analysis
    // Process transcript if we have dialogue data (from either event type)
    if (dialogue.length > 0) {
      // For call.transcript.completed, save transcript directly from webhook
      // IMPORTANT: Webhook provides dialogue array (NOT segments)
      console.log(`[Webhook] Saving transcript directly from webhook for call ${callId}...`);
      
      try {
        const db = await getDb();
        if (!db) {
          throw new Error("Database not available");
        }

        // Build full text from dialogue array
        // Map OpenPhone API fields: content -> text, identifier/userId -> speaker
        // CRITICAL: Validate each dialogue item has required fields
        const validDialogue = dialogue.filter(d => {
          const hasContent = d.content !== undefined && d.content !== null && String(d.content).trim().length > 0;
          const hasSpeaker = (d.userId !== undefined && d.userId !== null) || 
                            (d.identifier !== undefined && d.identifier !== null);
          
          if (!hasContent || !hasSpeaker) {
            console.warn('[Webhook] Skipping invalid dialogue item:', JSON.stringify(d, null, 2));
          }
          
          return hasContent && hasSpeaker;
        });
        
        if (validDialogue.length === 0) {
          console.error('[Webhook] ❌ No valid dialogue items found! All items missing content or speaker.');
          console.error('[Webhook] Raw dialogue:', JSON.stringify(dialogue, null, 2));
          throw new Error('No valid dialogue items in transcript');
        }
        
        console.log(`[Webhook] Valid dialogue items: ${validDialogue.length} of ${dialogue.length}`);
        
        const fullText = validDialogue
          .map(segment => {
            const speaker = segment.userId || segment.identifier || 'Unknown';
            const text = segment.content || '';
            return `${speaker}: ${text}`;
          })
          .join("\n");

        // Transform dialogue → segments for database storage
        // Database stores as "segments" but webhook provides "dialogue"
        const transcriptData: InsertTranscript = {
          callId,
          fullText,
          jsonPayload: {
            segments: validDialogue.map(d => ({
              start: d.start || 0,
              end: d.end || 0,
              speaker: d.userId || d.identifier || 'Unknown',
              text: d.content || '',
            })),
          },
          duration,
          status,
        };
        
        // Type assertion for jsonPayload to access segments
        const jsonPayload = transcriptData.jsonPayload as { segments?: Array<{ start: number; end: number; speaker: string; text: string }> };
        
        console.log('[Webhook] Transcript data prepared:', {
          callId,
          fullTextLength: fullText.length,
          segmentCount: jsonPayload?.segments?.length || 0,
          firstSegment: jsonPayload?.segments?.[0] || null,
        });

        // Upsert transcript
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
          console.log(`[Webhook] Updated existing transcript for call ${callId}`);
        } else {
          await db.insert(transcripts).values(transcriptData);
          console.log(`[Webhook] Inserted new transcript for call ${callId}`);
        }

        console.log(`[Webhook] ✅ Transcript saved for call ${callId} (${dialogue.length} segments)`);
        
        // Trigger analysis if call qualifies
        if (shouldAnalyze) {
          console.log(`[Webhook] Triggering analysis for call ${callId}...`);
          await analyzeCall({ 
            callId,
            phoneNumberId,
          });
          console.log(`[Webhook] ✅ Analysis complete for call ${callId}`);
        } else {
          console.log(`[Webhook] Skipping analysis for call ${callId}: ${filterReason}`);
        }
      } catch (error) {
        console.error(`[Webhook] ❌ Error saving transcript for call ${callId}:`, error);
      }
    } else if (shouldAnalyze && isCallCompleted) {
      // For call.completed, wait and fetch transcript via API
      console.log(`[Webhook] Scheduling transcript fetch and analysis for call ${callId}...`);
      
      // Wait 8 seconds for transcript to be available
      setTimeout(async () => {
        try {
          console.log(`[Webhook] Fetching transcript for call ${callId}...`);
          const transcriptSaved = await fetchTranscriptForCall(callId);

          if (transcriptSaved) {
            console.log(`[Webhook] ✅ Transcript received for call ${callId}`);
            console.log(`[Webhook] Triggering analysis...`);
            
            await analyzeCall({ 
              callId,
              phoneNumberId,
            });
            
            console.log(`[Webhook] ✅ Analysis complete for call ${callId}`);
          } else {
            console.log(`[Webhook] ⚠️ No transcript available for call ${callId}`);
          }
        } catch (error) {
          console.error(`[Webhook] ❌ Error processing call ${callId}:`, error);
        }
      }, 8000); // 8 second delay
    } else {
      console.log(`[Webhook] Skipping analysis for call ${callId}: ${filterReason}`);
    }

  } catch (error) {
    console.error('[Webhook] ❌ Error processing webhook:', error);
    // Always return 200 to prevent OpenPhone from retrying
    res.status(200).json({ 
      received: true,
      error: 'Internal processing error',
    });
  }
});

