/**
 * Get Recent Analysis Script
 * 
 * Queries and displays the 5 most recent analyzed calls with their full analysis data.
 * 
 * Usage:
 *   npm run get-analysis
 */

import { getDb } from '../db';
import { analyses, transcripts } from '../../drizzle/schema';
import { desc, eq } from 'drizzle-orm';

async function getRecentAnalysis() {
  console.log('🔍 Fetching 5 most recent analyzed calls...\n');

  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  // Query the 5 most recent analyses, ordered by createdAt descending
  const recentAnalyses = await db
    .select()
    .from(analyses)
    .orderBy(desc(analyses.createdAt))
    .limit(5);

  console.log(`📊 Found ${recentAnalyses.length} recent analyses\n`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (recentAnalyses.length === 0) {
    console.log('No analyses found in the database.');
    process.exit(0);
  }

  // For each analysis, fetch the corresponding transcript
  for (let i = 0; i < recentAnalyses.length; i++) {
    const analysis = recentAnalyses[i];
    const callId = analysis.callId;

    console.log(`\n${'='.repeat(65)}`);
    console.log(`📞 CALL ${i + 1} of ${recentAnalyses.length}`);
    console.log(`${'='.repeat(65)}`);
    console.log(`Call ID: ${callId}`);
    console.log(`Analyzed At: ${analysis.createdAt || 'N/A'}`);
    console.log(`Score: ${analysis.score}/100`);
    console.log(`Compliance: ${analysis.complianceCheck}`);
    console.log(`Sentiment: ${analysis.sentiment || 'N/A'}`);
    console.log(`\n--- FULL ANALYSIS OBJECT ---`);
    console.log(JSON.stringify(analysis, null, 2));

    // Fetch the corresponding transcript
    try {
      const transcriptResult = await db
        .select({ fullText: transcripts.fullText })
        .from(transcripts)
        .where(eq(transcripts.callId, callId))
        .limit(1);

      if (transcriptResult.length > 0) {
        console.log(`\n--- FULL TRANSCRIPT TEXT ---`);
        console.log(transcriptResult[0].fullText);
      } else {
        console.log(`\n--- FULL TRANSCRIPT TEXT ---`);
        console.log('⚠️  No transcript found for this call ID');
      }
    } catch (error) {
      console.log(`\n--- FULL TRANSCRIPT TEXT ---`);
      console.error(`❌ Error fetching transcript: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log(`\n${'='.repeat(65)}\n`);
  }

  console.log('✅ Analysis complete!\n');
  process.exit(0);
}

getRecentAnalysis().catch(error => {
  console.error('❌ Fatal error:', error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
