// Centralized config; sensitive keys are env-var-only, never hardcoded.

interface Config {
  databaseUrl: string;
  clerkPublishableKey: string;
  clerkSecretKey: string;
  geminiApiKey?: string;
  geminiModel: string;

  // OpenRouter — fallback AI provider
  openRouterApiKey?: string;
  openRouterModel: string;

  deepgramApiKey?: string;

  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;

  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;

  frontendUrl: string;
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  freeTrialLimit: number;

  // Founder escape hatch: unlimited access without touching the DB flag.
  adminEmails: string[];
}

/** camelCase config key → SCREAMING_SNAKE_CASE env var name. */
function toEnvKey(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m}`).toUpperCase();
}

function getConfig(): Config {
  const requiredKeys: (keyof Config)[] = ['databaseUrl', 'clerkSecretKey', 'cloudinaryCloudName', 'cloudinaryApiKey', 'cloudinaryApiSecret'];

  for (const key of requiredKeys) {
    const value = process.env[toEnvKey(key)];
    if (!value) {
      throw new Error(`Missing required environment variable: ${toEnvKey(key)}`);
    }
  }

  return {
    databaseUrl: process.env.DATABASE_URL!,
    clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? '',
    clerkSecretKey: process.env.CLERK_SECRET_KEY!,
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free',
    deepgramApiKey: process.env.DEEPGRAM_API_KEY,
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME!,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY!,
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET!,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    nodeEnv: (process.env.NODE_ENV as Config['nodeEnv']) ?? 'development',
    port: parseInt(process.env.PORT ?? '4000', 10),
    freeTrialLimit: parseInt(process.env.FREE_TRIAL_LIMIT ?? '5', 10),
    // Comma-separated list, e.g. ADMIN_EMAILS="founder@x.com,pm@x.com".
    // Lowercased + trimmed so callers can match case-insensitively.
    adminEmails: (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  };
}

export const config = getConfig();
