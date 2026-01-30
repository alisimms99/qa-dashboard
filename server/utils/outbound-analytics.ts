/**
 * Outbound Call Analytics
 * Provides metrics, breakdown points, objections, and conversion data for outbound calls
 */

import { getDb } from '../db';
import { analyses, calls } from '../../drizzle/schema';
import { eq, and, gte } from 'drizzle-orm';

export interface OutboundAnalyticsOptions {
  daysAgo?: number;
}

export interface OutboundAnalyticsResult {
  overview: {
    totalCalls: number;
    appointmentsScheduled: number;
    callbacksScheduled: number;
    conversionRate: number;
    daysAnalyzed: number;
  };
  breakdownPoints: Record<string, number>;
  outcomes: Record<string, number>;
  topObjections: Array<{
    objection: string;
    count: number;
    percentage: string;
    examples: Array<{
      objection: string;
      agentResponse: string;
      quality: string;
      suggestedResponse?: string;
    }>;
  }>;
  avgScoresByOutcome: Array<{
    outcome: string;
    avgScore: string;
    count: number;
  }>;
  recentCalls: Array<{
    callId: string;
    date: Date;
    outcome: string | null;
    breakdownPoint: string | null;
    score: number;
    appointmentScheduled: boolean | null;
  }>;
}

export async function getOutboundAnalytics(options: OutboundAnalyticsOptions = {}): Promise<OutboundAnalyticsResult> {
  const daysAgo = options.daysAgo ?? 30;
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - daysAgo);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Get all outbound calls
  const outboundCalls = await db
    .select({
      call: calls,
      analysis: analyses,
    })
    .from(calls)
    .innerJoin(analyses, eq(calls.callId, analyses.callId))
    .where(
      and(
        eq(calls.direction, 'outgoing'),
        gte(calls.createdAt, dateThreshold)
      )
    );

  // Calculate conversion metrics
  const totalCalls = outboundCalls.length;
  const appointmentsScheduled = outboundCalls.filter(
    c => c.analysis.appointmentScheduled === true
  ).length;
  const callbacksScheduled = outboundCalls.filter(
    c => c.analysis.callbackScheduled === true
  ).length;

  const conversionRate = totalCalls > 0 
    ? parseFloat(((appointmentsScheduled / totalCalls) * 100).toFixed(1))
    : 0.0;

  // Breakdown point distribution
  const breakdownPoints: Record<string, number> = {};
  outboundCalls.forEach(c => {
    const point = c.analysis.breakdownPoint || 'Unknown';
    breakdownPoints[point] = (breakdownPoints[point] || 0) + 1;
  });

  // Outcome distribution
  const outcomes: Record<string, number> = {};
  outboundCalls.forEach(c => {
    const outcome = c.analysis.outcome || 'Unknown';
    outcomes[outcome] = (outcomes[outcome] || 0) + 1;
  });

  // Collect all objections
  const allObjections: Array<{
    objection: string;
    agentResponse: string;
    quality: string;
    suggestedResponse?: string;
  }> = [];

  outboundCalls.forEach(c => {
    const objections = c.analysis.objections;
    if (objections && Array.isArray(objections)) {
      allObjections.push(...objections.map((obj: any) => ({
        objection: obj.objection || '',
        agentResponse: obj.agentResponse || '',
        quality: obj.quality || '',
        suggestedResponse: obj.suggestedResponse,
      })));
    }
  });

  // Group objections by similarity (normalize to lowercase for grouping)
  const objectionFrequency: Record<string, number> = {};
  allObjections.forEach(obj => {
    const key = obj.objection.toLowerCase().trim();
    if (key) {
      objectionFrequency[key] = (objectionFrequency[key] || 0) + 1;
    }
  });

  // Sort objections by frequency
  const topObjections = Object.entries(objectionFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([objection, count]) => ({
      objection,
      count,
      percentage: allObjections.length > 0 
        ? ((count / allObjections.length) * 100).toFixed(1)
        : '0.0',
      examples: allObjections
        .filter(o => o.objection.toLowerCase().trim() === objection)
        .slice(0, 3)
        .map(o => ({
          objection: o.objection,
          agentResponse: o.agentResponse,
          quality: o.quality,
          suggestedResponse: o.suggestedResponse,
        })),
    }));

  // Calculate average score by outcome
  const scoresByOutcome: Record<string, number[]> = {};
  outboundCalls.forEach(c => {
    const outcome = c.analysis.outcome || 'Unknown';
    if (!scoresByOutcome[outcome]) {
      scoresByOutcome[outcome] = [];
    }
    scoresByOutcome[outcome].push(c.analysis.score || 0);
  });

  const avgScoresByOutcome = Object.entries(scoresByOutcome).map(([outcome, scores]) => ({
    outcome,
    avgScore: scores.length > 0
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
      : '0.0',
    count: scores.length,
  }));

  return {
    overview: {
      totalCalls,
      appointmentsScheduled,
      callbacksScheduled,
      conversionRate,
      daysAnalyzed: daysAgo,
    },
    breakdownPoints,
    outcomes,
    topObjections,
    avgScoresByOutcome,
    recentCalls: outboundCalls.slice(0, 20).map(c => ({
      callId: c.call.callId,
      date: c.call.createdAt,
      outcome: c.analysis.outcome,
      breakdownPoint: c.analysis.breakdownPoint,
      score: c.analysis.score,
      appointmentScheduled: c.analysis.appointmentScheduled,
    })),
  };
}

