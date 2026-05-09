import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { createServer } from 'http';

console.log('\nGETEDIL-OS-BOT\n');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Simple AI
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

async function getAIResponse(msg: string): Promise<string> {
  if (/[\u1200-\u137F]/.test(msg) && process.env.GEMINI_API_KEY) {
    try {
      const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `You are Getedil, an AI tutor for Ethiopian students. Speak natural Amharic.\n\nStudent: ${msg}` }] }] });
      return r.response.text();
    } catch {}
  }
  try {
    const r = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: msg }], max_tokens: 600 });
    return r.choices[0]?.message?.content || 'Error.';
  } catch { return 'AI temporarily unavailable.'; }
}

bot.command('start', async (ctx) => { await ctx.reply('👋 Welcome to <b>Getedil</b>! 🚀\n\n📚 /courses | 💼 /jobs | /help', { parse_mode: 'HTML' }); });
bot.command('help', async (ctx) => { await ctx.reply('/courses /jobs /memory /progress /help'); });
bot.command('courses', async (ctx) => { await ctx.reply('📚 <b>AI Engineering 101</b> — 5 modules\n👉 /learn101 intro\n\n<b>Bot Development</b> — 3 modules\n👉 /courses', { parse_mode: 'HTML' }); });
bot.command('learn', async (ctx) => { await ctx.reply('📚 <b>AI Engineering 101</b>\n\n/learn101 intro | /learn101 prompts | /learn101 vectors | /learn101 llm | /learn101 apps'); });
bot.command('learn101', async (ctx) => {
  const mod = ctx.message.text.split(' ')[1];
  const lessons: Record<string, string> = {
    'intro': '🤖 <b>Introduction to AI</b>\n\nAI teaches computers to think like humans.\n\n📌 ML • Deep Learning • NLP\n🇪🇹 Smart farming, healthcare, tech jobs\n\n➡️ /learn101 prompts',
    'prompts': '🎯 <b>Prompt Engineering</b>\n\n4 Elements: Role • Context • Task • Format\n\n💡 "You are a Python tutor. Explain loops with Amharic examples."\n\n➡️ /learn101 vectors',
    'vectors': '🗄️ <b>Vector Databases</b>\n\nStore & search by meaning.\n🔍 Semantic search • RAG • Recommendations\n🛠️ Pinecone, Weaviate, pgvector\n\n➡️ /learn101 llm',
    'llm': '🔌 <b>LLM Integration</b>\n\nConnect AI to apps.\n📋 Model → API Key → Prompts → Features\n\n➡️ /learn101 apps',
    'apps': '🏗️ <b>Building AI Apps</b>\n\n✅ AI • Prompts • Vectors • LLMs\n\n🎉 <b>Course Complete!</b> 🏆',
  };
  await ctx.reply(lessons[mod || 'intro'] || 'Module not found. /learn', { parse_mode: 'HTML' });
});
bot.command('jobs', async (ctx) => { await ctx.reply('💼 <b>Ethiopian Tech Jobs</b>\n\nAI/ML Engineer — Ethiopian AI Institute\nFull Stack Dev — Safaricom\nPython Developer — Remote\nData Scientist — CBE\nAI Trainer — Upwork/Fiverr'); });
bot.command('memory', async (ctx) => { await ctx.reply('📝 I remember our conversations!'); });
bot.command('progress', async (ctx) => { await ctx.reply('📊 <b>Progress</b>\n\n💬 Chatting\n📚 Learning\n🚀 Growing\n\n🎉 Keep it up!', { parse_mode: 'HTML' }); });

bot.on('text', async (ctx) => {
  const msg = ctx.message.text;
  if (msg.startsWith('/')) return;
  console.log('📩', ctx.from?.first_name, ':', msg.slice(0, 60));
  await ctx.sendChatAction('typing');
  try { await ctx.reply(await getAIResponse(msg)); } catch { await ctx.reply('Error.'); }
});

// ============================================
// HTTP server for Render health check + Bot polling
// ============================================
const port = parseInt(process.env.PORT || '10000');
createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200).end('OK'); return; }
  res.writeHead(200).end('GETEDIL-OS-BOT');
}).listen(port, () => console.log('🏥 Health :' + port));

console.log('🤖 Starting polling mode...');
bot.launch({ dropPendingUpdates: true });
console.log('✅ Bot polling for messages...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
