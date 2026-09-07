/**
 * Tiny script to dump the loaded Config so we can verify
 * each env var is wired up. Run with:  npx tsx scripts/verify-config.ts
 */
import 'dotenv/config';
import { config } from '../src/shared/config/index.js';

const rows: Array<[string, string]> = [
  ['DATABASE_URL', config.databaseUrl ? `✓ set (${config.databaseUrl.slice(0, 40)}...)` : '✗ MISSING'],
  ['CLERK_SECRET_KEY', config.clerkSecretKey ? '✓ set' : '✗ MISSING'],
  ['CLERK_PUBLISHABLE_KEY', config.clerkPublishableKey ? '✓ set' : '(empty - optional)'],
  ['GEMINI_API_KEY', config.geminiApiKey ? '✓ set' : '✗ MISSING'],
  ['OPENROUTER_API_KEY', config.openRouterApiKey ? '✓ set' : '(empty - optional)'],
  ['DEEPGRAM_API_KEY', config.deepgramApiKey ? '✓ set' : '(empty - optional)'],
  ['CLOUDINARY_CLOUD_NAME', config.cloudinaryCloudName ? `✓ ${config.cloudinaryCloudName}` : '✗ MISSING'],
  ['CLOUDINARY_API_KEY', config.cloudinaryApiKey ? '✓ set' : '✗ MISSING'],
  ['CLOUDINARY_API_SECRET', config.cloudinaryApiSecret ? '✓ set' : '✗ MISSING'],
  ['RAZORPAY_KEY_ID', config.razorpayKeyId ? `✓ ${config.razorpayKeyId}` : '(empty - optional)'],
  ['RAZORPAY_KEY_SECRET', config.razorpayKeySecret ? '✓ set' : '(empty - optional)'],
  ['RAZORPAY_WEBHOOK_SECRET', config.razorpayWebhookSecret ? '✓ set' : '(empty - optional)'],
  ['FRONTEND_URL', config.frontendUrl],
  ['PORT', String(config.port)],
  ['NODE_ENV', config.nodeEnv],
  ['FREE_TRIAL_LIMIT', String(config.freeTrialLimit)],
  ['ADMIN_EMAILS', config.adminEmails.length > 0 ? config.adminEmails.join(', ') : '(none)'],
];

console.log('=== Loaded Config ===');
const maxNameLen = Math.max(...rows.map(([n]) => n.length));
for (const [name, value] of rows) {
  console.log(`${name.padEnd(maxNameLen + 1)}  ${value}`);
}
