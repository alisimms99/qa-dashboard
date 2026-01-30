/**
 * One-time script to register webhooks with OpenPhone API
 * Usage: npm run register-webhooks <ngrok-url>
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

async function registerWebhooks() {
  // Get ngrok URL from command line argument
  const ngrokUrl = process.argv[2];
  
  if (!ngrokUrl) {
    console.error('❌ Missing ngrok URL');
    console.log('');
    console.log('Usage:');
    console.log('  npm run register-webhooks <base-ngrok-url>');
    console.log('');
    console.log('Example:');
    console.log('  npm run register-webhooks https://abc123.ngrok.io');
    console.log('');
    console.log('Note: Do NOT include /webhooks/openphone/calls - it will be added automatically');
    console.log('');
    console.log('Get your ngrok URL from the console when you run: npm run dev');
    process.exit(1);
  }

  // Check if URL already includes the webhook path
  const webhookUrl = ngrokUrl.includes('/webhooks/openphone/calls') 
    ? ngrokUrl 
    : `${ngrokUrl}/webhooks/openphone/calls`;
  const apiKey = process.env.OPENPHONE_API_KEY;

  if (!apiKey) {
    console.error('❌ OPENPHONE_API_KEY not found in .env');
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  Registering Webhook with OpenPhone');
  console.log('═══════════════════════════════════════════');
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log('Events: call.completed');
  console.log('Resource IDs: * (all phone numbers)');
  console.log('═══════════════════════════════════════════');
  console.log('');

  try {
    // Try the endpoint from user's requirements first
    // If it doesn't work, we'll try /v1/webhooks
    let response;
    try {
      response = await axios.post(
        'https://api.openphone.com/v1/webhooks/calls',
        {
          url: webhookUrl,
          events: ['call.completed'],
          resourceIds: ['*'], // All phone numbers
          status: 'enabled',
          label: 'QA Dashboard - Call Analysis',
        },
        {
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
        }
      );
    } catch (firstError: any) {
      // If /v1/webhooks/calls doesn't work, try /v1/webhooks
      if (firstError.response?.status === 404) {
        console.log('⚠️  /v1/webhooks/calls not found, trying /v1/webhooks...');
        response = await axios.post(
          'https://api.openphone.com/v1/webhooks',
          {
            url: webhookUrl,
            events: ['call.completed'],
            resourceIds: ['*'], // All phone numbers
            status: 'enabled',
            label: 'QA Dashboard - Call Analysis',
          },
          {
            headers: {
              'Authorization': apiKey,
              'Content-Type': 'application/json',
            },
          }
        );
      } else {
        throw firstError;
      }
    }

    console.log('✅ Webhook registered successfully!');
    console.log('');
    console.log('Webhook Details:');
    console.log('─────────────────────────────────────────');
    console.log(`ID: ${response.data.data.id}`);
    console.log(`URL: ${response.data.data.url}`);
    console.log(`Status: ${response.data.data.status}`);
    console.log(`Events: ${response.data.data.events.join(', ')}`);
    console.log(`Resource IDs: ${Array.isArray(response.data.data.resourceIds) ? response.data.data.resourceIds.join(', ') : response.data.data.resourceIds}`);
    console.log('─────────────────────────────────────────');
    console.log('');

    // Save webhook config for reference
    const webhookConfig = {
      webhookId: response.data.data.id,
      webhookUrl,
      ngrokUrl,
      registeredAt: new Date().toISOString(),
      events: response.data.data.events,
      resourceIds: response.data.data.resourceIds,
    };

    const configPath = path.join(process.cwd(), 'server', '.webhook-config.json');
    fs.writeFileSync(configPath, JSON.stringify(webhookConfig, null, 2));
    
    console.log('✅ Webhook config saved to server/.webhook-config.json');
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  SETUP COMPLETE!');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('The system will now automatically:');
    console.log('  • Receive webhook when calls complete');
    console.log('  • Save call data to database');
    console.log('  • Fetch transcripts');
    console.log('  • Analyze qualifying calls');
    console.log('');
    console.log('Make a test call to verify it works!');
    console.log('');

  } catch (error: any) {
    console.error('❌ Failed to register webhook');
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
      console.error('Request:', error.request);
    } else {
      console.error('Error:', error.message);
    }
    console.error('');
    process.exit(1);
  }
}

registerWebhooks();

