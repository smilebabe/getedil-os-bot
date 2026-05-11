"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const telegraf_1 = require("telegraf");
const generative_ai_1 = require("@google/generative-ai");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const supabase_js_1 = require("@supabase/supabase-js");
const http_1 = require("http");
const WebSocket = require('ws');
const gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY || '' });
let transcriber = null;
const activeUsers = new Set();
console.log('\nGETEDIL-OS-BOT\n');
let supabase = null;
try {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (url && key) {
        supabase = (0, supabase_js_1.createClient)(url, key, { realtime: { transport: WebSocket }, auth: { persistSession: false } });
        console.log('📦 Supabase connected');
    }
}
catch (e) {
    console.log('⚠️ Supabase init failed:', e.message);
}
async function saveMsg(uid, role, text) {
    try {
        await supabase.from('conversation_history').insert({ telegram_id: uid, role, content: text.slice(0, 4000) });
    }
    catch { }
}
async function getRecent(uid, n = 6) {
    try {
        const { data } = await supabase.from('conversation_history').select('role,content').eq('telegram_id', uid).order('created_at', { ascending: false }).limit(n);
        return (data || []).reverse();
    }
    catch {
        return [];
    }
}
async function countMsgs(uid) {
    try {
        const { count } = await supabase.from('conversation_history').select('*', { count: 'exact', head: true }).eq('telegram_id', uid);
        return count || 0;
    }
    catch {
        return 0;
    }
}
async function saveProfile(uid, name, uname) {
    try {
        await supabase.from('user_profiles').upsert({ telegram_id: uid, first_name: name, username: uname || null, last_active_at: new Date().toISOString() }, { onConflict: 'telegram_id' });
    }
    catch { }
}
async function markDone(uid, course, mod) {
    try {
        await supabase.from('course_progress').upsert({ telegram_id: uid, course_id: course, module_id: mod, completed: true, completed_at: new Date().toISOString() }, { onConflict: 'telegram_id, course_id, module_id' });
    }
    catch { }
}
async function getDone(uid, course) {
    try {
        const { data } = await supabase.from('course_progress').select('module_id').eq('telegram_id', uid).eq('course_id', course).eq('completed', true);
        return (data || []).map((r) => r.module_id);
    }
    catch {
        return [];
    }
}
async function aiReply(msg) {
    if (/[\u1200-\u137F]/.test(msg) && process.env.GEMINI_API_KEY) {
        try {
            const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `You are Gete (ጌጤ), the AI tutor for Get'Edil (ጌት፟እድል). Speak ONLY natural Amharic. No transliterations, no English.\n\nStudent: ${msg}` }] }] });
            return r.response.text();
        }
        catch { }
    }
    try {
        const r = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: msg }], max_tokens: 600 });
        return r.choices[0]?.message?.content || 'Error.';
    }
    catch {
        return 'AI unavailable.';
    }
}
const COURSES = {
    'ai': { title: 'AI Engineering 101', mods: ['intro', 'prompts', 'vectors', 'llm', 'apps'] },
};
const bot = new telegraf_1.Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
bot.command('start', async (ctx) => {
    if (ctx.from?.id)
        await saveProfile(ctx.from.id, ctx.from.first_name || 'Student', ctx.from.username);
    await ctx.reply('👋 Welcome to <b>Get\'Edil</b>! 🚀\n\n📚 /courses | 💼 /jobs | 💳 /pay | /help', { parse_mode: 'HTML' });
});
bot.command('help', async (ctx) => { await ctx.reply('/courses /jobs /pay /memory /progress /stats /help'); });
bot.command('courses', async (ctx) => { await ctx.reply('📚 <b>AI Engineering 101</b> — 5 modules\n👉 /learn ai intro', { parse_mode: 'HTML' }); });
bot.command('learn', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (!args.length) {
        await ctx.reply('/learn ai intro');
        return;
    }
    await ctx.reply('📖 Module content: /learn ai intro | /learn ai prompts | /learn ai vectors | /learn ai llm | /learn ai apps');
    if (ctx.from?.id)
        await markDone(ctx.from.id, 'ai', args[0] || 'intro');
});
bot.command('jobs', async (ctx) => {
    const jobs = ['AI/ML Engineer - Ethiopian AI Institute', 'Full Stack Developer - Safaricom Ethiopia', 'Python Developer - Remote/Addis', 'Data Scientist - CBE', 'Freelance AI Trainer - Upwork/Fiverr'];
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
    for (const r of recent)
        m += `${r.role === 'user' ? '👤' : '🤖'} ${r.content.slice(0, 100)}\n`;
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
    await ctx.reply('💳 Generating payment link...');
    try {
        const tx_ref = 'GETEDIL-' + Date.now() + '-' + uid;
        const r = await fetch('https://api.chapa.co/v1/transaction/initialize', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + (process.env.CHAPA_SECRET_KEY || 'CHASECK_TEST-G89UwLELjEXm0QgS2JdWKNxs2de0BppJ'), 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 100, currency: 'ETB', email: 'student' + uid + '@gmail.com', first_name: ctx.from?.first_name || 'Student', last_name: ctx.from?.last_name || '', tx_ref, return_url: 'https://t.me/GETEDILOSBOT', callback_url: 'https://txhcnsxzcbkoroyasmlc.supabase.co/functions/v1/payment-webhook', 'customization[title]': "Get'Edil Premium", 'customization[description]': 'AI Engineering 101' }),
        });
        const d = await r.json();
        if (d.status === 'success' && d.data?.checkout_url) {
            await ctx.reply('💳 <b>Complete Payment</b>\n\n💰 100 ETB\n🔗 ' + d.data.checkout_url + '\n\n<i>Test card: 4242 4242 4242 4242</i>', { parse_mode: 'HTML' });
        }
        else {
            await ctx.reply('Payment unavailable. All content is FREE: /learn ai intro');
        }
    }
    catch {
        await ctx.reply('Payment unavailable. All content is FREE: /learn ai intro');
    }
});
bot.command('stats', async (ctx) => {
    try {
        const count = await ctx.getChatMembersCount();
        await ctx.reply(`📊 Members: ${count} | Active: ${activeUsers.size}`, { parse_mode: 'HTML' });
    }
    catch {
        await ctx.reply('Stats unavailable.');
    }
});
bot.on('new_chat_members', async (ctx) => {
    for (const m of ctx.message['new_chat_members'] || []) {
        if (m.is_bot)
            return;
        await ctx.reply(`👋 Welcome ${m.first_name || 'Friend'}! I'm Gete, your AI tutor.\n📚 /courses | 💼 /jobs`, { parse_mode: 'HTML' });
    }
});
bot.on('text', async (ctx) => {
    const msg = ctx.message.text;
    if (msg.startsWith('/'))
        return;
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
        if (uid)
            await saveMsg(uid, 'assistant', reply);
        await ctx.reply(reply);
    }
    catch {
        await ctx.reply('Error.');
    }
});
class VoiceTranscriber {
    async transcribe(fileUrl) {
        const r = await fetch(fileUrl);
        const buf = Buffer.from(await r.arrayBuffer());
        const b64 = buf.toString('base64');
        const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const res = await m.generateContent([{ text: 'Transcribe this audio.' }, { inlineData: { mimeType: 'audio/ogg', data: b64 } }]);
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
    }
    catch {
        await ctx.reply('❌ Failed.');
    }
});
const port = parseInt(process.env.PORT || '10000');
(0, http_1.createServer)((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200).end('OK');
        return;
    }
    res.writeHead(200).end('GETEDIL-OS-BOT');
}).listen(port, () => console.log('🏥 Health :' + port));
bot.launch({ dropPendingUpdates: true }).then(() => console.log('✅ Polling connected')).catch(() => setTimeout(() => bot.launch({ dropPendingUpdates: true }), 5000));
process.once('SIGINT', async () => { try {
    await bot.stop();
}
catch { } process.exit(0); });
process.once('SIGTERM', async () => { try {
    await bot.stop();
}
catch { } process.exit(0); });
//# sourceMappingURL=app.js.map