/**
 * Thematic Call Analysis Script
 * 
 * Performs thematic analysis on all high-quality call transcripts using AI.
 * Analyzes call types and conversational flow stages.
 * 
 * Usage:
 *   npm run thematic-analysis
 */

import 'dotenv/config'; // Load environment variables from .env file

import { getDb } from '../db';
import { transcripts } from '../../drizzle/schema';
import { invokeLLM } from '../_core/llm';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

interface ThematicAnalysis {
  callId: string;
  callType: string;
  callFlow: string[];
}

function countWords(text: string): number {
  if (!text || text.trim().length === 0) {
    return 0;
  }
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

async function analyzeTranscript(transcriptText: string, retries = 3): Promise<{ callType: string; callFlow: string[] }> {
  const prompt = `You are a call center analyst. I will provide you with a raw call transcript. Your task is to analyze it and return a JSON object with two keys: "callType" and "callFlow".

1. **callType**: Classify the call into ONE of the following categories:
   * "New Service Request": A new or existing customer is calling to request a new job or service.
   * "Existing Job Follow-up": A customer is calling for an update or to discuss a job that is already in progress or recently completed.
   * "Billing Inquiry": The call is primarily about an invoice, payment, or cost.
   * "Vendor or Sales Call": The caller is trying to sell something to the company.
   * "General Inquiry": The purpose of the call is informational and doesn't fit the other categories.
   * "Other/Unclassifiable": The call is unclear, a wrong number, or too short to categorize.

2. **callFlow**: Identify the conversational stages that occurred in this call. Return an array of strings representing the stages. Possible stages include:
   * "Greeting": Initial greeting and introduction
   * "Needs Assessment": Gathering information about the caller's needs
   * "Problem Identification": Understanding the specific issue or request
   * "Solution Discussion": Discussing potential solutions or options
   * "Scheduling": Arranging appointments, follow-ups, or next steps
   * "Information Exchange": Sharing details, contact info, or instructions
   * "Objection Handling": Addressing concerns or objections
   * "Closing": Wrapping up the call with next steps or thank you
   * "Other": Any other significant stage not covered above

Return ONLY valid JSON in this exact format:
{
  "callType": "one of the callType categories above",
  "callFlow": ["array", "of", "conversational", "stages"]
}

Transcript:
${transcriptText}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Add timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('API call timeout after 60 seconds')), 60000);
      });

      const apiPromise = invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a call center analyst. Analyze call transcripts and return structured JSON data.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
        maxTokens: 1000,
      });

      const response = await Promise.race([apiPromise, timeoutPromise]);

    // Extract content from response
    const messageContent = response.choices[0]?.message?.content;
    if (!messageContent) {
      throw new Error("No content in LLM response");
    }

    // Handle content which can be string or array
    let content: string;
    if (typeof messageContent === "string") {
      content = messageContent;
    } else if (Array.isArray(messageContent)) {
      const textPart = messageContent.find((part: any) => part.type === "text");
      if (!textPart || textPart.type !== "text") {
        throw new Error("No text content in LLM response");
      }
      content = textPart.text;
    } else {
      throw new Error("Unexpected content type in LLM response");
    }

    // Parse JSON response
    const parsed = JSON.parse(content) as { callType: string; callFlow: string[] };

    // Validate structure
    if (!parsed.callType || !Array.isArray(parsed.callFlow)) {
      throw new Error("Invalid response structure from LLM");
    }

      return {
        callType: parsed.callType,
        callFlow: parsed.callFlow,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // If this is the last attempt, throw the error
      if (attempt === retries) {
        console.error(`   ❌ Failed after ${retries} attempts: ${errorMessage}`);
        throw error;
      }
      
      // Otherwise, wait and retry
      const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
      console.error(`   ⚠️  Attempt ${attempt}/${retries} failed: ${errorMessage}. Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error('Failed to analyze transcript after all retries');
}

function getAlreadyProcessedCallIds(): Set<string> {
  const outputFile = join(process.cwd(), 'analysis_results.txt');
  const processedCallIds = new Set<string>();

  if (!existsSync(outputFile)) {
    return processedCallIds;
  }

  try {
    const content = readFileSync(outputFile, 'utf-8');
    // Match lines like: "[N/175] Analyzing: CALLID" followed by "✅ Type: ..."
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const analyzingMatch = lines[i].match(/\[(\d+)\/\d+\] Analyzing: ([A-Za-z0-9]+)/);
      if (analyzingMatch) {
        const callId = analyzingMatch[2];
        // Check if the next line has a success marker
        if (i + 1 < lines.length && lines[i + 1].includes('✅ Type:')) {
          processedCallIds.add(callId);
        }
      }
    }
  } catch (error) {
    console.warn(`⚠️  Could not read existing output file: ${error instanceof Error ? error.message : String(error)}`);
  }

  return processedCallIds;
}

async function performThematicAnalysis() {
  console.log('🔍 Starting thematic analysis of high-quality call transcripts...\n');

  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  // Check for already processed callIds
  const alreadyProcessed = getAlreadyProcessedCallIds();
  if (alreadyProcessed.size > 0) {
    console.log(`📋 Found ${alreadyProcessed.size} already-processed transcripts. Skipping duplicates...\n`);
  }

  // Fetch all transcripts
  const allTranscripts = await db
    .select({
      callId: transcripts.callId,
      fullText: transcripts.fullText,
    })
    .from(transcripts);

  console.log(`📊 Found ${allTranscripts.length} total transcripts\n`);

  // Filter transcripts with word count >= 20 and exclude already processed
  const highQualityTranscripts = allTranscripts.filter(t => {
    const wordCount = countWords(t.fullText || '');
    const isHighQuality = wordCount >= 20;
    const notProcessed = !alreadyProcessed.has(t.callId);
    return isHighQuality && notProcessed;
  });

  console.log(`✅ Found ${highQualityTranscripts.length} high-quality transcripts to analyze (${allTranscripts.filter(t => countWords(t.fullText || '') >= 20).length} total, ${alreadyProcessed.size} already processed)\n`);

  if (highQualityTranscripts.length === 0) {
    console.log('No high-quality transcripts found to analyze.');
    process.exit(0);
  }

  const analyses: ThematicAnalysis[] = [];
  const callTypeCounts: Record<string, number> = {};
  const callFlowStageCounts: Record<string, number> = {};
  let successCount = 0;
  let failCount = 0;
  const failedCallIds: string[] = [];

  // Calculate total count including already processed for progress display
  const totalHighQualityCount = allTranscripts.filter(t => countWords(t.fullText || '') >= 20).length;
  const startIndex = totalHighQualityCount - highQualityTranscripts.length;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🤖 Analyzing transcripts with AI...\n');

  for (let i = 0; i < highQualityTranscripts.length; i++) {
    const transcript = highQualityTranscripts[i];
    const currentIndex = startIndex + i + 1;
    const progress = `[${currentIndex}/${totalHighQualityCount}]`;
    
    console.log(`${progress} Analyzing: ${transcript.callId}`);

    try {
      const analysis = await analyzeTranscript(transcript.fullText || '');
      
      analyses.push({
        callId: transcript.callId,
        callType: analysis.callType,
        callFlow: analysis.callFlow,
      });

      // Count call types
      callTypeCounts[analysis.callType] = (callTypeCounts[analysis.callType] || 0) + 1;

      // Count call flow stages
      analysis.callFlow.forEach(stage => {
        callFlowStageCounts[stage] = (callFlowStageCounts[stage] || 0) + 1;
      });

      successCount++;
      console.log(`   ✅ Type: ${analysis.callType}, Stages: ${analysis.callFlow.length}\n`);

      // Rate limit: wait 1 second between requests to avoid API limits (increased from 500ms)
      if (i < highQualityTranscripts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      failCount++;
      failedCallIds.push(transcript.callId);
      console.error(`   ❌ Failed: ${error.message}\n`);

      // Still wait even on error to respect rate limits
      if (i < highQualityTranscripts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Output summary statistics
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📈 THEMATIC ANALYSIS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`Total calls analyzed: ${successCount}`);
  console.log(`Failed analyses: ${failCount}\n`);

  console.log('📊 CALL TYPE BREAKDOWN:');
  console.log('───────────────────────────────────────────────────────────────');
  const sortedCallTypes = Object.entries(callTypeCounts).sort((a, b) => b[1] - a[1]);
  sortedCallTypes.forEach(([type, count]) => {
    const percentage = ((count / successCount) * 100).toFixed(1);
    console.log(`  ${type}: ${count} (${percentage}%)`);
  });

  console.log('\n📊 CONVERSATIONAL STAGE FREQUENCY:');
  console.log('───────────────────────────────────────────────────────────────');
  const sortedStages = Object.entries(callFlowStageCounts).sort((a, b) => b[1] - a[1]);
  sortedStages.forEach(([stage, count]) => {
    const percentage = ((count / successCount) * 100).toFixed(1);
    console.log(`  ${stage}: ${count} occurrences (${percentage}% of calls)`);
  });

  if (failedCallIds.length > 0) {
    console.log('\n❌ Failed Call IDs:');
    failedCallIds.forEach(id => console.log(`  - ${id}`));
  }

  console.log('\n✅ Thematic analysis complete!\n');
  process.exit(0);
}

performThematicAnalysis().catch(error => {
  console.error('❌ Fatal error:', error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
