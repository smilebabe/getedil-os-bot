import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

function findAndLoadEnv(): void {
  let cwd = process.cwd();
  const root = path.parse(cwd).root;
  while (cwd !== root) {
    const envPath = path.join(cwd, '.env');
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      console.log('📄 Loaded .env from', envPath);
      return;
    }
    cwd = path.dirname(cwd);
  }
  dotenv.config();
}
findAndLoadEnv();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development','staging','production']).default('development'),
  LOG_LEVEL: z.enum(['trace','debug','info','warn','error','fatal']).default('info'),
  LOG_PRETTY: z.coerce.boolean().default(false),
  RATE_LIMIT_MAX: z.coerce.number().default(30),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  HF_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  CEREBRAS_API_KEY: z.string().optional(),
  CF_ACCOUNT_ID: z.string().optional(),
  CF_API_TOKEN: z.string().optional(),
});

export type AppConfig = z.infer<typeof envSchema>;
let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  const r = envSchema.safeParse(process.env);
  if (!r.success) {
    console.error('❌ Config error:', JSON.stringify(r.error.flatten(), null, 2));
    throw new Error('TELEGRAM_BOT_TOKEN required');
  }
  cached = r.data;
  const keys = [];
  if (r.data.GROQ_API_KEY) keys.push('Groq');
  if (r.data.GEMINI_API_KEY) keys.push('Gemini');
  if (r.data.DEEPSEEK_API_KEY) keys.push('DeepSeek');
  if (r.data.MISTRAL_API_KEY) keys.push('Mistral');
  if (r.data.CEREBRAS_API_KEY) keys.push('Cerebras');
  if (r.data.HF_API_KEY) keys.push('HuggingFace');
  if (r.data.CF_API_TOKEN) keys.push('Kimi');
  console.log('✅ Config loaded —', keys.length, 'providers:', keys.join(', '));
  return cached;
}
