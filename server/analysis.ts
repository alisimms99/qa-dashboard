/**
 * Call Analysis Service
 * Uses LLM to analyze call transcripts and save results to database
 */

import { invokeLLM } from "./_core/llm";
import { validateQAResult, QAAnalysisResult } from "./qa-criteria";
import { buildInboundQAPrompt } from "./qa-criteria-inbound";
import { buildOutboundQAPrompt } from "./qa-criteria-outbound";
import { getDb } from "./db";
import { analyses, calls, transcripts, InsertAnalysis } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export interface AnalyzeCallOptions {
  callId: string;
  transcriptText?: string;
  callDirection?: "incoming" | "outgoing";
  phoneNumberId?: string; // Store which phone line the call came from
}

export interface AnalyzeCallResult {
  success: boolean;
  callId: string;
  analysis?: QAAnalysisResult;
  error?: string;
}

/**
 * Analyze a call using LLM and save results to database
 */
export async function analyzeCall(options: AnalyzeCallOptions): Promise<AnalyzeCallResult> {
  const { callId, transcriptText: providedTranscript, callDirection: providedDirection, phoneNumberId } = options;

  try {
    const db = await getDb();
    if (!db) {
      throw new Error("Database not available");
    }

    // Fetch call and transcript if not provided
    const [call] = await db
      .select()
      .from(calls)
      .where(eq(calls.callId, callId))
      .limit(1);

    if (!call) {
      return {
        success: false,
        callId,
        error: "Call not found",
      };
    }

    // Get transcript if not provided
    let transcriptText = providedTranscript;
    let transcriptRecord = null;
    
    if (!transcriptText) {
      const [transcript] = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.callId, callId))
        .limit(1);

      if (!transcript) {
        return {
          success: false,
          callId,
          error: "Transcript not found for this call",
        };
      }

      transcriptRecord = transcript;
      transcriptText = transcript.fullText || "";
    }

    // Check if transcript has actual content
    // Check both fullText and segments in jsonPayload
    let hasContent = false;
    let isBroken = false;
    
    if (transcriptText && transcriptText.trim().length > 0) {
      // CRITICAL: Check for broken transcript markers
      if (transcriptText.includes('undefined: undefined')) {
        console.warn(`[Analysis] Broken transcript detected for call ${callId} - contains "undefined: undefined"`);
        isBroken = true;
        hasContent = false;
      } else {
        // Check if fullText has actual dialogue (not just whitespace or placeholders)
        const trimmedText = transcriptText.trim();
        // Ignore common empty transcript patterns
        if (trimmedText.length > 10 && 
            !trimmedText.toLowerCase().includes("no transcript") &&
            !trimmedText.toLowerCase().includes("transcript unavailable")) {
          hasContent = true;
        }
      }
    }
    
    // Also check segments if available
    if (!hasContent && !isBroken && transcriptRecord?.jsonPayload) {
      const jsonPayload = transcriptRecord.jsonPayload as any;
      if (jsonPayload.segments && Array.isArray(jsonPayload.segments)) {
        // Check if segments have actual text content
        const validSegments = jsonPayload.segments.filter((seg: any) => 
          seg.text && typeof seg.text === 'string' && seg.text.trim().length > 0 &&
          seg.speaker && seg.speaker !== 'undefined'
        );
        
        if (validSegments.length > 0) {
          hasContent = true;
        } else {
          // Check if segments exist but are broken (have start/end but no speaker/text)
          const brokenSegments = jsonPayload.segments.filter((seg: any) => 
            seg.start !== undefined && seg.end !== undefined && 
            (!seg.text || !seg.speaker || seg.speaker === 'undefined')
          );
          if (brokenSegments.length > 0) {
            console.warn(`[Analysis] Broken segments detected for call ${callId} - segments missing speaker/text`);
            isBroken = true;
          }
        }
      }
    }

    if (!hasContent || isBroken) {
      const reason = isBroken 
        ? "Transcript contains corrupted data (undefined: undefined) - cannot analyze"
        : "No dialogue content in transcript";
      
      console.log(`[Analysis] Transcript is ${isBroken ? 'broken' : 'empty'} for call ${callId} - skipping LLM analysis`);
      console.log(`[Analysis] Reason: ${reason}`);
      
      // Save a "no content" or "broken" analysis instead of running LLM
      const noContentMetadata = {
        phoneLine: phoneNumberId === process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID ? 'main' :
                   phoneNumberId === process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID ? 'outbound' : 'unknown',
        emptyTranscript: !isBroken,
        brokenTranscript: isBroken,
        reason: reason,
      };

      const summary = isBroken
        ? "Transcript data is corrupted and cannot be analyzed. Please re-sync this transcript."
        : "Transcript contains no dialogue. This may be a Sona AI call, voicemail, or silent call.";

      // Use saveAnalysisToDatabase with a minimal analysis result
      await saveAnalysisToDatabase(callId, {
        summary: summary,
        sentiment: "Neutral",
        complianceChecks: {
          greeting: "NA",
          verification: "NA",
          recordingConsent: "NA",
          professionalism: "NA",
        },
        keyActionItems: [],
        score: 0,
        detailedNotes: `Unable to analyze - ${reason.toLowerCase()}.`,
      } as QAAnalysisResult, phoneNumberId);

      // Update the saved analysis with the no-content metadata and null score
      await db
        .update(analyses)
        .set({
          score: 0,
          sentiment: null,
          complianceCheck: "Review",
          complianceNotes: `Unable to analyze - ${reason.toLowerCase()}.`,
          metadata: noContentMetadata,
        })
        .where(eq(analyses.callId, callId));

      return {
        success: true,
        callId,
        analysis: {
          score: 0,
          summary: summary,
          sentiment: null,
          complianceCheck: "Review",
          complianceNotes: `Unable to analyze - ${reason.toLowerCase()}.`,
          actionItems: null,
          metadata: noContentMetadata,
        } as any,
      };
    }

    // Determine call direction
    const callDirection = providedDirection || call.direction;

    console.log(`[Analysis] Transcript has content, proceeding with LLM analysis for call ${callId} (${callDirection})`);

    // Build prompt based on call direction
    const prompt = callDirection === "incoming" 
      ? buildInboundQAPrompt(transcriptText)
      : buildOutboundQAPrompt(transcriptText);
    
    // Build schema properties based on call direction
    let baseProperties: Record<string, unknown>;
    let requiredFields: string[];
    
    if (callDirection === "incoming") {
      // Inbound call schema
      baseProperties = {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "QA score from 0-100",
        },
        sentiment: {
          type: "string",
          enum: ["Positive", "Neutral", "Negative"],
          description: "Client sentiment",
        },
        summary: {
          type: "string",
          description: "2-sentence summary of call",
        },
        complianceChecks: {
          type: "object",
          properties: {
            greeting: {
              type: "object",
              properties: {
                compliant: { type: "boolean" },
                notes: { type: "string" },
                examplePhrase: { type: "string" },
              },
              required: ["compliant", "notes"],
            },
            needsAssessment: {
              type: "object",
              properties: {
                compliant: { type: "boolean" },
                notes: { type: "string" },
                questionsAsked: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["compliant", "notes"],
            },
            problemSolving: {
              type: "object",
              properties: {
                compliant: { type: "boolean" },
                notes: { type: "string" },
                solutionsOffered: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["compliant", "notes"],
            },
            scheduling: {
              type: "object",
              properties: {
                compliant: { type: "boolean" },
                notes: { type: "string" },
                appointmentScheduled: { type: "boolean" },
              },
              required: ["compliant", "notes"],
            },
            empathy: {
              type: "object",
              properties: {
                compliant: { type: "boolean" },
                notes: { type: "string" },
                empathyPhrases: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["compliant", "notes"],
            },
          },
          required: ["greeting", "needsAssessment", "problemSolving", "scheduling", "empathy"],
        },
        bestPractices: {
          type: "array",
          items: { type: "string" },
          description: "Specific practices that worked well",
        },
        areasForImprovement: {
          type: "array",
          items: { type: "string" },
          description: "Areas that could be better",
        },
        trainingRecommendations: {
          type: "array",
          items: { type: "string" },
          description: "Training modules or techniques to address improvements",
        },
        keyMoments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              description: { type: "string" },
              category: {
                type: "string",
                enum: ["Excellence", "Improvement Opportunity"],
              },
            },
            required: ["timestamp", "description", "category"],
          },
        },
      };
      requiredFields = ["score", "sentiment", "summary", "complianceChecks", "bestPractices", "areasForImprovement", "trainingRecommendations", "keyMoments"];
    } else {
      // Outbound call schema
      baseProperties = {
        score: {
          type: "integer",
          minimum: 0,
          maximum: 100,
          description: "QA score from 0-100",
        },
        outcome: {
          type: "string",
          enum: ["Appointment", "Callback Scheduled", "Send Info", "Not Interested", "Gatekeeper Block", "Voicemail"],
          description: "Outcome of the call",
        },
        breakdownPoint: {
          type: "string",
          enum: ["Gatekeeper", "Introduction", "Permission", "Value Prop", "Close", "N/A - Success"],
          description: "Point where call broke down (if applicable)",
        },
        scriptAdherence: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 0, maximum: 20 },
            deviations: {
              type: "array",
              items: { type: "string" },
            },
            improvements: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["score", "deviations", "improvements"],
        },
        objections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              objection: { type: "string" },
              agentResponse: { type: "string" },
              quality: {
                type: "string",
                enum: ["Excellent", "Good", "Poor"],
              },
              suggestedResponse: { type: "string" },
            },
            required: ["objection", "agentResponse", "quality"],
          },
        },
        painPoints: {
          type: "array",
          items: { type: "string" },
          description: "Pain points mentioned by prospect",
        },
        appointmentScheduled: {
          type: "boolean",
          description: "Whether appointment was scheduled",
        },
        callbackScheduled: {
          type: "boolean",
          description: "Whether callback was scheduled",
        },
        infoRequested: {
          type: "boolean",
          description: "Whether prospect requested info",
        },
        prospectEmail: {
          type: "string",
          description: "Email if collected",
        },
        coachingNotes: {
          type: "string",
          description: "Specific, actionable feedback",
        },
        whatWorked: {
          type: "array",
          items: { type: "string" },
          description: "Things agent did well",
        },
        whatToImprove: {
          type: "array",
          items: { type: "string" },
          description: "Things to improve with examples",
        },
      };
      requiredFields = ["score", "outcome", "breakdownPoint", "scriptAdherence", "objections", "painPoints", "appointmentScheduled", "callbackScheduled", "infoRequested", "coachingNotes", "whatWorked", "whatToImprove"];
    }
    
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a Quality Assurance analyst. Respond only with valid JSON matching this schema: ${JSON.stringify({
            type: "object",
            properties: baseProperties,
            required: requiredFields,
          })}`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_object",
      },
    });

    // Parse LLM response
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from LLM");
    }

    // Ensure content is a string
    const contentString = typeof content === "string" ? content : JSON.stringify(content);
    const analysisResult: any = JSON.parse(contentString);

    // Basic validation - check for required fields
    if (typeof analysisResult.score !== "number" || analysisResult.score < 0 || analysisResult.score > 100) {
      throw new Error("Invalid score in analysis result");
    }

    console.log(`[Analysis] LLM analysis complete: score=${analysisResult.score}, direction=${callDirection}`);

    // Save to database
    await saveAnalysisToDatabase(callId, analysisResult, phoneNumberId, callDirection);

    return {
      success: true,
      callId,
      analysis: analysisResult,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Analysis] Failed to analyze call ${callId}:`, errorMessage);
    
    return {
      success: false,
      callId,
      error: errorMessage,
    };
  }
}

/**
 * Save analysis results to database
 */
async function saveAnalysisToDatabase(
  callId: string,
  analysis: any,
  phoneNumberId?: string,
  callDirection?: "incoming" | "outgoing"
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Determine overall compliance check based on call direction
  let complianceCheck: "Pass" | "Fail" | "Review" = "Review";
  let complianceNotes = "";
  
  if (callDirection === "incoming") {
    // For inbound calls, check complianceChecks object structure
    const checks = analysis.complianceChecks || {};
    const compliantCount = Object.values(checks).filter((c: any) => c?.compliant === true).length;
    const totalChecks = Object.keys(checks).length;
    
    if (compliantCount === totalChecks) {
      complianceCheck = "Pass";
    } else if (compliantCount < totalChecks / 2) {
      complianceCheck = "Fail";
    } else {
      complianceCheck = "Review";
    }
    
    // Build compliance notes from inbound checks
    const notes: string[] = [];
    if (checks.greeting) notes.push(`Greeting: ${checks.greeting.notes || "N/A"}`);
    if (checks.needsAssessment) notes.push(`Needs Assessment: ${checks.needsAssessment.notes || "N/A"}`);
    if (checks.problemSolving) notes.push(`Problem Solving: ${checks.problemSolving.notes || "N/A"}`);
    if (checks.scheduling) notes.push(`Scheduling: ${checks.scheduling.notes || "N/A"}`);
    if (checks.empathy) notes.push(`Empathy: ${checks.empathy.notes || "N/A"}`);
    complianceNotes = notes.join(" | ");
  } else {
    // For outbound calls, use coachingNotes
    complianceNotes = analysis.coachingNotes || "";
    // Determine compliance based on outcome
    if (analysis.outcome === "Appointment" || analysis.outcome === "Callback Scheduled") {
      complianceCheck = "Pass";
    } else if (analysis.outcome === "Not Interested" || analysis.breakdownPoint === "Introduction") {
      complianceCheck = "Fail";
    } else {
      complianceCheck = "Review";
    }
  }

  // Build metadata object
  const metadata: Record<string, unknown> = {
    complianceChecks: analysis.complianceChecks || {},
  };

  // Add phone number ID if provided (identifies which line the call came from)
  if (phoneNumberId) {
    metadata.phoneNumberId = phoneNumberId;
    // Also identify which line type
    const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID || "PNVbbBqeqM";
    const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID || "PNBANAZERt";
    if (phoneNumberId === mainPhoneId) {
      metadata.phoneLine = "main";
    } else if (phoneNumberId === outboundPhoneId) {
      metadata.phoneLine = "outbound";
    }
  }

  // Add direction-specific fields to metadata
  if (callDirection === "incoming") {
    // Inbound-specific fields
    if (analysis.bestPractices) {
      metadata.bestPractices = analysis.bestPractices;
    }
    if (analysis.trainingRecommendations) {
      metadata.trainingRecommendations = analysis.trainingRecommendations;
    }
    if (analysis.keyMoments) {
      metadata.keyMoments = analysis.keyMoments;
    }
    if (analysis.areasForImprovement) {
      metadata.areasForImprovement = analysis.areasForImprovement;
    }
  } else {
    // Outbound-specific fields
    if (analysis.scriptAdherence) {
      metadata.scriptAdherence = analysis.scriptAdherence;
    }
    if (analysis.whatWorked) {
      metadata.whatWorked = analysis.whatWorked;
    }
    if (analysis.whatToImprove) {
      metadata.whatToImprove = analysis.whatToImprove;
    }
  }

  // Ensure complianceCheck is valid enum value
  if (!["Pass", "Fail", "Review"].includes(complianceCheck)) {
    console.warn(`[Analysis] Invalid complianceCheck value: ${complianceCheck}, defaulting to Review`);
    complianceCheck = "Review";
  }

  // Ensure required fields are not null/undefined
  const score = typeof analysis.score === "number" ? analysis.score : 0;
  const summary = analysis.summary || "No summary available";

  // Build analysis data for database insert
  const analysisData: InsertAnalysis = {
    callId,
    score,
    summary,
    sentiment: analysis.sentiment || null,
    complianceCheck: complianceCheck as "Pass" | "Fail" | "Review",
    hasGreeting: callDirection === "incoming" 
      ? (analysis.complianceChecks?.greeting?.compliant ?? null)
      : null,
    hasClosing: null, // Not explicitly checked in current criteria
    concernsAddressed: callDirection === "incoming"
      ? (analysis.complianceChecks?.problemSolving?.compliant ?? null)
      : null,
    complianceNotes: complianceNotes || null,
    actionItems: callDirection === "incoming" && analysis.keyActionItems
      ? (Array.isArray(analysis.keyActionItems) ? analysis.keyActionItems.join("; ") : null)
      : null,
    metadata,
    analyzedAt: new Date(),
    
    // Inbound-specific fields
    bestPractices: callDirection === "incoming" ? (analysis.bestPractices || null) : null,
    trainingRecommendations: callDirection === "incoming" ? (analysis.trainingRecommendations || null) : null,
    keyMoments: callDirection === "incoming" ? (analysis.keyMoments || null) : null,
    
    // Outbound-specific fields
    outcome: callDirection === "outgoing" ? (analysis.outcome || null) : null,
    breakdownPoint: callDirection === "outgoing" ? (analysis.breakdownPoint || null) : null,
    objections: callDirection === "outgoing" ? (analysis.objections || null) : null,
    painPoints: callDirection === "outgoing" ? (analysis.painPoints || null) : null,
    appointmentScheduled: callDirection === "outgoing" ? (analysis.appointmentScheduled ?? null) : null,
    callbackScheduled: callDirection === "outgoing" ? (analysis.callbackScheduled ?? null) : null,
  };

  console.log(`[Analysis] Saving analysis to database for call ${callId}:`, {
    callId,
    score,
    hasSummary: !!summary,
    complianceCheck,
    metadataKeys: Object.keys(metadata),
  });

  // Check if analysis already exists
  const existing = await db
    .select()
    .from(analyses)
    .where(eq(analyses.callId, callId))
    .limit(1);

  try {
    if (existing.length > 0) {
      // Update existing analysis
      await db
        .update(analyses)
        .set(analysisData)
        .where(eq(analyses.callId, callId));
      
      console.log(`[Analysis] Updated existing analysis for call ${callId}`);
    } else {
      // Insert new analysis
      await db.insert(analyses).values(analysisData);
      console.log(`[Analysis] Saved new analysis for call ${callId}`);
    }
  } catch (dbError) {
    console.error(`[Analysis] Database error saving analysis for call ${callId}:`, dbError);
    console.error(`[Analysis] Analysis data:`, JSON.stringify(analysisData, null, 2));
    throw dbError;
  }
}

/**
 * Batch analyze multiple calls
 */
export async function batchAnalyzeCalls(callIds: string[]): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: AnalyzeCallResult[];
}> {
  const results: AnalyzeCallResult[] = [];
  let successful = 0;
  let failed = 0;

  for (const callId of callIds) {
    const result = await analyzeCall({ callId });
    results.push(result);
    
    if (result.success) {
      successful++;
    } else {
      failed++;
    }
  }

  return {
    total: callIds.length,
    successful,
    failed,
    results,
  };
}

