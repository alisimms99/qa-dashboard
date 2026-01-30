/**
 * CLI wrapper for historical import
 * Usage: npm run import-historical [options]
 */

import { importHistoricalCalls } from './historical-import';

async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  let phoneNumberId: string | undefined;
  let userId: string | undefined;
  let startDate: Date | undefined;
  let endDate: Date | undefined;
  let maxCalls = 1000;
  let autoAnalyze = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--phone-number-id' && args[i + 1]) {
      phoneNumberId = args[++i];
    } else if (arg === '--user-id' && args[i + 1]) {
      userId = args[++i];
    } else if (arg === '--start-date' && args[i + 1]) {
      startDate = new Date(args[++i]);
    } else if (arg === '--end-date' && args[i + 1]) {
      endDate = new Date(args[++i]);
    } else if (arg === '--max-calls' && args[i + 1]) {
      maxCalls = parseInt(args[++i], 10);
    } else if (arg === '--no-analyze') {
      autoAnalyze = false;
    } else if (arg === '--help' || arg === '-h') {
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║          Historical Import Tool - Usage                    ║');
      console.log('╠═══════════════════════════════════════════════════════════╣');
      console.log('║                                                           ║');
      console.log('║  Usage: npm run import-historical [options]              ║');
      console.log('║                                                           ║');
      console.log('║  Options:                                                 ║');
      console.log('║    --phone-number-id <id>   Phone number ID to import    ║');
      console.log('║    --user-id <id>           Filter by user ID            ║');
      console.log('║    --start-date <date>      Start date (ISO format)      ║');
      console.log('║    --end-date <date>        End date (ISO format)         ║');
      console.log('║    --max-calls <number>     Max calls to import (1000)    ║');
      console.log('║    --no-analyze             Skip auto-analysis            ║');
      console.log('║                                                           ║');
      console.log('║  Examples:                                                ║');
      console.log('║    npm run import-historical                              ║');
      console.log('║    npm run import-historical --phone-number-id PNVbbBqeqM║');
      console.log('║    npm run import-historical --start-date 2024-01-01     ║');
      console.log('║                                                           ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log('');
      process.exit(0);
    }
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║          Starting Historical Import                        ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  if (phoneNumberId) {
    console.log(`║  Phone Number ID: ${phoneNumberId.padEnd(40)}║`);
  }
  if (userId) {
    console.log(`║  User ID: ${userId.padEnd(48)}║`);
  }
  if (startDate) {
    console.log(`║  Start Date: ${startDate.toISOString().padEnd(42)}║`);
  }
  if (endDate) {
    console.log(`║  End Date: ${endDate.toISOString().padEnd(44)}║`);
  }
  console.log(`║  Max Calls: ${String(maxCalls).padEnd(47)}║`);
  console.log(`║  Auto-Analyze: ${String(autoAnalyze).padEnd(44)}║`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const stats = await importHistoricalCalls({
      phoneNumberId,
      userId,
      startDate,
      endDate,
      maxCalls,
      autoAnalyze,
    });

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              Import Complete!                              ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Calls fetched: ${String(stats.callsFetched).padEnd(42)}║`);
    console.log(`║  New calls: ${String(stats.callsNew).padEnd(47)}║`);
    console.log(`║  Updated calls: ${String(stats.callsUpdated).padEnd(42)}║`);
    console.log(`║  Transcripts fetched: ${String(stats.transcriptsFetched).padEnd(36)}║`);
    console.log(`║  Analyzed: ${String(stats.analyzed).padEnd(47)}║`);
    console.log(`║  Errors: ${String(stats.errors.length).padEnd(49)}║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');

    if (stats.errors.length > 0) {
      console.log('⚠️  Some errors occurred during import. Check logs above for details.');
    }

    process.exit(stats.errors.length > 0 ? 1 : 0);
  } catch (error) {
    console.error('');
    console.error('❌ Import failed:', error instanceof Error ? error.message : String(error));
    console.error('');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

