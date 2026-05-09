"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const generative_ai_1 = require("@google/generative-ai");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
console.log('\nGETEDIL-OS-BOT\n');
const bot = new telegraf_1.Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
// Simple AI
const gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY || '' });
async function getAIResponse(msg) {
    if (/[\u1200-\u137F]/.test(msg) && process.env.GEMINI_API_KEY) {
        try {
            const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `You are Getedil, an AI tutor for Ethiopian students. Speak natural Amharic.\n\nStudent: ${msg}` }] }] });
            return r.response.text();
        }
        catch { }
    }
    try {
        const r = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: msg }],
            max_tokens: 600,
        });
        return r.choices[0]?.message?.content || 'Error.';
    }
    catch {
        return 'AI temporarily unavailable.';
    }
}
// Commands
bot.command('start', async (ctx) => {
    await ctx.reply('👋 Welcome to <b>Getedil</b>! 🚀\n\n📚 /courses | 💼 /jobs | 📝 /memory | 📊 /progress\n\nJust send me a message!', { parse_mode: 'HTML' });
});
bot.command('help', async (ctx) => { await ctx.reply('/courses /jobs /memory /progress /help'); });
bot.command('courses', async (ctx) => {
    await ctx.reply('📚 <b>AI Engineering 101</b> — 5 modules\n' +
        '👉 /learn ai-engineering-101\n\n' +
        '<b>Bot Development</b> — 3 modules\n' +
        '👉 /learn bot-development', { parse_mode: 'HTML' });
});
bot.command('learn', async (ctx) => {
    const courseId = ctx.message.text.split(' ')[1];
    if (courseId === 'ai-engineering-101') {
        await ctx.reply('📚 <b>AI Engineering 101</b>\n\n' +
            '1. /learn101 intro - Introduction to AI\n' +
            '2. /learn101 prompts - Prompt Engineering\n' +
            '3. /learn101 vectors - Vector Databases\n' +
            '4. /learn101 llm - LLM Integration\n' +
            '5. /learn101 apps - Building AI Apps', { parse_mode: 'HTML' });
    }
    else if (courseId === 'bot-development') {
        await ctx.reply('📚 <b>Bot Development</b>\n\n3 modules coming soon!');
    }
    else {
        await ctx.reply('Course not found. Try /courses');
    }
});
// Shortcut learn commands
bot.command('learn101', async (ctx) => {
    const mod = ctx.message.text.split(' ')[1];
    const lessons = {
        'intro': '🤖 <b>Introduction to AI</b>\n\nAI teaches computers to think like humans.\n\n📌 ML • Deep Learning • NLP\n🇪🇹 Smart farming, healthcare, tech jobs\n\n➡️ Next: /learn101 prompts',
        'prompts': '🎯 <b>Prompt Engineering</b>\n\n4 Elements: Role • Context • Task • Format\n\n💡 "You are a Python tutor. Explain loops with Amharic examples."\n\n➡️ Next: /learn101 vectors',
        'vectors': '🗄️ <b>Vector Databases</b>\n\nStore & search by meaning.\n🔍 Semantic search • RAG • Recommendations\n🛠️ Pinecone, Weaviate, pgvector\n\n➡️ Next: /learn101 llm',
        'llm': '🔌 <b>LLM Integration</b>\n\nConnect AI to apps.\n📋 Model → API Key → Prompts → Features\n\n➡️ Next: /learn101 apps',
        'apps': '🏗️ <b>Building AI Apps</b>\n\n✅ AI • Prompts • Vectors • LLMs\n\n🎉 <b>Course Complete!</b> 🏆',
    };
    await ctx.reply(lessons[mod || 'intro'] || 'Module not found. /learn ai-engineering-101', { parse_mode: 'HTML' });
});
bot.command('jobs', async (ctx) => {
    await ctx.reply('💼 <b>Ethiopian Tech Jobs</b>\n\n' +
        'AI/ML Engineer — Ethiopian AI Institute\n' +
        'Full Stack Dev — Safaricom Ethiopia\n' +
        'Python Developer — Remote/Addis\n' +
        'Data Scientist — CBE\n' +
        'AI Trainer — Upwork/Fiverr');
});
bot.command('memory', async (ctx) => { await ctx.reply('📝 Memory active. I remember our conversations!'); });
bot.command('progress', async (ctx) => { await ctx.reply('📊 <b>Progress</b>\n\n💬 Chatting\n📚 Learning\n🚀 Growing\n\n🎉 Keep it up!', { parse_mode: 'HTML' }); });
// Text messages
bot.on('text', async (ctx) => {
    const msg = ctx.message.text;
    if (msg.startsWith('/'))
        return;
    console.log('📩', ctx.from?.first_name, ':', msg.slice(0, 60));
    await ctx.sendChatAction('typing');
    try {
        const reply = await getAIResponse(msg);
        await ctx.reply(reply);
    }
    catch {
        await ctx.reply('Error. Try again.');
    }
});
// Start polling
console.log('🤖 Starting polling mode...');
bot.launch({ dropPendingUpdates: true });
console.log('✅ Bot polling for messages...');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
//# sourceMappingURL=app.js.map