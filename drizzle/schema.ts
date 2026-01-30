import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Call records from OpenPhone API
 * Based on OpenPhone Call object structure
 */
export const calls = mysqlTable("calls", {
  id: int("id").autoincrement().primaryKey(),
  /** OpenPhone call ID (e.g., AC3700e624eca547eb9f749a06f) */
  callId: varchar("callId", { length: 128 }).notNull().unique(),
  /** Direction of the call: 'incoming' or 'outgoing' */
  direction: mysqlEnum("direction", ["incoming", "outgoing"]).notNull(),
  /** Phone number of the caller (E.164 format) */
  fromNumber: varchar("fromNumber", { length: 32 }).notNull(),
  /** Phone number of the recipient (E.164 format) */
  toNumber: varchar("toNumber", { length: 32 }).notNull(),
  /** Total duration of the call in seconds */
  duration: int("duration").notNull().default(0),
  /** Status of the call: completed, missed, canceled, failed, etc. */
  status: varchar("status", { length: 32 }).notNull(),
  /** Timestamp when the call was created */
  createdAt: timestamp("createdAt").notNull(),
  /** Timestamp when the call was answered (nullable) */
  answeredAt: timestamp("answeredAt"),
  /** Timestamp when the call ended (nullable) */
  completedAt: timestamp("completedAt"),
  /** OpenPhone phone number ID associated with the call */
  phoneNumberId: varchar("phoneNumberId", { length: 128 }),
  /** OpenPhone user ID who answered/initiated the call */
  userId: varchar("userId", { length: 128 }),
  /** Additional metadata from OpenPhone API */
  metadata: json("metadata"),
});

export type Call = typeof calls.$inferSelect;
export type InsertCall = typeof calls.$inferInsert;

/**
 * Call transcripts from OpenPhone API
 * Based on OpenPhone CallTranscript object structure
 */
export const transcripts = mysqlTable("transcripts", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to calls table */
  callId: varchar("callId", { length: 128 }).notNull().unique(),
  /** Full text of the transcript */
  fullText: text("fullText").notNull(),
  /** Raw JSON payload from OpenPhone API including segments, speakers, timestamps */
  jsonPayload: json("jsonPayload").notNull(),
  /** Duration of the transcribed call in seconds */
  duration: int("duration"),
  /** Status of the transcription: completed, processing, failed */
  status: varchar("status", { length: 32 }).notNull(),
  /** Timestamp when the transcript was created */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Transcript = typeof transcripts.$inferSelect;
export type InsertTranscript = typeof transcripts.$inferInsert;

/**
 * QA Analysis results for calls
 * Stores AI-generated analysis, scores, and compliance checks
 */
export const analyses = mysqlTable("analyses", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to calls table */
  callId: varchar("callId", { length: 128 }).notNull().unique(),
  /** QA score (0-100) */
  score: int("score").notNull(),
  /** AI-generated summary of the call */
  summary: text("summary").notNull(),
  /** Compliance check result: Pass, Fail, Review */
  complianceCheck: mysqlEnum("complianceCheck", ["Pass", "Fail", "Review"]).notNull(),
  /** Detailed compliance notes */
  complianceNotes: text("complianceNotes"),
  /** Whether greeting was used */
  hasGreeting: boolean("hasGreeting"),
  /** Whether proper closing was used */
  hasClosing: boolean("hasClosing"),
  /** Whether customer concerns were addressed */
  concernsAddressed: boolean("concernsAddressed"),
  /** Client sentiment: Positive, Neutral, Negative */
  sentiment: mysqlEnum("sentiment", ["Positive", "Neutral", "Negative"]),
  /** Action items extracted from the call */
  actionItems: text("actionItems"),
  /** Additional metadata stored as JSON */
  metadata: json("metadata"),
  /** Timestamp when the analysis was created */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** Timestamp when the analysis was performed */
  analyzedAt: timestamp("analyzedAt"),
  
  // Inbound-specific fields
  /** Best practices extracted from inbound calls */
  bestPractices: json("bestPractices"),
  /** Training recommendations for inbound calls */
  trainingRecommendations: json("trainingRecommendations"),
  /** Key moments in the call (excellence/improvement opportunities) */
  keyMoments: json("keyMoments"),
  
  // Outbound-specific fields
  /** Outcome of outbound call */
  outcome: varchar("outcome", { length: 50 }),
  /** Point where call broke down (if applicable) */
  breakdownPoint: varchar("breakdownPoint", { length: 50 }),
  /** Objections encountered and responses */
  objections: json("objections"),
  /** Pain points identified from prospect */
  painPoints: json("painPoints"),
  /** Whether appointment was scheduled */
  appointmentScheduled: boolean("appointmentScheduled"),
  /** Whether callback was scheduled */
  callbackScheduled: boolean("callbackScheduled"),
});

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;

/**
 * Coaching notes for calls
 * Stores manager feedback and coaching comments for individual calls
 */
export const coachingNotes = mysqlTable("coaching_notes", {
  id: int("id").autoincrement().primaryKey(),
  /** Foreign key to calls table */
  callId: varchar("callId", { length: 128 }).notNull(),
  /** Firebase UID of the coach/manager who added the note */
  coachUserId: varchar("coachUserId", { length: 255 }).notNull(),
  /** Email of the coach/manager */
  coachUserEmail: varchar("coachUserEmail", { length: 255 }).notNull(),
  /** Coaching notes content */
  notes: text("notes").notNull(),
  /** Timestamp when coaching was provided */
  coachedAt: timestamp("coachedAt").notNull().defaultNow(),
  /** Timestamp when the note was created */
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type CoachingNote = typeof coachingNotes.$inferSelect;
export type InsertCoachingNote = typeof coachingNotes.$inferInsert;

/**
 * Webhook health tracking
 * Tracks when webhooks are received to monitor system health
 */
export const webhookHealth = mysqlTable("webhook_health", {
  id: int("id").autoincrement().primaryKey(),
  /** Timestamp when the webhook was received */
  lastWebhookReceived: timestamp("lastWebhookReceived").notNull(),
  /** Type of webhook event (e.g., 'call.completed', 'call.transcript.completed') */
  eventType: varchar("eventType", { length: 100 }),
  /** Call ID associated with the webhook (if applicable) */
  callId: varchar("callId", { length: 255 }),
  /** Timestamp when the record was created */
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type WebhookHealth = typeof webhookHealth.$inferSelect;
export type InsertWebhookHealth = typeof webhookHealth.$inferInsert;
