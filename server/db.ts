import { eq, desc, sql, or, lt, gte, and, lte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users, calls, transcripts, analyses, coachingNotes, InsertCoachingNote, webhookHealth, InsertWebhookHealth } from "../drizzle/schema";
import { ENV } from './_core/env';

const isProduction = process.env.NODE_ENV === "production";
const socketPath = process.env.DB_SOCKET_PATH;

let connection: mysql.Pool;
let _db: ReturnType<typeof drizzle> | null = null;

// Create connection pool based on environment
if (isProduction && socketPath) {
  console.log("[Database] Connecting to Cloud SQL via Unix socket...");
  
  // Cloud SQL Unix socket connection
  connection = mysql.createPool({
    socketPath: socketPath,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "qa_dashboard",
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10000,
  });
} else if (process.env.DATABASE_URL) {
  console.log("[Database] Connecting via DATABASE_URL...");
  
  // Local development via proxy or connection string
  connection = mysql.createPool(process.env.DATABASE_URL);
} else {
  console.log("[Database] Connecting to local MySQL...");
  
  // Fallback to local MySQL
  connection = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "qa_dashboard",
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10000,
  });
}

// Test connection on startup
connection.getConnection()
  .then(conn => {
    console.log("[Database] ✅ Connected successfully");
    conn.release();
  })
  .catch(err => {
    console.error("[Database] ❌ Failed to connect:", err);
    // Don't exit - let the app start and retry connections
  });

// Create drizzle instance from pool with SQL logging
_db = drizzle(connection as any, {
  logger: {
    logQuery: (query: string, params: unknown[]) => {
      console.log("[Drizzle SQL]", query);
      if (params && params.length > 0) {
        console.log("[Drizzle Params]", params);
      }
    },
  },
});

// Lazily get the drizzle instance (for backward compatibility)
export async function getDb() {
  if (!_db) {
    // If _db is null, recreate it from the connection pool
    _db = drizzle(connection as any, {
      logger: {
        logQuery: (query: string, params: unknown[]) => {
          console.log("[Drizzle SQL]", query);
          if (params && params.length > 0) {
            console.log("[Drizzle Params]", params);
          }
        },
      },
    });
  }
  return _db;
}

// Export connection pool for direct access if needed
export { connection };

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }
    // OAuth disabled - ownerOpenId check removed
    // else if (user.openId === ENV.ownerOpenId) {
    //   values.role = 'admin';
    //   updateSet.role = 'admin';
    // }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Call queries
export interface CallFilters {
  timeRange?: 'all' | 'today' | 'week' | 'month';
  scoreRange?: 'all' | 'needs-improvement' | 'acceptable' | 'good' | 'excellent';
  phoneNumberId?: string | null;
}

export async function getAllCalls(filters?: CallFilters) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Build WHERE conditions
    const conditions: any[] = [];
    
    // Apply time range filter
    if (filters?.timeRange && filters.timeRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      if (filters.timeRange === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (filters.timeRange === 'week') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
      } else if (filters.timeRange === 'month') {
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
      } else {
        startDate = new Date(0);
      }
      
      conditions.push(gte(calls.createdAt, startDate));
    }
    
    // Apply phone number filter
    if (filters?.phoneNumberId) {
      conditions.push(eq(calls.phoneNumberId, filters.phoneNumberId));
    }
    
    // Build query - get calls first
    let query = db.select().from(calls);
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions)) as any;
    }
    
    let result = await query.orderBy(desc(calls.createdAt));
    
    // Enrich calls with analysis scores
    if (result.length > 0) {
      const callIds = result.map(c => c.callId);
      const analysesData = await db
        .select({ callId: analyses.callId, score: analyses.score, analyzedAt: analyses.analyzedAt })
        .from(analyses)
        .where(inArray(analyses.callId, callIds));
      
      const scoreMap = new Map(analysesData.map(a => [a.callId, { score: a.score, analyzedAt: a.analyzedAt }]));
      
      // Add score to each call
      result = result.map(call => ({
        ...call,
        score: scoreMap.get(call.callId)?.score ?? null,
        analyzedAt: scoreMap.get(call.callId)?.analyzedAt ?? null,
      })) as any;
    }
    
    // Apply score filter (requires joining with analyses table)
    if (filters?.scoreRange && filters.scoreRange !== 'all') {
      const scoreRanges = {
        'needs-improvement': [0, 69],
        'acceptable': [70, 84],
        'good': [85, 94],
        'excellent': [95, 100],
      };
      
      const [minScore, maxScore] = scoreRanges[filters.scoreRange];
      
      // Get call IDs with matching scores
      const analysesWithScores = await db
        .select({ callId: analyses.callId })
        .from(analyses)
        .where(and(gte(analyses.score, minScore), lte(analyses.score, maxScore)));
      
      const matchingCallIds = new Set(analysesWithScores.map(a => a.callId));
      
      // Filter results
      result = result.filter(call => matchingCallIds.has(call.callId));
    }
    
    return result;
  } catch (error) {
    console.error("[getAllCalls] SQL Error:", error);
    console.error("[getAllCalls] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

export async function getCallById(callId: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.select().from(calls).where(eq(calls.callId, callId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// Transcript queries
export async function getTranscriptByCallId(callId: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.select().from(transcripts).where(eq(transcripts.callId, callId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// Analysis queries
export async function getAnalysisByCallId(callId: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.select().from(analyses).where(eq(analyses.callId, callId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// Combined query for call details with transcript and analysis
export async function getCallWithDetails(callId: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const call = await getCallById(callId);
  if (!call) return null;

  const transcript = await getTranscriptByCallId(callId);
  const analysis = await getAnalysisByCallId(callId);

  return {
    call,
    transcript,
    analysis
  };
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(filters?: CallFilters) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get stats: database not available");
    return {
      totalCalls: 0,
      totalAnalyzed: 0,
      averageScore: 0,
      complianceRate: 0,
    };
  }

  try {
    // Get filtered calls first
    const filteredCalls = await getAllCalls(filters);
    const filteredCallIds = new Set(filteredCalls.map(c => c.callId));
    
    // Get total calls (already filtered)
    const totalCalls = filteredCalls.length;

    // Get analyzed calls with scores (filtered by call IDs)
    const allAnalyzedCalls = await db
      .select({
        callId: analyses.callId,
        score: analyses.score,
        complianceCheck: analyses.complianceCheck,
      })
      .from(analyses);
    
    // Filter by call IDs and apply score filter if needed
    let analyzedCalls = allAnalyzedCalls.filter(a => filteredCallIds.has(a.callId));
    
    if (filters?.scoreRange && filters.scoreRange !== 'all') {
      const scoreRanges = {
        'needs-improvement': [0, 69],
        'acceptable': [70, 84],
        'good': [85, 94],
        'excellent': [95, 100],
      };
      
      const [minScore, maxScore] = scoreRanges[filters.scoreRange];
      analyzedCalls = analyzedCalls.filter(a => a.score >= minScore && a.score <= maxScore);
    }

    const totalAnalyzed = analyzedCalls.length;

    // Calculate average score
    const averageScore =
      totalAnalyzed > 0
        ? Math.round(
            analyzedCalls.reduce((sum, a) => sum + a.score, 0) / totalAnalyzed
          )
        : 0;

    // Calculate compliance rate (Pass / Total)
    const passedCount = analyzedCalls.filter(
      (a) => a.complianceCheck === "Pass"
    ).length;
    const complianceRate =
      totalAnalyzed > 0 ? Math.round((passedCount / totalAnalyzed) * 100) : 0;

    return {
      totalCalls,
      totalAnalyzed,
      averageScore,
      complianceRate,
    };
  } catch (error) {
    console.error("[Database] Failed to get dashboard stats:", error);
    return {
      totalCalls: 0,
      totalAnalyzed: 0,
      averageScore: 0,
      complianceRate: 0,
    };
  }
}

/**
 * Get failed calls for script optimization
 * Returns calls with negative sentiment or low QA scores
 */
export async function getFailedCalls(scoreThreshold: number = 70) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get failed calls: database not available");
    return [];
  }

  try {
    const failedCalls = await db
      .select({
        callId: calls.callId,
        direction: calls.direction,
        fromNumber: calls.fromNumber,
        toNumber: calls.toNumber,
        createdAt: calls.createdAt,
        transcriptText: transcripts.fullText,
        score: analyses.score,
        sentiment: analyses.sentiment,
        summary: analyses.summary,
        complianceCheck: analyses.complianceCheck,
      })
      .from(calls)
      .innerJoin(transcripts, eq(calls.callId, transcripts.callId))
      .innerJoin(analyses, eq(calls.callId, analyses.callId))
      .where(
        or(
          eq(analyses.sentiment, "Negative"),
          lt(analyses.score, scoreThreshold)
        )
      )
      .orderBy(desc(calls.createdAt));

    return failedCalls;
  } catch (error) {
    console.error("[Database] Failed to get failed calls:", error);
    return [];
  }
}

/**
 * Get webhook health status
 */
export async function getWebhookHealth() {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get webhook health: database not available");
    return {
      status: 'unknown' as const,
      lastReceived: null,
      minutesSince: null,
      hoursSince: null,
      recentEvents: [],
    };
  }

  try {
    // Get last webhook received
    const lastWebhook = await db
      .select()
      .from(webhookHealth)
      .orderBy(desc(webhookHealth.lastWebhookReceived))
      .limit(1);

    if (!lastWebhook || lastWebhook.length === 0) {
      return {
        status: 'unknown' as const,
        lastReceived: null,
        minutesSince: null,
        hoursSince: null,
        recentEvents: [],
      };
    }

    const lastReceived = lastWebhook[0].lastWebhookReceived;
    const now = new Date();
    const minutesSince = Math.floor((now.getTime() - lastReceived.getTime()) / 1000 / 60);
    const hoursSince = Math.floor(minutesSince / 60);

    // Get recent webhook events (last 10)
    const recentEvents = await db
      .select()
      .from(webhookHealth)
      .orderBy(desc(webhookHealth.lastWebhookReceived))
      .limit(10);

    // Determine status
    let status: 'active' | 'quiet' | 'down';
    if (minutesSince < 60) {
      status = 'active';
    } else if (minutesSince < 1440) { // 24 hours
      status = 'quiet';
    } else {
      status = 'down';
    }

    return {
      status,
      lastReceived,
      minutesSince,
      hoursSince,
      recentEvents: recentEvents.map(e => ({
        eventType: e.eventType,
        callId: e.callId,
        receivedAt: e.lastWebhookReceived,
      })),
    };
  } catch (error) {
    console.error("[Database] Failed to get webhook health:", error);
    return {
      status: 'unknown' as const,
      lastReceived: null,
      minutesSince: null,
      hoursSince: null,
      recentEvents: [],
    };
  }
}

/**
 * Get coaching notes for a specific call
 * Returns empty array if table doesn't exist or on error (graceful degradation)
 */
export async function getCoachingNotesByCallId(callId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get coaching notes: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(coachingNotes)
      .where(eq(coachingNotes.callId, callId))
      .orderBy(desc(coachingNotes.coachedAt));
    
    return result;
  } catch (error) {
    // Gracefully handle missing table or other errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("doesn't exist") || errorMessage.includes("Unknown table")) {
      console.warn("[Database] coaching_notes table does not exist yet. Run migrations to create it.");
      return [];
    }
    console.error("[Database] Failed to get coaching notes:", error);
    // Return empty array instead of throwing to prevent 500 errors
    return [];
  }
}

/**
 * Insert a new coaching note
 */
export async function insertCoachingNote(data: {
  callId: string;
  coachUserId: string;
  coachUserEmail: string;
  notes: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    await db.insert(coachingNotes).values({
      callId: data.callId,
      coachUserId: data.coachUserId,
      coachUserEmail: data.coachUserEmail,
      notes: data.notes,
    });
  } catch (error) {
    console.error("[Database] Failed to insert coaching note:", error);
    throw error;
  }
}

/**
 * Update analysis with detailed feedback
 */
export async function updateAnalysisWithDetailedFeedback(
  callId: string,
  detailedFeedback: any
) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  try {
    // Get the analysis for this call
    const analysis = await db
      .select()
      .from(analyses)
      .where(eq(analyses.callId, callId))
      .limit(1);

    if (analysis.length === 0) {
      console.warn(`[Database] No analysis found for call ${callId}`);
      return null;
    }

    // Update with detailed feedback (store in metadata JSON field)
    const currentMetadata = analysis[0].metadata as any || {};
    const updatedMetadata = {
      ...currentMetadata,
      detailedFeedback,
    };

    await db
      .update(analyses)
      .set({
        metadata: updatedMetadata,
      })
      .where(eq(analyses.callId, callId));

    return true;
  } catch (error) {
    console.error("[Database] Failed to update analysis with detailed feedback:", error);
    throw error;
  }
}
