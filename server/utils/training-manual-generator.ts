/**
 * Training Manual Generator
 * Analyzes high-scoring inbound calls to create SOPs for new hires
 */

import { getDb } from '../db';
import { analyses, calls, transcripts } from '../../drizzle/schema';
import { and, eq, gte, lt, desc } from 'drizzle-orm';
import { invokeLLM } from '../_core/llm';
import * as fs from 'fs';
import * as path from 'path';

export interface TrainingManualOptions {
  minScore?: number; // Default 85
  maxCalls?: number; // Default 50
  includeAdvanced?: boolean; // Default true
}

export interface TrainingManualResult {
  filepath: string;
  filename: string;
  content: string;
  stats: {
    highScoringCallsAnalyzed: number;
    lowScoringCallsAnalyzed: number;
    minScoreThreshold: number;
  };
}

export async function generateTrainingManual(options: TrainingManualOptions = {}): Promise<TrainingManualResult> {
  const minScore = options.minScore ?? 85;
  const maxCalls = options.maxCalls ?? 50;
  const includeAdvanced = options.includeAdvanced ?? true;

  console.log(`[Training Manual] Generating manual from calls with score >= ${minScore}`);

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Get high-scoring inbound calls
  const highScoringCalls = await db
    .select({
      call: calls,
      analysis: analyses,
      transcript: transcripts,
    })
    .from(calls)
    .innerJoin(analyses, eq(calls.callId, analyses.callId))
    .innerJoin(transcripts, eq(calls.callId, transcripts.callId))
    .where(
      and(
        eq(calls.direction, 'incoming'),
        gte(analyses.score, minScore)
      )
    )
    .orderBy(desc(analyses.score))
    .limit(maxCalls);

  console.log(`[Training Manual] Found ${highScoringCalls.length} high-scoring calls`);

  if (highScoringCalls.length === 0) {
    throw new Error('No high-scoring calls found. Lower minScore or wait for more analyzed calls.');
  }

  // Also get low-scoring calls for "what not to do" examples
  const lowScoringCalls = await db
    .select({
      call: calls,
      analysis: analyses,
      transcript: transcripts,
    })
    .from(calls)
    .innerJoin(analyses, eq(calls.callId, analyses.callId))
    .innerJoin(transcripts, eq(calls.callId, transcripts.callId))
    .where(
      and(
        eq(calls.direction, 'incoming'),
        gte(analyses.score, 1), // Must have a score
        lt(analyses.score, 71) // Score <= 70 (using < 71)
      )
    )
    .orderBy(analyses.score)
    .limit(10);

  console.log(`[Training Manual] Found ${lowScoringCalls.length} low-scoring calls for contrast`);

  // Extract best practices from high-scoring calls
  const bestPracticesData = highScoringCalls.map(item => {
    const metadata = item.analysis.metadata as any;
    return {
      score: item.analysis.score,
      bestPractices: item.analysis.bestPractices || metadata?.bestPractices || [],
      trainingRecommendations: item.analysis.trainingRecommendations || metadata?.trainingRecommendations || [],
      keyMoments: item.analysis.keyMoments || metadata?.keyMoments || [],
      complianceChecks: metadata?.complianceChecks || item.analysis.metadata,
      transcript: item.transcript.fullText.substring(0, 2000), // Limit transcript length for LLM
    };
  });

  // Extract common mistakes from low-scoring calls
  const commonMistakes = lowScoringCalls.map(item => {
    const metadata = item.analysis.metadata as any;
    return {
      score: item.analysis.score,
      areasForImprovement: metadata?.areasForImprovement || [],
      complianceChecks: metadata?.complianceChecks || item.analysis.metadata,
      summary: item.analysis.summary,
    };
  });

  // Use LLM to synthesize training manual
  console.log(`[Training Manual] Synthesizing training content...`);

  const llmResponse = await invokeLLM({
    messages: [
      {
        role: 'user',
        content: `You are creating a comprehensive Standard Operating Procedures (SOP) manual for new receptionist hires at Odd Jobs Property Maintenance, a facilities maintenance company in Pittsburgh.

**Data Provided:**

- ${highScoringCalls.length} high-scoring inbound calls (scores ${minScore}+)

- ${lowScoringCalls.length} low-scoring calls for contrast

**Best Practices Data:**

${JSON.stringify(bestPracticesData, null, 2)}

**Common Mistakes Data:**

${JSON.stringify(commonMistakes, null, 2)}

**Your Task:**

Create a comprehensive training manual with these sections:

# INBOUND CALL HANDLING - STANDARD OPERATING PROCEDURES

## Section 1: Professional Greeting

- **Best Practices:** Extract common patterns from high-scoring calls
- **Example Phrases:** Pull exact phrases that worked well
- **Do's and Don'ts:** Based on high vs low scoring calls
- **Common Mistakes:** What to avoid

## Section 2: Needs Assessment & Active Listening

- **Question Framework:** What questions to ask and when
- **Active Listening Techniques:** How top performers demonstrated listening
- **Information Gathering:** Required info for different call types
- **Example Dialogue:** Real examples from high-scoring calls (anonymized)

## Section 3: Problem-Solving & Service Knowledge

- **Service Overview:** What OJPM offers (extract from successful calls)
- **Setting Expectations:** Timeline, process, next steps
- **Emergency Handling:** How to identify and escalate urgent issues
- **Example Scenarios:** Real situations handled well

## Section 4: Scheduling & Follow-up

- **Appointment Scheduling Best Practices**
- **Confirming Contact Information**
- **Setting Clear Next Steps**
- **Follow-up Protocols**

## Section 5: Empathy & De-escalation

- **Empathy Phrases:** Exact phrases that worked
- **De-escalation Techniques:** For frustrated callers
- **Taking Ownership:** Even when not your fault
- **Example Scenarios:** Real examples of excellent empathy

${includeAdvanced ? `
## Section 6: Advanced Techniques (For Experienced Staff)

- **Upselling Opportunities:** When and how to mention additional services
- **Building Rapport:** Techniques used by top performers
- **Handling Complex Situations:** Multi-issue calls, angry clients
- **Cross-selling:** Introducing related services naturally
` : ''}

## Section 7: Common Mistakes to Avoid

Based on low-scoring calls, what NOT to do:
- List specific mistakes with examples
- Explanation of why each is problematic
- How to correct each mistake

## Section 8: Role-Play Scenarios

Create 5 realistic scenarios for training practice:

1. Routine service request
2. Emergency situation
3. Frustrated/upset caller
4. Complex multi-issue call
5. Scheduling conflict

For each scenario:
- Setup context
- Customer dialogue prompts
- Expected trainee responses
- Coaching points

## Appendix: Quick Reference Guide

One-page cheat sheet with:
- Greeting template
- Key questions checklist
- Common issues → solutions
- Emergency escalation criteria
- Contact info confirmation template

**Format:** 
- Use clear headings and bullet points
- Include exact phrases from transcripts (anonymized)
- Make it actionable and specific
- Keep language simple and direct
- Include real examples throughout

**Output as structured markdown that can be exported to a document.`,
      },
    ],
  });

  // Extract content from LLM response
  const content = llmResponse.choices[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('LLM did not return valid content');
  }

  console.log(`[Training Manual] Manual generated successfully`);

  // Save to file
  const outputPath = path.join(process.cwd(), 'training-materials');
  if (!fs.existsSync(outputPath)) {
    fs.mkdirSync(outputPath, { recursive: true });
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `Inbound-Call-SOP-${timestamp}.md`;
  const filepath = path.join(outputPath, filename);

  fs.writeFileSync(filepath, content);

  console.log(`[Training Manual] Saved to: ${filepath}`);

  return {
    filepath,
    filename,
    content,
    stats: {
      highScoringCallsAnalyzed: highScoringCalls.length,
      lowScoringCallsAnalyzed: lowScoringCalls.length,
      minScoreThreshold: minScore,
    },
  };
}

