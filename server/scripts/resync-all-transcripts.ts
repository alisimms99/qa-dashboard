/**
 * Bulk Transcript Re-sync Script
 * 
 * Finds all transcripts with broken data ("undefined: undefined" in fullText)
 * and re-fetches them from OpenPhone API with correct field mappings.
 * 
 * Usage:
 *   export OPENPHONE_API_KEY='your_key_here'
 *   npm run resync-transcripts
 */

import { getDb } from '../db';
import { transcripts } from '../../drizzle/schema';
import { like } from 'drizzle-orm';
import { fetchTranscriptForCall } from '../sync';

async function resyncAllTranscripts() {
  console.log('🔄 Starting bulk transcript re-sync...\n');

  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  // Get all calls that have transcripts containing "undefined: undefined"
  const brokenTranscripts = await db
    .select({ 
      id: transcripts.id,
      callId: transcripts.callId 
    })
    .from(transcripts)
    .where(like(transcripts.fullText, '%undefined: undefined%'));

  console.log(`Found ${brokenTranscripts.length} broken transcripts to re-sync\n`);

  if (brokenTranscripts.length === 0) {
    console.log('✅ No broken transcripts found. All transcripts are up to date!');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;
  const failedCallIds: string[] = [];

  for (let i = 0; i < brokenTranscripts.length; i++) {
    const { callId } = brokenTranscripts[i];
    const progress = `[${i + 1}/${brokenTranscripts.length}]`;
    
    console.log(`${progress} Re-syncing: ${callId}`);
    
    try {
      const success = await fetchTranscriptForCall(callId);
      
      if (success) {
        successCount++;
        console.log(`✅ Success: ${callId}\n`);
      } else {
        failCount++;
        failedCallIds.push(callId);
        console.log(`⚠️  No transcript available from API: ${callId}\n`);
      }
      
      // Rate limit: wait 500ms between requests to avoid OpenPhone API limits
      if (i < brokenTranscripts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error: any) {
      failCount++;
      failedCallIds.push(callId);
      console.error(`❌ Failed: ${callId}`);
      console.error(`   Error: ${error.message}\n`);
      
      // Still wait even on error to respect rate limits
      if (i < brokenTranscripts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  console.log('═══════════════════════════════════');
  console.log('📊 Bulk re-sync complete!');
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📝 Total: ${brokenTranscripts.length}`);
  
  if (failedCallIds.length > 0) {
    console.log('\nFailed call IDs:');
    failedCallIds.forEach(id => console.log(`  - ${id}`));
  }
  
  console.log('═══════════════════════════════════');

  process.exit(0);
}

resyncAllTranscripts().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

