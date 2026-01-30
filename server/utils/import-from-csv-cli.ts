/**
 * CLI wrapper for CSV import
 * Usage: npm run import-csv <path-to-csv> [user-filter]
 */

import { importFromOpenPhoneCSV } from './import-from-csv';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  const csvPath = process.argv[2];
  const userFilter = process.argv[3]; // Optional: "Joy Libed" or "Ali Simms"

  if (!csvPath) {
    console.error('');
    console.error('╔═══════════════════════════════════════════════════════════╗');
    console.error('║              CSV Import Tool - Usage                      ║');
    console.error('╠═══════════════════════════════════════════════════════════╣');
    console.error('║                                                           ║');
    console.error('║  Usage: npm run import-csv <path-to-csv> [user-filter]    ║');
    console.error('║                                                           ║');
    console.error('║  Examples:                                                ║');
    console.error('║    npm run import-csv ./openphone-export.csv              ║');
    console.error('║    npm run import-csv ./export.csv "Joy Libed"            ║');
    console.error('║    npm run import-csv ./export.csv "Ali Simms"            ║');
    console.error('║                                                           ║');
    console.error('║  Notes:                                                   ║');
    console.error('║    - CSV must be exported from OpenPhone dashboard        ║');
    console.error('║    - User filter is optional (case-insensitive)          ║');
    console.error('║    - Transcripts will be fetched from OpenPhone API     ║');
    console.error('║    - Calls will be auto-analyzed if transcripts exist    ║');
    console.error('║                                                           ║');
    console.error('╚═══════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  const fullPath = path.resolve(csvPath);

  if (!require('fs').existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              Starting CSV Import                         ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log(`║  File: ${fullPath.padEnd(53)}║`);
  if (userFilter) {
    console.log(`║  Filter: ${userFilter.padEnd(51)}║`);
  }
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const stats = await importFromOpenPhoneCSV({
      csvPath: fullPath,
      userFilter,
      autoAnalyze: true,
    });

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              Import Complete!                            ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Processed: ${String(stats.processed).padEnd(47)}║`);
    console.log(`║  Imported: ${String(stats.imported).padEnd(48)}║`);
    console.log(`║  Transcripts: ${String(stats.transcriptsFetched).padEnd(44)}║`);
    console.log(`║  Analyzed: ${String(stats.analyzed).padEnd(48)}║`);
    console.log(`║  Skipped: ${String(stats.skipped).padEnd(49)}║`);
    console.log(`║  Errors: ${String(stats.errors.length).padEnd(50)}║`);
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

