"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const generative_ai_1 = require("@google/generative-ai");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const http_1 = require("http");
// ============================================
// AI Client
// ============================================
class AIClient {
    gemini;
    groq;
    constructor() {
        this.gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        this.groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY || '' });
    }
    async generateResponse(msg) {
        if (/[\u1200-\u137F]/.test(msg) && process.env.GEMINI_API_KEY) {
            const m = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `You are Getedil, an AI tutor. Speak Amharic.\n\nStudent: ${msg}` }] }] });
            return r.response.text();
        }
        try {
            const r = await this.groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'system', content: 'You are Getedil, an AI tutor for Ethiopian students. Be helpful and concise.' }, { role: 'user', content: msg }],
                max_tokens: 500,
            });
            return r.choices[0]?.message?.content || 'Error.';
        }
        catch {
            return 'Sorry, AI is temporarily unavailable.';
        }
    }
}
class VoiceTranscriber {
    gemini;
    constructor() { this.gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || ''); }
    async transcribe(fileUrl) {
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
class BotService {
    ai;
    transcriber;
    bot;
    constructor(ai, transcriber) {
        this.ai = ai;
        this.transcriber = transcriber;
        this.bot = new telegraf_1.Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
        this.bot.command('start', async (ctx) => { await ctx.reply('Welcome to <b>Getedil</b>! 🚀\n\n/help', { parse_mode: 'HTML' }); });
        this.bot.command('help', async (ctx) => { await ctx.reply('/courses /jobs /memory /progress', { parse_mode: 'HTML' }); });
        this.bot.command('courses', async (ctx) => { await ctx.reply('📚 <b>AI Engineering 101</b>\n👉 /learn ai-engineering-101\n\n<b>Bot Development</b>\n👉 /learn bot-development', { parse_mode: 'HTML' }); });
        this.bot.command('learn', async (ctx) => {
            const a = ctx.message.text.split(' ').slice(1);
            if (!a.length) {
                await ctx.reply('/learn <course>');
                return;
            }
            if (a[0] === 'ai-engineering-101') {
                await ctx.reply('📚 <b>AI Engineering 101</b>\n\n🤖 AI fundamentals\n📌 ML • DL • NLP\n🇪🇹 Smart farming, jobs\n\n➡️ /learn ai-engineering-101 prompt-engineering', { parse_mode: 'HTML' });
            }
            else if (a[0] === 'bot-development') {
                await ctx.reply('📚 <b>Bot Development</b>\n\n🤖 @BotFather\n📝 Commands\n🧠 AI integration', { parse_mode: 'HTML' });
            }
            else {
                await ctx.reply('Not found. Try /courses');
            }
        });
        this.bot.command('jobs', async (ctx) => { await ctx.reply('💼 AI/ML Engineer - Ethiopian AI Institute\nFull Stack Dev - Safaricom\nPython Dev - Remote\nAI Trainer - Upwork', { parse_mode: 'HTML' }); });
        this.bot.command('memory', async (ctx) => { await ctx.reply('📝 Memory active.'); });
        this.bot.command('progress', async (ctx) => { await ctx.reply('📊 Learning! 🚀', { parse_mode: 'HTML' }); });
        this.bot.on('voice', async (ctx) => {
            if (!this.transcriber) {
                await ctx.reply('🎤 Voice not available.');
                return;
            }
            await ctx.reply('🎤 Transcribing...');
            try {
                const url = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
                const { text } = await this.transcriber.transcribe(url.href);
                await ctx.reply(`📝 "${text}"\n🤖 Thinking...`);
                await ctx.reply(await this.ai.generateResponse(text));
            }
            catch {
                await ctx.reply('❌ Failed.');
            }
        });
        this.bot.on('text', async (ctx) => {
            const msg = ctx.message.text;
            if (msg.startsWith('/'))
                return;
            await ctx.sendChatAction('typing');
            try {
                await ctx.reply(await this.ai.generateResponse(msg));
            }
            catch {
                await ctx.reply('Error.');
            }
        });
        this.bot.catch(async (err) => { console.error(err); });
    }
    async start() { console.log('🤖 Starting...'); await this.bot.launch(); console.log('✅ Running'); }
    async stop() { await this.bot.stop(); }
}
async function main() {
    console.log('\nGETEDIL-OS-BOT\n');
    (0, http_1.createServer)((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200).end('OK');
            return;
        }
        res.writeHead(200).end('GETEDIL-OS-BOT');
    }).listen(3000, () => console.log('🏥 Health :3000'));
    const ai = new AIClient();
    const transcriber = process.env.GEMINI_API_KEY ? new VoiceTranscriber() : null;
    const bot = new BotService(ai, transcriber);
    await bot.start();
    process.on('SIGINT', async () => { await bot.stop(); process.exit(0); });
    process.on('SIGTERM', async () => { await bot.stop(); process.exit(0); });
    console.log('✅ Running');
}
main().catch(e => { console.error('❌', e); process.exit(1); });
//# sourceMappingURL=app.js.map