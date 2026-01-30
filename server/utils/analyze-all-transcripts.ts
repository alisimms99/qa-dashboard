/**
 * Analyze All Transcripts Script
 * 
 * Performs quality and content analysis of all call transcripts in the database.
 * Calculates word counts and identifies OddBot calls.
 * 
 * Usage:
 *   npm run analyze-transcripts
 */

import { getDb } from '../db';
import { transcripts } from '../../drizzle/schema';

interface TranscriptAnalysis {
  callId: string;
  wordCount: number;
  isOddBotCall: boolean;
}

function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  // Split by whitespace and filter out empty strings
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

function isOddBotCall(text: string): boolean {
  if (!text) {
    return false;
  }
  const lowerText = text.toLowerCase();
  return lowerText.includes('oddbot') || lowerText.includes('adbot');
}

async function analyzeAllTranscripts() {
  console.log('🔍 Analyzing all transcripts in the database...\n');

  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  // Fetch all transcripts
  const allTranscripts = await db
    .select({
      callId: transcripts.callId,
      fullText: transcripts.fullText,
    })
    .from(transcripts);

  console.log(`📊 Found ${allTranscripts.length} transcripts to analyze\n`);

  if (allTranscripts.length === 0) {
    console.log('No transcripts found in the database.');
    process.exit(0);
  }

  // Analyze each transcript
  const analyses: TranscriptAnalysis[] = [];
  let oddBotCallCount = 0;
  let totalWordCount = 0;
  let oddBotWordCount = 0;
  let shortCallCount = 0; // wordCount < 20

  for (const transcript of allTranscripts) {
    const wordCount = countWords(transcript.fullText || '');
    const isOddBot = isOddBotCall(transcript.fullText || '');

    analyses.push({
      callId: transcript.callId,
      wordCount,
      isOddBotCall: isOddBot,
    });

    totalWordCount += wordCount;
    
    if (isOddBot) {
      oddBotCallCount++;
      oddBotWordCount += wordCount;
    }

    if (wordCount < 20) {
      shortCallCount++;
    }
  }

  // Calculate averages
  const averageWordCount = allTranscripts.length > 0 
    ? totalWordCount / allTranscripts.length 
    : 0;
  
  const averageOddBotWordCount = oddBotCallCount > 0
    ? oddBotWordCount / oddBotCallCount
    : 0;

  // Output summary statistics
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📈 TRANSCRIPT ANALYSIS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Total transcripts analyzed: ${allTranscripts.length}`);
  console.log(`Number of OddBot calls: ${oddBotCallCount}`);
  console.log(`Average word count (all calls): ${averageWordCount.toFixed(2)}`);
  console.log(`Average word count (OddBot calls only): ${averageOddBotWordCount.toFixed(2)}`);
  console.log(`Short calls (word count < 20): ${shortCallCount}\n`);

  // Additional breakdown
  const regularCallCount = allTranscripts.length - oddBotCallCount;
  const averageRegularWordCount = regularCallCount > 0
    ? (totalWordCount - oddBotWordCount) / regularCallCount
    : 0;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 ADDITIONAL BREAKDOWN');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Regular calls: ${regularCallCount}`);
  console.log(`Average word count (regular calls): ${averageRegularWordCount.toFixed(2)}`);
  console.log(`OddBot calls: ${oddBotCallCount}`);
  console.log(`Average word count (OddBot calls): ${averageOddBotWordCount.toFixed(2)}\n`);

  // Word count distribution
  const veryShort = analyses.filter(a => a.wordCount < 10).length;
  const short = analyses.filter(a => a.wordCount >= 10 && a.wordCount < 20).length;
  const medium = analyses.filter(a => a.wordCount >= 20 && a.wordCount < 100).length;
  const long = analyses.filter(a => a.wordCount >= 100 && a.wordCount < 500).length;
  const veryLong = analyses.filter(a => a.wordCount >= 500).length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📏 WORD COUNT DISTRIBUTION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Very short (< 10 words): ${veryShort}`);
  console.log(`Short (10-19 words): ${short}`);
  console.log(`Medium (20-99 words): ${medium}`);
  console.log(`Long (100-499 words): ${long}`);
  console.log(`Very long (500+ words): ${veryLong}\n`);

  console.log('✅ Analysis complete!\n');
  process.exit(0);
}

analyzeAllTranscripts().catch(error => {
  console.error('❌ Fatal error:', error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
