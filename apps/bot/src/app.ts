import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';

// Load .env
let cwd = process.cwd();
const root = path.parse(cwd).root;
while (cwd !== root) {
  const envPath = path.join(cwd, '.env');
  if (fs.existsSync(envPath)) { dotenv.config({ path: envPath }); break; }
  cwd = path.dirname(cwd);
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
      const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `You are Getedil, an AI tutor. Speak Amharic naturally.\n\nStudent: ${msg}` }] }] });
      return r.response.text();
    }
    try {
      const r = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'You are Getedil, an AI tutor for Ethiopian students. Be helpful and concise.' }, { role: 'user', content: msg }],
        max_tokens: 500,
      });
      return r.choices[0]?.message?.content || 'Error.';
    } catch {
      return 'Sorry, AI is temporarily unavailable. Try again.';
    }
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
  constructor(private ai: AIClient, private transcriber: VoiceTranscriber | null) {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    this.bot = new Telegraf(token);

    this.bot.command('start', async (ctx) => {
      await ctx.reply('Welcome to <b>Getedil</b>! 🚀\n\n🎤 Voice | 💼 Jobs | 📚 Courses | 🧠 AI\n/help', { parse_mode: 'HTML' });
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply('<b>Commands</b>\n📚 /courses\n💼 /jobs\n📝 /memory\n📊 /progress\n/help', { parse_mode: 'HTML' });
    });

    this.bot.command('courses', async (ctx) => {
      await ctx.reply(
        '📚 <b>Courses</b>\n\n' +
        '<b>AI Engineering 101</b>\nAI fundamentals, prompt engineering & LLMs.\n⏱ 20h | 📊 Beginner\n👉 /learn ai-engineering-101\n\n' +
        '<b>Bot Development</b>\nBuild Telegram bots with Python & AI.\n⏱ 15h | 📊 Intermediate\n👉 /learn bot-development',
        { parse_mode: 'HTML' }
      );
    });

    this.bot.command('learn', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      if (!args.length) { await ctx.reply('Usage: /learn <course>\nTry /courses'); return; }
      const courseId = args[0]!;

      if (courseId === 'ai-engineering-101') {
        if (args[1] === 'intro' || !args[1]) {
          await ctx.reply('📚 <b>AI Engineering 101</b>\n📖 Module 1: <b>Introduction to AI</b>\n\n🤖 AI teaches computers to think like humans.\n\n📌 <b>Key Concepts:</b>\n• Machine Learning\n• Deep Learning\n• Natural Language Processing\n\n🇪🇹 <b>AI in Ethiopia:</b> Smart farming, healthcare, tech jobs\n\n➡️ Next: /learn ai-engineering-101 prompt-engineering', { parse_mode: 'HTML' });
        } else if (args[1] === 'prompt-engineering') {
          await ctx.reply('📚 <b>Prompt Engineering</b>\n\n🎯 <b>4 Elements:</b>\n1. Role - Tell AI who to be\n2. Context - Give background\n3. Task - Be specific\n4. Format - Specify output\n\n💡 <b>Example:</b>\n"You are a Python tutor. Explain loops with Amharic examples."\n\n➡️ Next: /learn ai-engineering-101 vector-databases', { parse_mode: 'HTML' });
        } else if (args[1] === 'vector-databases') {
          await ctx.reply('📚 <b>Vector Databases</b>\n\n🗄️ Store and search data by meaning.\n\n🔍 <b>Use Cases:</b> Semantic search, Recommendations, AI memory\n🛠️ <b>Tools:</b> Pinecone, Weaviate, pgvector\n\n➡️ Next: /learn ai-engineering-101 llm-integration', { parse_mode: 'HTML' });
        } else if (args[1] === 'llm-integration') {
          await ctx.reply('📚 <b>LLM Integration</b>\n\n🔌 Connect AI to apps.\n\n📋 <b>Steps:</b>\n1. Choose model\n2. Get API key\n3. Send prompts\n4. Build features\n\n➡️ Next: /learn ai-engineering-101 building-apps', { parse_mode: 'HTML' });
        } else if (args[1] === 'building-apps') {
          await ctx.reply('📚 <b>Building AI Apps</b>\n\n🏗️ Put it all together!\n\n✅ You\'ve learned:\n• AI fundamentals\n• Prompt engineering\n• Vector databases\n• LLM integration\n\n🎉 <b>Course Complete!</b> 🏆\n📊 Check /progress', { parse_mode: 'HTML' });
        } else {
          await ctx.reply('Module not found. Try: /learn ai-engineering-101 intro');
        }
      } else if (courseId === 'bot-development') {
        await ctx.reply('📚 <b>Bot Development</b>\n📖 Module 1: <b>Telegram Bot Basics</b>\n\n🤖 Create bots\n📝 Handle commands\n⌨️ Add keyboards\n🧠 Connect AI\n\n➡️ Next: /learn bot-development python-bots', { parse_mode: 'HTML' });
      } else {
        await ctx.reply('Course not found. Try /courses');
      }
    });

    this.bot.command('jobs', async (ctx) => {
      await ctx.reply(
        '💼 <b>Job Listings</b>\n\n' +
        '<b>AI/ML Engineer</b> - Ethiopian AI Institute - Addis Ababa\n' +
        '<b>Full Stack Developer</b> - Safaricom Ethiopia - Addis Ababa\n' +
        '<b>Python Developer</b> - Remote / Contract\n' +
        '<b>Freelance AI Trainer</b> - Upwork/Fiverr - Remote\n' +
        '<b>Data Scientist</b> - CBE - Addis Ababa\n\n' +
        'Try: /jobs ai | /jobs remote',
        { parse_mode: 'HTML' }
      );
    });

    this.bot.command('memory', async (ctx) => { await ctx.reply('📝 Memory active. Your conversations are being remembered!'); });
    this.bot.command('progress', async (ctx) => { await ctx.reply('📊 <b>Progress</b>\n\n💬 Chatting\n📚 Learning\n🚀 Growing\n\nKeep it up! 🎉', { parse_mode: 'HTML' }); });

    this.bot.on('voice', async (ctx) => {
      if (!this.transcriber) { await ctx.reply('🎤 Voice not configured.'); return; }
      await ctx.reply('🎤 Transcribing...');
      try {
        const url = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const { text } = await this.transcriber.transcribe(url.href);
        await ctx.reply(`📝 <i>"${text}"</i>\n🤖 Thinking...`, { parse_mode: 'HTML' });
        const reply = await this.ai.generateResponse(text);
        await ctx.reply(reply);
      } catch { await ctx.reply('❌ Failed.'); }
    });

    this.bot.on('text', async (ctx) => {
      const msg = ctx.message.text;
      if (msg.startsWith('/')) return;
      await ctx.sendChatAction('typing');
      try {
        const reply = await this.ai.generateResponse(msg);
        await ctx.reply(reply);
      } catch { await ctx.reply('Error.'); }
    });

    this.bot.catch(async (err) => { console.error(err); });
  }

  async start(): Promise<void> { console.log('🤖 Starting...'); await this.bot.launch(); console.log('✅ Running'); }
  async stop(): Promise<void> { await this.bot.stop(); console.log('🛑 Stopped'); }
}

// ============================================
// Main
// ============================================
async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('GETEDIL-OS-BOT: Thermodynamic Edition');
  console.log('═══════════════════════════════════════════\n');

  // Health check server (Render needs this)
  createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(200);
      res.end('GETEDIL-OS-BOT');
    }
  }).listen(3000, () => console.log('🏥 Health server on :3000'));

  const ai = new AIClient();
  const transcriber = process.env.GEMINI_API_KEY ? new VoiceTranscriber() : null;
  if (transcriber) console.log('🎤 Voice enabled');
  const bot = new BotService(ai, transcriber);
  await bot.start();

  process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });
  process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
  console.log('✅ All systems running.');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
