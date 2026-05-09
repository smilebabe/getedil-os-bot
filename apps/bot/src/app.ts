import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================
// Supabase Client
// ============================================
let supabase: SupabaseClient;
function getDb(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    console.log('📦 Supabase connected');
  }
  return supabase;
}

async function saveMessage(telegramId: number, role: string, content: string) {
  await getDb().from('conversation_history').insert({
    telegram_id: telegramId, role, content: content.slice(0, 4000),
  });
}

async function getRecentMessages(telegramId: number, limit = 6): Promise<Array<{ role: string; content: string }>> {
  const { data } = await getDb()
    .from('conversation_history')
    .select('role, content')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []).reverse();
}

async function getMessageCount(telegramId: number): Promise<number> {
  const { count } = await getDb()
    .from('conversation_history')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', telegramId);
  return count || 0;
}

async function upsertProfile(telegramId: number, firstName: string, username?: string) {
  await getDb().from('user_profiles').upsert({
    telegram_id: telegramId, first_name: firstName, username: username || null,
    last_active_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id' });
}

async function markModuleDone(telegramId: number, courseId: string, moduleId: string) {
  await getDb().from('course_progress').upsert({
    telegram_id: telegramId, course_id: courseId, module_id: moduleId,
    completed: true, completed_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id, course_id, module_id' });
}

async function getCompletedModules(telegramId: number, courseId: string): Promise<string[]> {
  const { data } = await getDb()
    .from('course_progress')
    .select('module_id')
    .eq('telegram_id', telegramId)
    .eq('course_id', courseId)
    .eq('completed', true);
  return (data || []).map((r: any) => r.module_id);
}

async function getAllCompletedCourses(telegramId: number): Promise<Array<{ course: string; completed: number; total: number }>> {
  const { data } = await getDb()
    .from('course_progress')
    .select('course_id, module_id')
    .eq('telegram_id', telegramId)
    .eq('completed', true);
  if (!data) return [];
  const grouped: Record<string, string[]> = {};
  for (const r of data) {
    if (!grouped[r.course_id]) grouped[r.course_id] = [];
    grouped[r.course_id]!.push(r.module_id);
  }
  return Object.entries(grouped).map(([course, modules]) => ({
    course, completed: modules.length, total: COURSES[course]?.modules.length || 0,
  }));
}

// ============================================
// Course Content Loader
// ============================================
const COURSES: Record<string, { title: string; modules: string[] }> = {
  'ai-engineering-101': {
    title: 'AI Engineering 101',
    modules: ['intro', 'prompt-engineering', 'vector-databases', 'llm-integration', 'building-apps'],
  },
  'bot-development': {
    title: 'Bot Development',
    modules: ['telegram-basics', 'python-bots', 'ai-integration'],
  },
};

function loadModuleContent(courseId: string, moduleId: string): string | null {
  const path = join('content', 'courses', courseId, `${moduleId}.md`);
  try { if (existsSync(path)) return readFileSync(path, 'utf-8'); } catch {}
  return null;
}

function getModuleTitle(_courseId: string, moduleId: string): string {
  const titles: Record<string, string> = {
    'intro': 'Introduction to AI',
    'prompt-engineering': 'Prompt Engineering',
    'vector-databases': 'Vector Databases',
    'llm-integration': 'LLM Integration',
    'building-apps': 'Building AI Apps',
    'telegram-basics': 'Telegram Bot Basics',
    'python-bots': 'Python Bots',
    'ai-integration': 'AI Integration',
  };
  return titles[moduleId] || moduleId;
}

function getNextModule(courseId: string, currentModule: string): string | null {
  const modules = COURSES[courseId]?.modules;
  if (!modules) return null;
  const idx = modules.indexOf(currentModule);
  if (idx < 0 || idx >= modules.length - 1) return null;
  return modules[idx + 1]!;
}

// ============================================
// AI Client
// ============================================
class AIClient {
  private gemini: GoogleGenerativeAI;
  private groq: Groq;
  constructor() {
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
  }
  async generateResponse(msg: string): Promise<string> {
    if (/[\u1200-\u137F]/.test(msg) && process.env.GEMINI_API_KEY) {
      const m = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `You are Getedil, an AI tutor for Ethiopian students. Speak natural Amharic.\n\nStudent: ${msg}` }] }] });
      return r.response.text();
    }
    try {
      const r = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'You are Getedil, an AI tutor for Ethiopian students. Be helpful and concise.' }, { role: 'user', content: msg }],
        max_tokens: 600,
      });
      return r.choices[0]?.message?.content || 'Error.';
    } catch { return 'Sorry, AI is temporarily unavailable.'; }
  }
}

// ============================================
// Voice Transcriber
// ============================================
class VoiceTranscriber {
  private gemini: GoogleGenerativeAI;
  constructor() { this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || ''); }
  async transcribe(fileUrl: string): Promise<{ text: string; language: string }> {
    const r = await fetch(fileUrl);
    const buf = Buffer.from(await r.arrayBuffer());
    const b64 = buf.toString('base64');
    const m = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const res = await m.generateContent([
      { text: 'Transcribe this audio. Output only the text.' },
      { inlineData: { mimeType: 'audio/ogg', data: b64 } },
    ]);
    const text = res.response.text().trim();
    return { text, language: /[\u1200-\u137F]/.test(text) ? 'am' : 'en' };
  }
}

// ============================================
// Bot Service
// ============================================
class BotService {
  private bot: Telegraf;
  constructor(private ai: AIClient, private transcriber: VoiceTranscriber | null, private webhookUrl: string) {
    this.bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

    // ============================================
    // Commands
    // ============================================
    this.bot.command('start', async (ctx) => {
      const id = ctx.from?.id;
      if (id) await upsertProfile(id, ctx.from?.first_name || 'Student', ctx.from?.username);
      await ctx.reply(
        '👋 Welcome to <b>Getedil</b>! 🚀\n\n📚 /courses | 💼 /jobs | 📝 /memory | 📊 /progress\n\nJust send a message or voice note!',
        { parse_mode: 'HTML' }
      );
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply('📚 /courses | 💼 /jobs | 📝 /memory | 📊 /progress | /help');
    });

    // ============================================
    // Courses
    // ============================================
    this.bot.command('courses', async (ctx) => {
      await ctx.reply(
        '📚 <b>Courses</b>\n\n' +
        '<b>AI Engineering 101</b> - 5 modules\n👉 /learn ai-engineering-101\n\n' +
        '<b>Bot Development</b> - 3 modules\n👉 /learn bot-development',
        { parse_mode: 'HTML' }
      );
    });

    this.bot.command('learn', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      const telegramId = ctx.from?.id;
      if (!args.length) { await ctx.reply('/learn <course> [module]'); return; }

      const courseId = args[0]!;
      const course = COURSES[courseId];
      if (!course) { await ctx.reply('Course not found. /courses'); return; }

      if (!args[1]) {
        // Show module list with completion status
        const completed = telegramId ? await getCompletedModules(telegramId, courseId) : [];
        const modList = course.modules.map((m, i) => {
          const done = completed.includes(m) ? ' ✅' : '';
          return `${i + 1}. ${getModuleTitle(courseId, m)}${done}\n   👉 /learn ${courseId} ${m}`;
        }).join('\n\n');
        await ctx.reply(`📚 <b>${course.title}</b>\n\n${modList}`, { parse_mode: 'HTML' });
        return;
      }

      const moduleId = args[1]!;
      const content = loadModuleContent(courseId, moduleId);

      if (!content) {
        await ctx.reply(`📚 <b>${getModuleTitle(courseId, moduleId)}</b>\n\nContent loading...\n👉 /learn ${courseId}`, { parse_mode: 'HTML' });
        return;
      }

      // Mark module as completed
      if (telegramId) await markModuleDone(telegramId, courseId, moduleId);

      const truncated = content.length > 3800 ? content.slice(0, 3800) + '\n\n...' : content;
      await ctx.reply(truncated, { parse_mode: 'HTML' });

      const next = getNextModule(courseId, moduleId);
      if (next) {
        await ctx.reply(`➡️ <b>Next:</b> ${getModuleTitle(courseId, next)}\n👉 /learn ${courseId} ${next}`, { parse_mode: 'HTML' });
      } else {
        await ctx.reply('🎉 <b>Course Complete!</b> 🏆\n\nCheck /progress', { parse_mode: 'HTML' });
      }
    });

    // ============================================
    // Jobs
    // ============================================
    this.bot.command('jobs', async (ctx) => {
      await ctx.reply(
        '💼 <b>Ethiopian Tech Jobs</b>\n\n' +
        'AI/ML Engineer - Ethiopian AI Institute\n' +
        'Full Stack Dev - Safaricom Ethiopia\n' +
        'Python Developer - Remote/Addis\n' +
        'Data Scientist - CBE\n' +
        'AI Trainer - Upwork/Fiverr',
        { parse_mode: 'HTML' }
      );
    });

    // ============================================
    // Memory (REAL)
    // ============================================
    this.bot.command('memory', async (ctx) => {
      const id = ctx.from?.id;
      if (!id) { await ctx.reply('Cannot identify user.'); return; }
      const total = await getMessageCount(id);
      if (!total) { await ctx.reply('📝 No messages yet. Send me something!'); return; }
      const recent = await getRecentMessages(id, 4);
      let m = `📝 <b>Your Memory</b> (${total} messages)\n\n<b>Recent:</b>\n`;
      for (const r of recent) {
        m += `${r.role === 'user' ? '👤' : '🤖'} ${(r as any).content.slice(0, 120)}\n`;
      }
      await ctx.reply(m, { parse_mode: 'HTML' });
    });

    // ============================================
    // Progress (REAL)
    // ============================================
    this.bot.command('progress', async (ctx) => {
      const id = ctx.from?.id;
      if (!id) { await ctx.reply('Cannot identify user.'); return; }
      const msgCount = await getMessageCount(id);
      const courses = await getAllCompletedCourses(id);
      let m = `📊 <b>Your Progress</b>\n\n💬 Messages: ${msgCount}\n\n`;
      if (courses.length) {
        m += '<b>Courses:</b>\n';
        for (const c of courses) {
          const course = COURSES[c.course];
          m += `📚 ${course?.title || c.course}: ${c.completed}/${c.total} modules\n`;
        }
      } else {
        m += '📚 No courses yet. Try /learn ai-engineering-101!';
      }
      await ctx.reply(m, { parse_mode: 'HTML' });
    });

    // ============================================
    // Voice & Text Handlers
    // ============================================
    this.bot.on('voice', async (ctx) => {
      const id = ctx.from?.id;
      if (!this.transcriber) { await ctx.reply('🎤 Voice not available.'); return; }
      await ctx.reply('🎤 Transcribing...');
      try {
        const url = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const { text } = await this.transcriber.transcribe(url.href);
        if (id) await saveMessage(id, 'user', `🎤 ${text}`);
        await ctx.reply(`📝 <i>"${text}"</i>\n🤖 Thinking...`, { parse_mode: 'HTML' });
        const reply = await this.ai.generateResponse(text);
        if (id) await saveMessage(id, 'assistant', reply);
        await ctx.reply(reply);
      } catch { await ctx.reply('❌ Failed.'); }
    });

    this.bot.on('text', async (ctx) => {
      const msg = ctx.message.text;
      const id = ctx.from?.id;
      if (msg.startsWith('/')) return;
      if (id) {
        await upsertProfile(id, ctx.from?.first_name || '', ctx.from?.username);
        await saveMessage(id, 'user', msg);
      }
      await ctx.sendChatAction('typing');
      try {
        const reply = await this.ai.generateResponse(msg);
        if (id) await saveMessage(id, 'assistant', reply);
        await ctx.reply(reply);
      } catch(e: any) { console.error('❌ Text error:', e.message); await ctx.reply('Error.'); }
    });

    this.bot.catch(async (err) => { console.error(err); });
  }

  async start(): Promise<void> {
    console.log('🤖 Starting webhook mode...');
    await this.bot.launch({ webhook: { domain: new URL(this.webhookUrl).hostname, port: 3000 } });
    console.log('✅ Webhook at:', this.webhookUrl);
  }
  async stop(): Promise<void> { await this.bot.stop(); }
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('\nGETEDIL-OS-BOT: Thermodynamic Edition\n');

  const port = parseInt(process.env.PORT || '3000');
  const renderUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;

  createServer((req, res) => {
    if (req.url === '/health') { res.writeHead(200).end('OK'); return; }
    res.writeHead(200).end('GETEDIL-OS-BOT');
  }).listen(port, () => console.log('🏥 Health :' + port));

  const ai = new AIClient();
  const transcriber = process.env.GEMINI_API_KEY ? new VoiceTranscriber() : null;
  const bot = new BotService(ai, transcriber, renderUrl);
  await bot.start();

  process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });
  process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
  console.log('✅ Running');
}
main().catch(e => { console.error('❌', e); process.exit(1); });
// Force rebuild Sat May  9 03:44:31 PDT 2026
