/**
 * Extract unique participant phone numbers from CSV exports
 * Used to work around OpenPhone API limitation requiring participants parameter
 */

import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

export function extractParticipantsFromCSV(csvPath: string): string[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`[Extract Participants] CSV file not found: ${csvPath}`);
    return [];
  }

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const participants = new Set<string>();

  records.forEach((record: any) => {
    // Try multiple possible column names for "from" and "to"
    const fromFields = ['from', 'From', 'FROM', 'from_number', 'From Number', 'Caller'];
    const toFields = ['to', 'To', 'TO', 'to_number', 'To Number', 'Recipient'];

    // Extract "from" number
    for (const field of fromFields) {
      if (record[field] && record[field] !== 'Anonymous' && record[field].trim() !== '') {
        const number = normalizePhoneNumber(record[field]);
        if (number && number.length > 0) {
          participants.add(number);
        }
      }
    }

    // Extract "to" number
    for (const field of toFields) {
      if (record[field] && record[field].trim() !== '') {
        const number = normalizePhoneNumber(record[field]);
        if (number && number.length > 0) {
          participants.add(number);
        }
      }
    }
  });

  // Remove your own phone numbers (they're not participants)
  const ownNumbers = [
    '+14125739101', // Main business line
    '+14127724291', // Outbound line
    '14125739101',
    '14127724291',
    '(412) 573-9101',
    '(412) 772-4291',
    '412-573-9101',
    '412-772-4291',
  ];

  ownNumbers.forEach(num => {
    participants.delete(num);
    participants.delete(normalizePhoneNumber(num));
  });

  const uniqueParticipants = Array.from(participants).filter(p => p.length > 0);

  console.log(`[Extract Participants] Found ${uniqueParticipants.length} unique participant phone numbers`);
  
  return uniqueParticipants;
}

/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX)
 */
function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';

  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // If it starts with +1, keep it
  if (cleaned.startsWith('+1')) {
    return cleaned;
  }

  // If it starts with 1 (without +), add +
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return '+' + cleaned;
  }

  // If it's 10 digits, assume US number and add +1
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  }

  // If it's 11 digits starting with 1, add +
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+' + cleaned;
  }

  // Return as-is if we can't normalize
  return cleaned;
}

