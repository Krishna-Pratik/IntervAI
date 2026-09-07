/**
 * Live ping every external service. Run with:  npx tsx scripts/ping-services.ts
 *
 * Each block:
 *  1. Hits a real endpoint with the configured key
 *  2. Prints ✓ / ✗ + short status (status code, latency, sample payload)
 *  3. Never throws — wraps each check in try/catch so one failure
 *     doesn't block the others.
 *
 * Does NOT mutate any external state. Read-only checks only.
 */
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import { neon } from '@neondatabase/serverless';

const RESULT = {
  pass: 0,
  fail: 0,
  skip: 0,
} as { pass: number; fail: number; skip: number };

async function ping<T>(
  name: string,
  fn: () => Promise<T>,
  onOk: (value: T) => string,
): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    console.log(`  ✓ ${name.padEnd(22)}  (${String(ms).padStart(4)}ms)  ${onOk(result)}`);
    RESULT.pass += 1;
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ ${name.padEnd(22)}  (${String(ms).padStart(4)}ms)  ${msg.slice(0, 200)}`);
    RESULT.fail += 1;
  }
}

function ok(value: unknown): string {
  return value === '' || value == null ? '✓' : String(value);
}

async function main(): Promise<void> {
  // ---------- 1. Database (Neon) ----------
  console.log('\n[1] Database  (Neon PostgreSQL)');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('  ⊘ DATABASE_URL not set — skipping');
    RESULT.skip += 1;
  } else {
    await ping(
      'neon / SQL',
      async () => {
        const sql = neon(dbUrl);
        const rows = await sql`SELECT 1 AS one, now() AS ts`;
        return rows[0];
      },
      (r) => `query ok, server time = ${(r as { ts: string }).ts}`,
    );
  }

  // ---------- 2. Clerk ----------
  console.log('\n[2] Auth  (Clerk)');
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!clerkSecret) {
    console.log('  ⊘ CLERK_SECRET_KEY not set — skipping');
    RESULT.skip += 1;
  } else {
    await ping(
      'clerk / users.list',
      async () => {
        const res = await axios.get('https://api.clerk.com/v1/users?limit=1', {
          headers: { Authorization: `Bearer ${clerkSecret}` },
          timeout: 8_000,
          validateStatus: () => true,
        });
        if (res.status >= 400) {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
        }
        return { status: res.status, count: Array.isArray(res.data) ? res.data.length : 0 };
      },
      (r) => `HTTP ${(r as { status: number }).status}, ${(r as { count: number }).count} user(s) in sample`,
    );
  }

  // ---------- 3. Gemini ----------
  console.log('\n[3] AI  (Google Gemini)');
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.log('  ⊘ GEMINI_API_KEY not set — skipping');
    RESULT.skip += 1;
  } else {
    await ping(
      'gemini / generate',
      async () => {
        const genai = new GoogleGenerativeAI(geminiKey);
        const model = genai.getGenerativeModel({ model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash' });
        const result = await model.generateContent('Reply with exactly: PONG');
        return result.response.text().trim();
      },
      (r) => `model replied: "${(r as string).slice(0, 40)}"`,
    );
  }

  // ---------- 4. OpenRouter ----------
  console.log('\n[4] AI  (OpenRouter — fallback)');
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    console.log('  ⊘ OPENROUTER_API_KEY not set — skipping');
    RESULT.skip += 1;
  } else {
    await ping(
      'openrouter / chat',
      async () => {
        const res = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model: process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct:free',
            messages: [
              { role: 'system', content: 'You are a ping endpoint. Reply with exactly PONG.' },
              { role: 'user', content: 'ping' },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.FRONTEND_URL ?? 'http://localhost:3000',
              'X-Title': 'IntervAI',
            },
            timeout: 8_000,
            validateStatus: () => true,
          },
        );
        if (res.status >= 400) {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
        }
        const content = (res.data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? '';
        return { status: res.status, content: content.slice(0, 60) };
      },
      (r) => `HTTP ${(r as { status: number }).status}, "${(r as { content: string }).content}"`,
    );
  }

  // ---------- 5. Deepgram ----------
  console.log('\n[5] Speech  (Deepgram)');
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    console.log('  ⊘ DEEPGRAM_API_KEY not set — skipping');
    RESULT.skip += 1;
  } else {
    await ping(
      'deepgram / projects',
      async () => {
        const res = await axios.get('https://api.deepgram.com/v1/projects', {
          headers: { Authorization: `Token ${deepgramKey}` },
          timeout: 8_000,
          validateStatus: () => true,
        });
        if (res.status >= 400) {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
        }
        const projects = (res.data as { projects?: Array<{ project_id: string; name: string }> }).projects ?? [];
        return { status: res.status, count: projects.length, first: projects[0]?.name ?? '(none)' };
      },
      (r) =>
        `HTTP ${(r as { status: number }).status}, ${(r as { count: number }).count} project(s) (first: "${(r as { first: string }).first}")`,
    );
  }

  // ---------- 6. Cloudinary ----------
  console.log('\n[6] Storage  (Cloudinary)');
  const cName = process.env.CLOUDINARY_CLOUD_NAME;
  const cKey = process.env.CLOUDINARY_API_KEY;
  const cSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cName || !cKey || !cSecret) {
    console.log('  ⊘ Cloudinary keys not all set — skipping');
    RESULT.skip += 1;
  } else {
    await ping(
      'cloudinary / ping',
      async () => {
        cloudinary.config({
          cloud_name: cName,
          api_key: cKey,
          api_secret: cSecret,
          secure: true,
        });
        const result = await cloudinary.api.ping();
        return { status: (result as { status?: string }).status ?? 'unknown' };
      },
      (r) => `cloud "${cName}" replied: ${ok((r as { status: string }).status)}`,
    );
  }

  // ---------- 7. Razorpay ----------
  console.log('\n[7] Payments  (Razorpay)');
  const rzpId = process.env.RAZORPAY_KEY_ID;
  const rzpSecret = process.env.RAZORPAY_KEY_SECRET;
  if (!rzpId || !rzpSecret) {
    console.log('  ⊘ Razorpay keys not set — skipping');
    RESULT.skip += 1;
  } else {
    await ping(
      'razorpay / plans',
      async () => {
        const auth = Buffer.from(`${rzpId}:${rzpSecret}`).toString('base64');
        const res = await axios.get('https://api.razorpay.com/v1/plans?count=1', {
          headers: { Authorization: `Basic ${auth}` },
          timeout: 8_000,
          validateStatus: () => true,
        });
        if (res.status >= 400) {
          throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
        }
        const items = (res.data as { items?: unknown[] }).items ?? [];
        return { status: res.status, count: items.length };
      },
      (r) => `HTTP ${(r as { status: number }).status}, ${(r as { count: number }).count} plan(s)`,
    );
  }

  // ---------- summary ----------
  console.log('\n=== Summary ===');
  console.log(`  ${RESULT.pass} passed   ${RESULT.fail} failed   ${RESULT.skip} skipped`);
  if (RESULT.fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
