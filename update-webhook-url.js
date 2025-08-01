#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Čita trenutni shopify.app.toml
const tomlPath = './shopify.app.toml';
let tomlContent = readFileSync(tomlPath, 'utf8');

// Extract trenutni application_url
const urlMatch = tomlContent.match(/application_url = "(.+)"/);
if (!urlMatch) {
  console.error('Nije moguće pronaći application_url u shopify.app.toml');
  process.exit(1);
}

const currentUrl = urlMatch[1];
console.log(`🔗 Trenutni URL: ${currentUrl}`);

// Ažuriraj webhook URI sa kompletnim URL-om
const fullWebhookUrl = `${currentUrl}/api/webhooks/orders/create`;

// Više fleksibilna regex za replacement
tomlContent = tomlContent.replace(
  /uri = "https?:\/\/[^"]+\/api\/webhooks\/orders\/create"/,
  `uri = "${fullWebhookUrl}"`
);

// Fallback ako nije našao postojeći webhook URI
if (!tomlContent.includes(fullWebhookUrl)) {
  tomlContent = tomlContent.replace(
    /uri = "[^"]*"/,
    `uri = "${fullWebhookUrl}"`
  );
}

// Zapisuj ažurirani fajl
writeFileSync(tomlPath, tomlContent);
console.log(`✅ Webhook URL ažuriran na: ${fullWebhookUrl}`);

// Opcionalno: restartuj webhooks
try {
  console.log('🔄 Restartovanje webhook-ova...');
  execSync('shopify app generate webhook', { stdio: 'inherit' });
} catch (err) {
  console.log('⚠️ Webhook restart nije uspešan, možda treba ručno');
}