import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'http';
import WebSocket from 'ws';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

let transcriber: VoiceTranscriber | null = null;
const activeUsers = new Set<number>();

// === ANTI-SPAM SYSTEM ===
const rateLimits = new Map<number, { count: number; resetAt: number }>();
const userViolations = new Map<number, number>(); // Track repeat offenders
const SPAM_KEYWORDS = [
  'earn money fast', 'double your', 'investment opportunity',
  'click here', 'limited time', 'act now', 'guaranteed profit',
  'binary options', 'forex signals', 'crypto pump',
  'free money', 'make $', 'work from home', 'click the link',
  'telegram premium', 'verify account', 'suspicious link',
  'whatsApp', 'contact me', 'dm me', 'message me',
  'loan', 'credit card', 'bank transfer', 'urgent'
];

function isRateLimited(userId: number): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxMessages = 10; // 10 messages per minute
  
  const userLimit = rateLimits.get(userId);
  
  if (!userLimit || now > userLimit.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + windowMs });
    return false;
  }
  
  userLimit.count++;
  
  if (userLimit.count > maxMessages) {
    return true;
  }
  
  return false;
}

function containsSpam(text: string): { isSpam: boolean; reason: string } {
  const lower = text.toLowerCase();
  
  for (const keyword of SPAM_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { isSpam: true, reason: `Spam keyword: "${keyword}"` };
    }
  }
  
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 10) {
    const caps = letters.replace(/[^A-Z]/g, '').length;
    if (caps / letters.length > 0.8) {
      return { isSpam: true, reason: 'Excessive caps' };
    }
  }
  
  const linkCount = (text.match(/https?:\/\//g) || []).length;
  if (linkCount > 2) {
    return { isSpam: true, reason: 'Too many links' };
  }
  
  if (/(.)\1{10,}/.test(text)) {
    return { isSpam: true, reason: 'Repeated characters' };
  }
  
  // Check for phone numbers (common scam pattern)
  if (/\+\d{10,}/.test(text) && lower.includes('contact')) {
    return { isSpam: true, reason: 'Contact number spam' };
  }
  
  return { isSpam: false, reason: '' };
}

async function handleSpam(ctx: any, reason: string) {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  
  console.log(`🚫 Spam from ${ctx.from?.first_name} (${userId}): ${reason}`);
  
  // Track violations
  const violations = (userViolations.get(userId) || 0) + 1;
  userViolations.set(userId, violations);
  
  // Delete message
  try {
    await ctx.deleteMessage();
  } catch {
    console.log('Could not delete message — not admin?');
  }
  
  // Warning message
  let warning = `⚠️ <b>Anti-Spam</b>\n\n${ctx.from?.first_name}, your message was removed: ${reason}`;
  
  if (violations >= 3) {
    warning += `\n\n🚫 <b>You have ${violations} violations.</b> One more and you will be removed.`;
  }
  
  await ctx.reply(warning, { parse_mode: 'HTML' });
  
  // Auto-ban on 5 violations
  if (violations >= 5) {
    try {
      await ctx.banChatMember(userId);
      await ctx.reply(`🚫 ${ctx.from?.first_name} has been removed for repeated spam.`, { parse_mode: 'HTML' });
    } catch {
      console.log('Could not ban — not admin?');
    }
  }
  
  // Log to Supabase
  try {
    await supabase.from('spam_logs').insert({
      telegram_id: userId,
      username: ctx.from?.username,
      reason,
      message_preview: ctx.message?.text?.slice(0, 200),
      violation_count: violations,
      created_at: new Date().toISOString()
    });
  } catch {}
}

console.log('\nGETEDIL-OS-BOT\n');

let supabase: any = null;
try {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (url && key) {
    supabase = createClient(url, key, { realtime: { transport: WebSocket as any }, auth: { persistSession: false } });
    console.log('📦 Supabase connected');
  }
} catch(e: any) { 
  console.log('⚠️ Supabase init failed:', e.message); 
}

async function saveMsg(uid: number, role: string, text: string) {
  try { 
    await supabase.from('conversation_history').insert({ 
      telegram_id: uid, 
      role, 
      content: text.slice(0, 4000) 
    }); 
  } catch {}
}

async function getRecent(uid: number, n = 6) {
  try { 
    const { data } = await supabase
      .from('conversation_history')
      .select('role,content')
      .eq('telegram_id', uid)
      .order('created_at', { ascending: false })
      .limit(n); 
    return (data || []).reverse(); 
  } catch { 
    return []; 
  }
}

async function countMsgs(uid: number) {
  try { 
    const { count } = await supabase
      .from('conversation_history')
      .select('*', { count: 'exact', head: true })
      .eq('telegram_id', uid); 
    return count || 0; 
  } catch { 
    return 0; 
  }
}

async function saveProfile(uid: number, name: string, uname?: string) {
  try { 
    await supabase.from('user_profiles').upsert({
      telegram_id: uid,
      first_name: name,
      username: uname || null,
      last_active_at: new Date().toISOString()
    }, { onConflict: 'telegram_id' }); 
  } catch {}
}

async function markDone(uid: number, course: string, mod: string) {
  try { 
    await supabase.from('course_progress').upsert({
      telegram_id: uid,
      course_id: course,
      module_id: mod,
      completed: true,
      completed_at: new Date().toISOString()
    }, { onConflict: 'telegram_id, course_id, module_id' }); 
  } catch {}
}

async function getDone(uid: number, course: string) {
  try { 
    const { data } = await supabase
      .from('course_progress')
      .select('module_id')
      .eq('telegram_id', uid)
      .eq('course_id', course)
      .eq('completed', true); 
    return (data || []).map((r: any) => r.module_id); 
  } catch { 
    return []; 
  }
}

async function aiReply(msg: string): Promise<string> {
  if (/[\u1200-\u137F]/.test(msg) && process.env.GEMINI_API_KEY) {
    try {
      const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const r = await m.generateContent({
        contents: [{
          role: 'user',
          parts: [{
            text: `You are Gete (ጌጤ), the AI tutor for Get'Edil (ጌት፟እድል). Speak ONLY natural Amharic. No transliterations, no English.\n\nStudent: ${msg}`
          }]
        }]
      });
      return r.response.text();
    } catch {}
  }
  try {
    const r = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: msg }],
      max_tokens: 600
    });
    return r.choices[0]?.message?.content || 'Error.';
  } catch { 
    return 'AI unavailable.'; 
  }
}

const COURSES: Record<string, Record<string, string>> = {
  'ai': {
    'intro': '🤖 **What is AI?**\n\nAI is when computers learn to do tasks that normally need human intelligence.\n\n*Key idea:* Instead of programming every rule, we show the computer *examples* and it learns patterns.\n\n*Your turn:* Ask me anything about AI!',
    'prompts': '✍️ **Prompt Engineering**\n\nA prompt is how you talk to AI. Good prompts = good answers.\n\n*Tip:* Be specific. Instead of "write code", say "write a Python function that sorts a list of numbers".',
    'vectors': '📊 **Vector Databases**\n\nVectors are numbers that represent meaning. Similar ideas = close vectors.\n\n*Example:* "king" - "man" + "woman" = "queen"',
    'llm': '🧠 **Large Language Models**\n\nLLMs like Gemini learn from billions of text examples. They predict the next word.\n\n*Limitation:* They don\'t "know" facts — they predict what sounds right.',
    'apps': '🚀 **Building AI Apps**\n\nNow you combine everything:\n1. Prompt engineering\n2. Vector search\n3. LLM calls\n4. Deploy to Telegram\n\n*Project idea:* Build a bot that answers questions about Ethiopian history!'
  }
};

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// === MIDDLEWARE: User tracking ===
bot.use(async (ctx, next) => {
  if (ctx.from) {
    ctx.user = await getOrCreateUser(ctx.from);
  }
  return next();
});

// === ANTI-SPAM MIDDLEWARE ===
bot.use(async (ctx, next) => {
  // Only in groups/channels
  if (ctx.chat?.type === 'private') return next();
  
  const userId = ctx.from?.id;
  if (!userId) return next();
  
  // Skip admins
  try {
    const member = await ctx.getChatMember(userId);
    if (member.status === 'administrator' || member.status === 'creator') {
      return next();
    }
  } catch {
    // Can't check, proceed with caution
  }
  
  // Rate limit check
  if (isRateLimited(userId)) {
    await handleSpam(ctx, 'Too many messages');
    return;
  }
  
  // Content check
  const text = ctx.message?.text || ctx.message?.caption || '';
  if (text) {
    const spamCheck = containsSpam(text);
    if (spamCheck.isSpam) {
      await handleSpam(ctx, spamCheck.reason);
      return;
    }
  }
  
  return next();
});

// === COMMANDS ===
bot.command('start', async (ctx) => {
  if (ctx.from?.id) await saveProfile(ctx.from.id, ctx.from.first_name || 'Student', ctx.from.username);
  await ctx.reply(
    `👋 Welcome to <b>Get'Edil</b>! 🚀\n\n` +
    `📚 /courses | 💼 /jobs | 💳 /pay | /help`,
    { parse_mode: 'HTML' }
  );
});

bot.command('help', async (ctx) => { 
  await ctx.reply('/courses /jobs /pay /memory /progress /stats /spamstats /help'); 
});

bot.command('courses', async (ctx) => { 
  await ctx.reply('📚 <b>AI Engineering 101</b> — 5 modules\n👉 /learn ai intro', { parse_mode: 'HTML' }); 
});

bot.command('learn', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) {
    await ctx.reply('📚 /learn ai intro | /learn ai prompts | /learn ai vectors | /learn ai llm | /learn ai apps');
    return;
  }
  
  const [courseId, modId] = args;
  const content = COURSES[courseId]?.[modId];
  
  if (!content) {
    await ctx.reply('❌ Module not found. Try: /learn ai intro');
    return;
  }
  
  await ctx.reply(content, { parse_mode: 'Markdown' });
  if (ctx.from?.id) await markDone(ctx.from.id, courseId, modId);
});

bot.command('jobs', async (ctx) => {
  const jobs = [
    'AI/ML Engineer - Ethiopian AI Institute',
    'Full Stack Developer - Safaricom Ethiopia',
    'Python Developer - Remote/Addis',
    'Data Scientist - CBE',
    'Freelance AI Trainer - Upwork/Fiverr'
  ];
  await ctx.reply('💼 <b>Ethiopian Tech Jobs</b>\n\n' + jobs.map(j => '• ' + j).join('\n'), { parse_mode: 'HTML' });
});

bot.command('memory', async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) { 
    await ctx.reply('Cannot identify user.'); 
    return; 
  }
  const total = await countMsgs(uid);
  if (!total) { 
    await ctx.reply('📝 No messages yet.'); 
    return; 
  }
  const recent = await getRecent(uid, 4);
  let m = `📝 <b>Memory</b> (${total})\n\n`;
  for (const r of recent) m += `${r.role === 'user' ? '👤' : '🤖'} ${r.content.slice(0, 100)}\n`;
  await ctx.reply(m, { parse_mode: 'HTML' });
});

bot.command('progress', async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) { 
    await ctx.reply('Cannot identify user.'); 
    return; 
  }
  const total = await countMsgs(uid);
  const done = uid ? await getDone(uid, 'ai') : [];
  await ctx.reply(`📊 <b>Progress</b>\n\n💬 Messages: ${total}\n📚 AI Modules: ${done.length}/5`, { parse_mode: 'HTML' });
});

bot.command('pay', async (ctx) => {
  const uid = ctx.from?.id;
  if (!uid) { 
    await ctx.reply('Cannot identify user.'); 
    return; 
  }
  
  const chapaKey = process.env.CHAPA_SECRET_KEY;
  if (!chapaKey) {
    await ctx.reply('Payment unavailable. All content is FREE: /learn ai intro');
    return;
  }
  
  await ctx.reply('💳 Generating payment link...');
  try {
    const tx_ref = 'GETEDIL-' + Date.now() + '-' + uid;
    const r = await fetch('https://api.chapa.co/v1/transaction/initialize', {
      method: 'POST',
      headers: { 
        Authorization: 'Bearer ' + chapaKey, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        amount: 100,
        currency: 'ETB',
        email: 'student' + uid + '@gmail.com',
        first_name: ctx.from?.first_name || 'Student',
        last_name: ctx.from?.last_name || '',
        tx_ref,
        return_url: 'https://t.me/GETEDILOSBOT',
        callback_url: 'https://txhcnsxzcbkoroyasmlc.supabase.co/functions/v1/payment-webhook',
        'customization[title]': "Get'Edil Premium",
        'customization[description]': 'AI Engineering 101'
      }),
    });
    const d: any = await r.json();
    if (d.status === 'success' && d.data?.checkout_url) {
      await ctx.reply('💳 <b>Complete Payment</b>\n\n💰 100 ETB\n🔗 ' + d.data.checkout_url + '\n\n<i>Test card: 4242 4242 4242 4242</i>', { parse_mode: 'HTML' });
    } else {
      await ctx.reply('Payment unavailable. All content is FREE: /learn ai intro');
    }
  } catch { 
    await ctx.reply('Payment unavailable. All content is FREE: /learn ai intro'); 
  }
});

bot.command('stats', async (ctx) => {
  try {
    const count = await ctx.getChatMembersCount();
    await ctx.reply(`📊 Members: ${count} | Active: ${activeUsers.size}`, { parse_mode: 'HTML' });
  } catch { 
    await ctx.reply('Stats unavailable.'); 
  }
});

bot.command('spamstats', async (ctx) => {
  try {
    const { count } = await supabase
      .from('spam_logs')
      .select('*', { count: 'exact', head: true });
    
    await ctx.reply(`🛡️ <b>Anti-Spam Stats</b>\n\nTotal blocked: ${count || 0}\nActive violators: ${userViolations.size}`, { parse_mode: 'HTML' });
  } catch {
    await ctx.reply('Stats unavailable.');
  }
});

bot.on('new_chat_members', async (ctx) => {
  for (const m of ctx.message['new_chat_members'] || []) {
    if (m.is_bot) return;
    await ctx.reply(`👋 Welcome ${m.first_name || 'Friend'}! I'm Gete, your AI tutor.\n📚 /courses | 💼 /jobs`, { parse_mode: 'HTML' });
  }
});

bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  if (msg.startsWith('/')) return;
  const uid = ctx.from?.id;
  if (uid) { 
    activeUsers.add(uid); 
    await saveProfile(uid, ctx.from?.first_name || '', ctx.from?.username); 
    await saveMsg(uid, 'user', msg); 
  }
  console.log('📩', ctx.from?.first_name, ':', msg.slice(0, 60));
  await ctx.sendChatAction('typing');
  try { 
    const reply = await aiReply(msg); 
    if (uid) await saveMsg(uid, 'assistant', reply); 
    await ctx.reply(reply); 
  } catch { 
    await ctx.reply('Error.'); 
  }
});

class VoiceTranscriber {
  async transcribe(fileUrl: string) {
    const r = await fetch(fileUrl);
    const buf = Buffer.from(await r.arrayBuffer());
    const b64 = buf.toString('base64');
    const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const res = await m.generateContent([
      { text: 'Transcribe this audio.' },
      { inlineData: { mimeType: 'audio/ogg', data: b64 } }
    ]);
    const text = res.response.text().trim();
    return { text, language: /[\u1200-\u137F]/.test(text) ? 'am' : 'en' };
  }
}

if (process.env.GEMINI_API_KEY) { 
  transcriber = new VoiceTranscriber(); 
  console.log('🎤 Voice enabled'); 
}

bot.on('voice', async (ctx) => {
  if (!transcriber) { 
    await ctx.reply('🎤 Voice not available.'); 
    return; 
  }
  await ctx.reply('🎤 Transcribing...');
  try {
    const url = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
    const { text } = await transcriber.transcribe(url.href);
    await ctx.reply('📝 "' + text + '"\n🤖 Thinking...');
    const reply = await aiReply(text);
    await ctx.reply(reply);
  } catch { 
    await ctx.reply('❌ Failed.'); 
  }
});

const port = parseInt(process.env.PORT || '10000');
createServer((req, res) => {
  if (req.url === '/health') { 
    res.writeHead(200).end('OK'); 
    return; 
  }
  res.writeHead(200).end('GETEDIL-OS-BOT');
}).listen(port, () => console.log('🏥 Health :' + port));

bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('✅ Polling connected'))
  .catch(() => setTimeout(() => bot.launch({ dropPendingUpdates: true }), 5000));

process.once('SIGINT', async () => { 
  try { await bot.stop(); } catch {} 
  process.exit(0); 
});

process.once('SIGTERM', async () => { 
  try { await bot.stop(); } catch {} 
  process.exit(0); 
});

// Helper function referenced in middleware
async function getOrCreateUser(telegramUser: any) {
  const { data } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('telegram_id', telegramUser.id)
    .single();
  
  if (data) return data;

  const { data: created } = await supabase
    .from('user_profiles')
    .insert({
      telegram_id: telegramUser.id,
      first_name: telegramUser.first_name || 'Student',
      username: telegramUser.username || null,
      locale: telegramUser.language_code === 'am' ? 'am' : 'en',
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  return created;
}