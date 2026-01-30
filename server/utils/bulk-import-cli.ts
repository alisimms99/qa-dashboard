/**
 * CLI wrapper for bulk import
 * Usage: npm run bulk-import <joy|ali|all>
 */

import 'dotenv/config'; // Load environment variables from .env file

import { bulkFetchCallsByUser } from './bulk-fetch-calls-by-user';

async function main() {
  const command = process.argv[2];
  const csvPaths = process.argv.slice(3).filter(arg => arg.endsWith('.csv'));

  if (!command || !['joy', 'ali', 'all'].includes(command)) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════╗');
    console.error('║          Bulk Import Tool - Usage                          ║');
    console.error('╠═══════════════════════════════════════════════════════════╣');
    console.error('║                                                           ║');
    console.error('║  Usage: npm run bulk-import <joy|ali|all>                ║');
    console.error('║                                                           ║');
    console.error('║  Examples:                                                ║');
    console.error('║    npm run bulk-import joy [csv1.csv] [csv2.csv]        ║');
    console.error('║    npm run bulk-import ali [csv1.csv]                     ║');
    console.error('║    npm run bulk-import all [csv1.csv] [csv2.csv]          ║');
    console.error('║                                                           ║');
    console.error('║  CSV files (optional):                                    ║');
    console.error('║    Provide CSV export files to extract participant numbers║');
    console.error('║    This helps fetch ALL calls (API limitation workaround)║');
    console.error('║                                                           ║');
    console.error('║  Note: This will take 15-25 minutes depending on volume   ║');
    console.error('║                                                           ║');
    console.error('╚═══════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  try {
    if (command === 'joy' || command === 'all') {
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║     IMPORTING JOY\'S OUTBOUND CALLS                        ║');
      console.log('║     (~235 calls, ~15-18 minutes)                          ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log('');

      const joyStats = await bulkFetchCallsByUser({
        userId: process.env.OPENPHONE_USER_ID_JOY || 'USO5QGjyIS', // Joy's OpenPhone User ID
        direction: 'outgoing',
        phoneNumberId: process.env.OPENPHONE_OUTBOUND_PHONE_NUMBER_ID, // Joy's calls are on outbound line
        maxCalls: 500,
        autoAnalyze: true,
        delayMs: 1500,
        csvPaths: csvPaths.length > 0 ? csvPaths : undefined,
        participantBatchSize: 1, // OpenPhone only allows 1 participant per request
      });

      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║     JOY\'S IMPORT COMPLETE                                  ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`Imported: ${joyStats.callsImported} calls`);
      console.log(`Transcripts: ${joyStats.transcriptsFetched}`);
      console.log(`Analyzed: ${joyStats.callsAnalyzed}`);
      console.log('');
    }

    if (command === 'ali' || command === 'all') {
      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║     IMPORTING ALI\'S INBOUND CALLS                         ║');
      console.log('║     (~50-100 calls, ~8-10 minutes)                        ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log('');

      const aliStats = await bulkFetchCallsByUser({
        userId: process.env.OPENPHONE_USER_ID_ALI || 'USamAZurZL', // Ali's OpenPhone User ID
        direction: 'incoming',
        phoneNumberId: process.env.OPENPHONE_MAIN_PHONE_NUMBER_ID, // Ali's calls are on main line
        maxCalls: 200,
        autoAnalyze: true,
        delayMs: 1500,
        csvPaths: csvPaths.length > 0 ? csvPaths : undefined,
        participantBatchSize: 1, // OpenPhone only allows 1 participant per request
      });

      console.log('');
      console.log('╔═══════════════════════════════════════════════════════════╗');
      console.log('║     ALI\'S IMPORT COMPLETE                                  ║');
      console.log('╚═══════════════════════════════════════════════════════════╝');
      console.log(`Imported: ${aliStats.callsImported} calls`);
      console.log(`Transcripts: ${aliStats.transcriptsFetched}`);
      console.log(`Analyzed: ${aliStats.callsAnalyzed}`);
      console.log('');
    }

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║     ✅ ALL IMPORTS COMPLETE!                               ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Next steps:');
    console.log('  1. View calls in the dashboard');
    console.log('  2. Generate training manual from high-scoring calls');
    console.log('  3. Review outbound analytics');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════╗');
    console.error('║     ❌ IMPORT FAILED                                       ║');
    console.error('╚═══════════════════════════════════════════════════════════╝');
    console.error('');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

