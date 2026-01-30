/**
 * Script to list all registered webhooks from OpenPhone API
 * Usage: npm run list-webhooks
 */

import axios from 'axios';
import 'dotenv/config';

async function listWebhooks() {
  const apiKey = process.env.OPENPHONE_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENPHONE_API_KEY not found in .env');
    process.exit(1);
  }

  console.log('Fetching all webhooks from OpenPhone...\n');

  try {
    const response = await axios.get(
      'https://api.openphone.com/v1/webhooks',
      {
        headers: {
          'Authorization': apiKey,
        },
      }
    );

    const webhooks = response.data.data || [];

    if (webhooks.length === 0) {
      console.log('No webhooks found.');
      return;
    }

    console.log(`Found ${webhooks.length} webhook(s):\n`);

    webhooks.forEach((webhook: any, index: number) => {
      console.log(`Webhook ${index + 1}:`);
      console.log('─────────────────────────────────────────');
      console.log(`ID: ${webhook.id}`);
      console.log(`URL: ${webhook.url}`);
      console.log(`Status: ${webhook.status}`);
      console.log(`Events: ${webhook.events?.join(', ') || 'N/A'}`);
      console.log(`Resource IDs: ${Array.isArray(webhook.resourceIds) ? webhook.resourceIds.join(', ') : webhook.resourceIds || 'N/A'}`);
      console.log(`Label: ${webhook.label || 'N/A'}`);
      if (webhook.createdAt) {
        console.log(`Created: ${new Date(webhook.createdAt).toLocaleString()}`);
      }
      console.log('─────────────────────────────────────────\n');
    });

  } catch (error: any) {
    console.error('❌ Failed to fetch webhooks');
    console.error('');
    if (error.response) {
      console.error('API Error Response:');
      console.error(`Status: ${error.response.status}`);
      console.error(`Status Text: ${error.response.statusText}`);
      if (error.response.data) {
        console.error('Response Data:');
        console.error(JSON.stringify(error.response.data, null, 2));
      }
    } else if (error.request) {
      console.error('No response received from API');
      console.error('Error:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

listWebhooks();

