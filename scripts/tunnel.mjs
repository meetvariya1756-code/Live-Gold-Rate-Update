import { startTunnel } from 'untun';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('\n🚀 Starting Cloudflare tunnel to http://localhost:3000 ...');

  try {
    const tunnel = await startTunnel({ port: 3000 });
    const url = await tunnel.getURL();

    console.log('\n============================================================');
    console.log('✅ CLOUDFLARE TUNNEL IS ONLINE!');
    console.log('🌐 Public HTTPS URL:');
    console.log('   ' + url);
    console.log('============================================================');

    // Automatically update .env with the active tunnel URL
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (envContent.includes('SHOPIFY_APP_URL=')) {
        envContent = envContent.replace(/SHOPIFY_APP_URL=.*/, `SHOPIFY_APP_URL=${url}`);
      } else {
        envContent += `\nSHOPIFY_APP_URL=${url}\n`;
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
      console.log('📝 Updated .env with SHOPIFY_APP_URL=' + url);
    }

    console.log('\n🔗 YOUR FINAL INSTALLATION URL FOR DEV-TRAINING-001:');
    console.log(`   ${url}/api/auth/shopify?shop=dev-training-001.myshopify.com`);
    console.log('\n⚠️  Keep this terminal open while testing! Press Ctrl+C to stop.\n');
  } catch (err) {
    console.error('❌ Failed to start tunnel:', err);
    process.exit(1);
  }
}

main();
