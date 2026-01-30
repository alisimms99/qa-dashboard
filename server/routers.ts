import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getAllCalls, getCallById, getCallWithDetails, getDashboardStats, getFailedCalls, getCoachingNotesByCallId, insertCoachingNote, updateAnalysisWithDetailedFeedback, getTranscriptByCallId, getAnalysisByCallId, getDb, getWebhookHealth } from "./db";
import { invokeLLM } from "./_core/llm";
import { syncCalls, SyncResult } from "./sync";
import { analyzeCall, batchAnalyzeCalls } from "./analysis";
import { generateDetailedCoaching } from "./lib/coaching";
import { analyses } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  calls: router({
    stats: publicProcedure
      .input(z.object({
        timeRange: z.enum(['all', 'today', 'week', 'month']).optional(),
        scoreRange: z.enum(['all', 'needs-improvement', 'acceptable', 'good', 'excellent']).optional(),
        phoneNumberId: z.string().nullable().optional(),
      }).optional())
      .query(async ({ input }) => {
        const filters = input ? {
          timeRange: input.timeRange,
          scoreRange: input.scoreRange,
          phoneNumberId: input.phoneNumberId,
        } : undefined;
        const stats = await getDashboardStats(filters);
        return stats;
      }),

    list: publicProcedure
      .input(z.object({
        timeRange: z.enum(['all', 'today', 'week', 'month']).optional(),
        scoreRange: z.enum(['all', 'needs-improvement', 'acceptable', 'good', 'excellent']).optional(),
        phoneNumberId: z.string().nullable().optional(),
      }).optional())
      .query(async ({ input }) => {
        const filters = input ? {
          timeRange: input.timeRange,
          scoreRange: input.scoreRange,
          phoneNumberId: input.phoneNumberId,
        } : undefined;
        const calls = await getAllCalls(filters);
        return calls;
      }),
    
    getById: publicProcedure
      .input(z.object({
        callId: z.string()
      }))
      .query(async ({ input }) => {
        const call = await getCallById(input.callId);
        return call;
      }),
    
    getWithDetails: publicProcedure
      .input(z.object({
        callId: z.string()
      }))
      .query(async ({ input }) => {
        const details = await getCallWithDetails(input.callId);
        return details;
      }),

    getDetailedAnalysis: publicProcedure
      .input(z.object({
        callId: z.string()
      }))
      .query(async ({ input }) => {
        try {
          // Get call - handle null gracefully
          const call = await getCallById(input.callId);
          if (!call) {
            throw new Error("Call not found");
          }

          // Handle missing transcript gracefully
          let transcript = null;
          try {
            transcript = await getTranscriptByCallId(input.callId);
          } catch (error) {
            console.log(`[Router] No transcript found for call: ${input.callId}`);
          }

          // Handle missing analysis gracefully
          let analysis = null;
          try {
            analysis = await getAnalysisByCallId(input.callId);
          } catch (error) {
            console.log(`[Router] No analysis found for call: ${input.callId}`);
          }

          // Handle missing coaching notes gracefully - don't fail if table doesn't exist
          let coachingNotes = [];
          try {
            coachingNotes = await getCoachingNotesByCallId(input.callId);
          } catch (error) {
            console.log(`[Router] Could not fetch coaching notes for call ${input.callId}:`, error instanceof Error ? error.message : String(error));
            coachingNotes = [];
          }

          // If no detailed analysis exists yet, generate it with OpenAI
          let detailedFeedback = null;
          if (analysis && transcript && transcript.fullText) {
            const metadata = analysis.metadata as any;
            if (metadata?.detailedFeedback) {
              detailedFeedback = metadata.detailedFeedback;
            } else {
              try {
                detailedFeedback = await generateDetailedCoaching(call, transcript, analysis);
                await updateAnalysisWithDetailedFeedback(input.callId, detailedFeedback);
              } catch (error) {
                console.error("[Router] Failed to generate detailed coaching:", error);
                // Continue without detailed feedback
              }
            }
          }

          // Get team average for comparison
          const db = await getDb();
          if (!db) {
            throw new Error("Database not available");
          }
          
          let teamScores = [];
          try {
            teamScores = await db
              .select({ score: analyses.score })
              .from(analyses);
          } catch (error) {
            console.error("[Router] Failed to get team scores:", error);
            teamScores = [];
          }
          
          const teamAvg = teamScores.length > 0
            ? Math.round(teamScores.reduce((sum, a) => sum + a.score, 0) / teamScores.length)
            : 0;

          const percentile = analysis && teamScores.length > 0
            ? Math.round((teamScores.filter(a => a.score <= analysis.score).length / teamScores.length) * 100)
            : 50;

          return {
            call,
            transcript,
            analysis: analysis ? {
              ...analysis,
              rubricBreakdown: detailedFeedback?.rubricBreakdown || null,
              strengths: detailedFeedback?.strengths || [],
              improvements: detailedFeedback?.improvements || [],
              suggestedResponses: detailedFeedback?.suggestedResponses || [],
              coachingPoints: detailedFeedback?.coachingPoints || [],
              comparisonToAverage: {
                teamAvg,
                percentile,
              },
            } : null,
            coachingNotes,
          };
        } catch (error) {
          console.error("[Router] Error in getDetailedAnalysis:", error);
          throw error;
        }
      }),

    addCoachingNote: publicProcedure
      .input(z.object({
        callId: z.string(),
        notes: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        // Use authenticated user if available, otherwise use system user
        // This allows the app to work even when Firebase auth isn't configured
        const userId = ctx.user?.openId || 'system';
        const userEmail = ctx.user?.email || 'system@oddjobspropertymaintenance.com';

        await insertCoachingNote({
          callId: input.callId,
          coachUserId: userId,
          coachUserEmail: userEmail,
          notes: input.notes,
        });

        return { success: true };
      }),
  }),

  webhooks: router({
    getHealth: publicProcedure.query(async () => {
      const health = await getWebhookHealth();
      return health;
    }),
  }),

  sync: router({
    syncCalls: publicProcedure
      .input(z.object({
        phoneNumberId: z.string(),
        participants: z.array(z.string()).optional(),
        daysToSync: z.number().min(1).max(365).default(30),
        userId: z.string().optional(),
        autoAnalyze: z.boolean().optional().default(true),
      }))
      .mutation(async ({ input }) => {
        const result = await syncCalls({
          phoneNumberId: input.phoneNumberId,
          participants: input.participants,
          daysToSync: input.daysToSync,
          userId: input.userId,
          autoAnalyze: input.autoAnalyze,
        });
        return result;
      }),

    triggerScheduledSync: publicProcedure
      .mutation(async () => {
        // Manual trigger for scheduled sync (uses configured phoneNumberId from env)
        // Conditionally import scheduler only in development
        if (process.env.NODE_ENV !== 'production') {
          const { triggerManualSync } = await import('./scheduler.js');
          const result = await triggerManualSync();
          return result;
        } else {
          // In production, scheduled syncs are handled by Cloud Scheduler
          return {
            success: false,
            message: 'Scheduled syncs are handled by Cloud Scheduler in production',
          };
        }
      }),

    testSync: publicProcedure
      .query(async () => {
        console.log("[Test Sync] Starting manual sync test...");

        const mainPhoneId = process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID || "PNVbbBqeqM";
        const outboundPhoneId = process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID || "PNBANAZERt";

        const results = {
          mainLine: null as SyncResult | null,
          outboundLine: null as SyncResult | null,
          errors: [] as string[],
          timestamp: new Date().toISOString(),
        };

        try {
          // Sync main line
          console.log("[Test Sync] Syncing main line...");
          results.mainLine = await syncCalls({
            phoneNumberId: mainPhoneId,
            participants: [],
            daysToSync: 1, // Last 24 hours
            autoAnalyze: true,
          });
          console.log(
            `[Test Sync] Main line: ${results.mainLine.callsSynced} calls, ` +
            `${results.mainLine.transcriptsSynced} transcripts, ${results.mainLine.analysesTriggered} analyses`
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.errors.push(`Main line error: ${msg}`);
          console.error("[Test Sync] Main line sync failed:", msg);
        }

        try {
          // Sync outbound line
          console.log("[Test Sync] Syncing outbound line...");
          results.outboundLine = await syncCalls({
            phoneNumberId: outboundPhoneId,
            participants: [],
            daysToSync: 1, // Last 24 hours
            autoAnalyze: true,
          });
          console.log(
            `[Test Sync] Outbound line: ${results.outboundLine.callsSynced} calls, ` +
            `${results.outboundLine.transcriptsSynced} transcripts, ${results.outboundLine.analysesTriggered} analyses`
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          results.errors.push(`Outbound line error: ${msg}`);
          console.error("[Test Sync] Outbound line sync failed:", msg);
        }

        console.log("[Test Sync] Complete!", results);
        return results;
      }),
  }),

  scriptOptimizer: router({
    generateImprovements: publicProcedure
      .input(
        z.object({
          scoreThreshold: z.number().default(70),
        })
      )
      .mutation(async ({ input }) => {
        try {
          // Get failed calls
          const failedCalls = await getFailedCalls(input.scoreThreshold);

          if (failedCalls.length === 0) {
            return {
              success: true,
              improvements: "No failed calls found. Your team is performing well!",
              failedCallsCount: 0,
              failedCalls: [],
            };
          }

          // Prepare context for LLM
          const callSummaries = failedCalls
            .slice(0, 10) // Limit to 10 most recent failed calls
            .map((call, idx) => {
              return `
Call ${idx + 1}:
- Direction: ${call.direction}
- Score: ${call.score}/100
- Sentiment: ${call.sentiment}
- Summary: ${call.summary}
- Compliance: ${call.complianceCheck}
- Transcript excerpt: ${call.transcriptText.substring(0, 500)}...`;
            })
            .join("\n");

          const prompt = `You are a call center quality assurance expert. Analyze these failed call interactions and provide 3 specific, actionable improvements to the standard calling script.

Failed Calls Analysis:
${callSummaries}

Based on these failed interactions, suggest 3 specific improvements to our standard calling script to handle these objections or issues better. For each improvement:

1. Identify the common issue or pattern
2. Explain why it's causing problems
3. Provide a specific script modification or technique
4. Give an example of how to implement it

Format your response in clear markdown with headings and bullet points.`;

          // Call LLM for script improvements
          const response = await invokeLLM({
            messages: [
              {
                role: "system",
                content:
                  "You are a call center quality assurance expert specializing in script optimization and customer service training.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
          });

          const improvements = response.choices[0]?.message?.content || "Unable to generate improvements.";

          return {
            success: true,
            improvements,
            failedCallsCount: failedCalls.length,
            failedCalls: failedCalls.slice(0, 5).map((call) => ({
              callId: call.callId,
              direction: call.direction,
              score: call.score,
              sentiment: call.sentiment,
              createdAt: call.createdAt,
            })),
          };
        } catch (error) {
          console.error("[Script Optimizer] Error generating improvements:", error);
          throw new Error("Failed to generate script improvements");
        }
      }),
  }),

  analysis: router({
    analyzeCall: publicProcedure
      .input(z.object({
        callId: z.string(),
        transcriptText: z.string().optional(),
        callDirection: z.enum(["incoming", "outgoing"]).optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await analyzeCall({
          callId: input.callId,
          transcriptText: input.transcriptText,
          callDirection: input.callDirection,
        });
        return result;
      }),

    batchAnalyze: publicProcedure
      .input(z.object({
        callIds: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        const result = await batchAnalyzeCalls(input.callIds);
        return result;
      }),
  }),
});

export type AppRouter = typeof appRouter;
