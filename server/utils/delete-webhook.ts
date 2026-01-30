/**
 * Script to delete a webhook from OpenPhone API by ID
 * Usage: npm run delete-webhook <webhook-id>
 */

import axios from 'axios';
import 'dotenv/config';

async function deleteWebhook() {
  const webhookId = process.argv[2];
  
  if (!webhookId) {
    console.error('❌ Missing webhook ID');
    console.log('');
    console.log('Usage:');
    console.log('  npm run delete-webhook <webhook-id>');
    console.log('');
    console.log('Example:');
    console.log('  npm run delete-webhook WH6de81173d0cb42a9b73650c9e82a4054');
    console.log('');
    console.log('Get webhook IDs by running: npm run list-webhooks');
    process.exit(1);
  }

  const apiKey = process.env.OPENPHONE_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENPHONE_API_KEY not found in .env');
    process.exit(1);
  }

  console.log(`Deleting webhook: ${webhookId}...`);

  try {
    const response = await axios.delete(
      `https://api.openphone.com/v1/webhooks/${webhookId}`,
      {
        headers: {
          'Authorization': apiKey,
        },
      }
    );

    console.log('✅ Webhook deleted successfully!');
    console.log('');

  } catch (error: any) {
    console.error('❌ Failed to delete webhook');
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

deleteWebhook();

