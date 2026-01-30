#!/usr/bin/env tsx

/**
 * Re-sync a specific transcript to fix broken data
 * Usage: tsx fix-transcript.ts <callId>
 */

import { fetchTranscriptForCall } from './server/sync';

const callId = process.argv[2];

if (!callId) {
  console.error('❌ Usage: tsx fix-transcript.ts <callId>');
  process.exit(1);
}

console.log(`🔄 Re-syncing transcript for call: ${callId}\n`);

async function fixTranscript() {
  try {
    const success = await fetchTranscriptForCall(callId);
    
    if (success) {
      console.log(`\n✅ Transcript fixed successfully!`);
      console.log(`   Call ID: ${callId}`);
      console.log(`\n💡 Check the database to verify the transcript now has speaker and text fields.`);
    } else {
      console.log(`\n⚠️  No transcript available from OpenPhone API for this call.`);
      console.log(`   This could mean:`);
      console.log(`   - The call doesn't exist in OpenPhone`);
      console.log(`   - The transcript hasn't been generated yet`);
      console.log(`   - The call was deleted`);
    }
  } catch (error) {
    console.error(`❌ Error:`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

fixTranscript();

