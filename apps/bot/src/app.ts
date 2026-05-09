import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ============================================
// Global Error Handlers
// ============================================
process.on('uncaughtException', (err) => console.error('💥 UNCAUGHT:', err.message));
process.on('unhandledRejection', (reason) => console.error('💥 REJECTION:', reason));

// ============================================
// Supabase (lazy init, fails gracefully)
// ============================================
let supabase: any = null;
function getDb(): any {
  if (supabase) return supabase;
  try {
    supabase = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
    console.log('📦 Supabase connected');
    return supabase;
  } catch(e: any) { console.error('❌ Supabase init:', e.message); return null; }
}

async function saveMessage(telegramId: number, role: string, content: string) {
  try { const db = getDb(); if (!db) return; await db.from('conversation_history').insert({ telegram_id: telegramId, role, content: content.slice(0, 4000) }); } catch {}
}

async function getRecentMessages(telegramId: number, limit = 6): Promise<Array<{ role: string; content: string }>> {
  try { const db = getDb(); if (!db) return []; const { data } = await db.from('conversation_history').select('role, content').eq('telegram_id', telegramId).order('created_at', { ascending: false }).limit(limit); return (data || []).reverse(); } catch { return []; }
}

async function getMessageCount(telegramId: number): Promise<number> {
  try { const db = getDb(); if (!db) return 0; const { count } = await db.from('conversation_history').select('*', { count: 'exact', head: true }).eq('telegram_id', telegramId); return count || 0; } catch { return 0; }
}

async function upsertProfile(telegramId: number, firstName: string, username?: string) {
  try { const db = getDb(); if (!db) return; await db.from('user_profiles').upsert({ telegram_id: telegramId, first_name: firstName, username: username || null, last_active_at: new Date().toISOString() }, { onConflict: 'telegram_id' }); } catch {}
}

async function markModuleDone(telegramId: number, courseId: string, moduleId: string) {
  try { const db = getDb(); if (!db) return; await db.from('course_progress').upsert({ telegram_id: telegramId, course_id: courseId, module_id: moduleId, completed: true, completed_at: new Date().toISOString() }, { onConflict: 'telegram_id, course_id, module_id' }); } catch {}
}

async function getCompletedModules(telegramId: number, courseId: string): Promise<string[]> {
  try { const db = getDb(); if (!db) return []; const { data } = await db.from('course_progress').select('module_id').eq('telegram_id', telegramId).eq('course_id', courseId).eq('completed', true); return (data || []).map((r: any) => r.module_id); } catch { return []; }
}

async function getAllCompletedCourses(telegramId: number): Promise<Array<{ course: string; completed: number; total: number }>> {
  try { const db = getDb(); if (!db) return []; const { data } = await db.from('course_progress').select('course_id, module_id').eq('telegram_id', telegramId).eq('completed', true); if (!data) return []; const g: Record<string, string[]> = {}; for (const r of data) { if (!g[r.course_id]) g[r.course_id] = []; g[r.course_id]!.push(r.module_id); } return Object.entries(g).map(([c, m]) => ({ course: c, completed: m.length, total: COURSES[c]?.modules.length || 0 })); } catch { return []; }
}

// ============================================
// Courses
// ============================================
const COURSES: Record<string, { title: string; modules: string[] }> = {
  'ai-engineering-101': { title: 'AI Engineering 101', modules: ['intro', 'prompt-engineering', 'vector-databases', 'llm-integration', 'building-apps'] },
  'bot-development': { title: 'Bot Development', modules: ['telegram-basics', 'python-bots', 'ai-integration'] },
};

function loadModuleContent(courseId: string, moduleId: string): string | null {
  try { const p = join('content', 'courses', courseId, `${moduleId}.md`); if (existsSync(p)) return readFileSync(p, 'utf-8'); } catch {}
  return null;
}

function getModuleTitle(_courseId: string, moduleId: string): string {
  const titles: Record<string, string> = { 'intro': 'Introduction to AI', 'prompt-engineering': 'Prompt Engineering', 'vector-databases': 'Vector Databases', 'llm-integration': 'LLM Integration', 'building-apps': 'Building AI Apps', 'telegram-basics': 'Telegram Bot Basics', 'python-bots': 'Python Bots', 'ai-integration': 'AI Integration' };
  return titles[moduleId] || moduleId;
}

function getNextModule(courseId: string, currentModule: string): string | null {
  const mods = COURSES[courseId]?.modules; if (!mods) return null;
  const idx = mods.indexOf(currentModule); if (idx < 0 || idx >= mods.length - 1) return null;
  return mods[idx + 1]!;
}

// ============================================
// AI
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
      try { const m = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' }); const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `Be helpful. Speak Amharic.\n\n${msg}` }] }] }); return r.response.text(); } catch {}
    }
    try { const r = await this.groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: msg }], max_tokens: 600 }); return r.choices[0]?.message?.content || 'Error.'; } catch { return 'AI unavailable.'; }
  }
}

// ============================================
// Bot
// ============================================
const ai = new AIClient();
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
bot.use(async (ctx: any, next: any) => { console.log('📨 Received:', ctx.updateType); return next(); });

bot.command('start', async (ctx) => {
  const id = ctx.from?.id;
  if (id) await upsertProfile(id, ctx.from?.first_name || '', ctx.from?.username);
  await ctx.reply('👋 Welcome to <b>Getedil</b>! 🚀\n\n📚 /courses | 💼 /jobs | 📝 /memory | 📊 /progress', { parse_mode: 'HTML' });
});

bot.command('help', async (ctx) => { await ctx.reply('/courses /jobs /memory /progress /help'); });
bot.command('courses', async (ctx) => { await ctx.reply('📚 <b>AI Engineering 101</b> — 5 modules\n👉 /learn ai-engineering-101\n\n<b>Bot Development</b> — 3 modules\n👉 /learn bot-development', { parse_mode: 'HTML' }); });
bot.command('jobs', async (ctx) => { await ctx.reply('💼 AI/ML Engineer — Ethiopian AI Institute\nFull Stack Dev — Safaricom\nPython Developer — Remote\nData Scientist — CBE\nAI Trainer — Upwork/Fiverr'); });

bot.command('learn', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const telegramId = ctx.from?.id;
  if (!args.length) { await ctx.reply('/learn <course> [module]'); return; }
  const courseId = args[0]!;
  const course = COURSES[courseId];
  if (!course) { await ctx.reply('Not found. /courses'); return; }
  if (!args[1]) {
    const completed = telegramId ? await getCompletedModules(telegramId, courseId) : [];
    const list = course.modules.map((m, i) => `${i + 1}. ${getModuleTitle(courseId, m)}${completed.includes(m) ? ' ✅' : ''}\n   /learn ${courseId} ${m}`).join('\n\n');
    await ctx.reply(`📚 <b>${course.title}</b>\n\n${list}`, { parse_mode: 'HTML' });
    return;
  }
  const moduleId = args[1]!;
  const content = loadModuleContent(courseId, moduleId);
  if (telegramId) await markModuleDone(telegramId, courseId, moduleId);
  const display = content ? (content.length > 3800 ? content.slice(0, 3800) + '...' : content) : `📚 ${getModuleTitle(courseId, moduleId)}\n\nContent coming soon.`;
  await ctx.reply(display, { parse_mode: 'HTML' });
  const next = getNextModule(courseId, moduleId);
  if (next) await ctx.reply(`➡️ Next: /learn ${courseId} ${next}`);
  else await ctx.reply('🎉 Course Complete! 🏆');
});

bot.command('memory', async (ctx) => {
  const id = ctx.from?.id;
  if (!id) { await ctx.reply('No user.'); return; }
  const total = await getMessageCount(id);
  if (!total) { await ctx.reply('📝 No messages yet.'); return; }
  const recent = await getRecentMessages(id, 4);
  let m = `📝 <b>Memory</b> (${total})\n\n`;
  for (const r of recent) m += `${r.role === 'user' ? '👤' : '🤖'} ${(r as any).content.slice(0, 120)}\n`;
  await ctx.reply(m, { parse_mode: 'HTML' });
});

bot.command('progress', async (ctx) => {
  const id = ctx.from?.id;
  if (!id) { await ctx.reply('No user.'); return; }
  const msgCount = await getMessageCount(id);
  const courses = await getAllCompletedCourses(id);
  let m = `📊 <b>Progress</b>\n\n💬 Messages: ${msgCount}\n\n`;
  if (courses.length) { m += '<b>Courses:</b>\n'; for (const c of courses) { const co = COURSES[c.course]; m += `📚 ${co?.title || c.course}: ${c.completed}/${c.total}\n`; } }
  else m += '📚 No courses yet. /learn ai-engineering-101';
  await ctx.reply(m, { parse_mode: 'HTML' });
});

bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  if (msg.startsWith('/')) return;
  const id = ctx.from?.id;
  console.log('📩', ctx.from?.first_name, ':', msg.slice(0, 60));
  if (id) { await upsertProfile(id, ctx.from?.first_name || '', ctx.from?.username); await saveMessage(id, 'user', msg); }
  await ctx.sendChatAction('typing');
  try { const reply = await ai.generateResponse(msg); if (id) await saveMessage(id, 'assistant', reply); await ctx.reply(reply); } catch { await ctx.reply('Error.'); }
});

bot.catch(async (err) => { console.error('❌ Bot error:', err); });

// ============================================
// Main — Telegraf creates its own server
// ============================================
async function main() {
  console.log('\nGETEDIL-OS-BOT\n');
  const port = parseInt(process.env.PORT || '3000');
  const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  await bot.launch({ webhook: { domain: new URL(url).hostname, port } });
  console.log('✅ Webhook on port', port, '→', url);
}
main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
