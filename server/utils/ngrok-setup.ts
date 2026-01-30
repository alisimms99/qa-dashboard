/**
 * Ngrok Setup Utility
 * Creates a public tunnel to localhost for webhook testing
 */

import ngrok from '@ngrok/ngrok';

export async function startNgrok(port: number): Promise<string> {
  try {
    const authtoken = process.env.NGROK_AUTH_TOKEN;
    
    if (!authtoken) {
      console.error('❌ NGROK_AUTH_TOKEN not found in .env');
      console.log('');
      console.log('To get your ngrok auth token:');
      console.log('1. Sign up at https://ngrok.com');
      console.log('2. Go to https://dashboard.ngrok.com/get-started/your-authtoken');
      console.log('3. Copy your token and add to .env:');
      console.log('   NGROK_AUTH_TOKEN=your_token_here');
      console.log('');
      throw new Error('NGROK_AUTH_TOKEN required');
    }

    console.log('[Ngrok] Starting tunnel...');
    
    const listener = await ngrok.forward({
      addr: port,
      authtoken,
    });
    const url = listener.url();
    
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                  🌐 NGROK TUNNEL ACTIVE                   ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log(`║  Public URL: ${url.padEnd(46)}║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  📋 COPY THIS URL TO REGISTER WEBHOOK:                   ║');
    console.log(`║                                                           ║`);
    console.log(`║  ${`${url}/webhooks/openphone/calls`.padEnd(57)}║`);
    console.log(`║                                                           ║`);
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║  Next steps:                                              ║');
    console.log('║  1. Copy the webhook URL above                            ║');
    console.log('║  2. Go to OpenPhone webhook settings                      ║');
    console.log('║  3. Add webhook URL for call.completed events             ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    
    return url;
  } catch (error) {
    console.error('❌ Failed to start ngrok:', error);
    throw error;
  }
}

