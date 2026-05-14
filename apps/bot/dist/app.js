"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const telegraf_1 = require("telegraf");
const generative_ai_1 = require("@google/generative-ai");
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const supabase_js_1 = require("@supabase/supabase-js");
const http_1 = require("http");
const ws_1 = __importDefault(require("ws"));
const node_cron_1 = __importDefault(require("node-cron"));
const gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY || '' });
let transcriber = null;
const activeUsers = new Set();
// === ANTI-SPAM SYSTEM ===
const rateLimits = new Map();
const userViolations = new Map();
const SPAM_KEYWORDS = [
    'earn money fast', 'double your', 'investment opportunity',
    'click here', 'limited time', 'act now', 'guaranteed profit',
    'binary options', 'forex signals', 'crypto pump',
    'free money', 'make $', 'work from home', 'click the link',
    'telegram premium', 'verify account', 'suspicious link',
    'whatsApp', 'contact me', 'dm me', 'message me',
    'loan', 'credit card', 'bank transfer', 'urgent'
];
function isRateLimited(userId) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxMessages = 10;
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
function containsSpam(text) {
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
    if (/\+\d{10,}/.test(text) && lower.includes('contact')) {
        return { isSpam: true, reason: 'Contact number spam' };
    }
    return { isSpam: false, reason: '' };
}
async function handleSpam(ctx, reason) {
    const userId = ctx.from?.id;
    console.log(`🚫 Spam from ${ctx.from?.first_name} (${userId}): ${reason}`);
    const violations = (userViolations.get(userId) || 0) + 1;
    userViolations.set(userId, violations);
    try {
        await ctx.deleteMessage();
    }
    catch {
        console.log('Could not delete message — not admin?');
    }
    let warning = `⚠️ <b>Anti-Spam</b>\n\n${ctx.from?.first_name}, your message was removed: ${reason}`;
    if (violations >= 3) {
        warning += `\n\n🚫 <b>You have ${violations} violations.</b> One more and you will be removed.`;
    }
    await ctx.reply(warning, { parse_mode: 'HTML' });
    if (violations >= 5) {
        try {
            await ctx.banChatMember(userId);
            await ctx.reply(`🚫 ${ctx.from?.first_name} has been removed for repeated spam.`, { parse_mode: 'HTML' });
        }
        catch {
            console.log('Could not ban — not admin?');
        }
    }
    try {
        await supabase.from('spam_logs').insert({
            telegram_id: userId,
            username: ctx.from?.username,
            reason,
            message_preview: ctx.message?.text?.slice(0, 200),
            violation_count: violations,
            created_at: new Date().toISOString()
        });
    }
    catch { }
}
console.log('\nGETEDIL-OS-BOT\n');
let supabase = null;
try {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (url && key) {
        supabase = (0, supabase_js_1.createClient)(url, key, { realtime: { transport: ws_1.default }, auth: { persistSession: false } });
        console.log('📦 Supabase connected');
    }
}
catch (e) {
    console.log('⚠️ Supabase init failed:', e.message);
}
async function saveMsg(uid, role, text) {
    try {
        await supabase.from('conversation_history').insert({
            telegram_id: uid,
            role,
            content: text.slice(0, 4000)
        });
    }
    catch { }
}
async function getRecent(uid, n = 6) {
    try {
        const { data } = await supabase
            .from('conversation_history')
            .select('role,content')
            .eq('telegram_id', uid)
            .order('created_at', { ascending: false })
            .limit(n);
        return (data || []).reverse();
    }
    catch {
        return [];
    }
}
async function countMsgs(uid) {
    try {
        const { count } = await supabase
            .from('conversation_history')
            .select('*', { count: 'exact', head: true })
            .eq('telegram_id', uid);
        return count || 0;
    }
    catch {
        return 0;
    }
}
async function saveProfile(uid, name, uname) {
    try {
        await supabase.from('user_profiles').upsert({
            telegram_id: uid,
            first_name: name,
            username: uname || null,
            last_active_at: new Date().toISOString()
        }, { onConflict: 'telegram_id' });
    }
    catch { }
}
async function markDone(uid, course, mod) {
    try {
        await supabase.from('course_progress').upsert({
            telegram_id: uid,
            course_id: course,
            module_id: mod,
            completed: true,
            completed_at: new Date().toISOString()
        }, { onConflict: 'telegram_id, course_id, module_id' });
    }
    catch { }
}
async function getDone(uid, course) {
    try {
        const { data } = await supabase
            .from('course_progress')
            .select('module_id')
            .eq('telegram_id', uid)
            .eq('course_id', course)
            .eq('completed', true);
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
            const r = await m.generateContent({
                contents: [{
                        role: 'user',
                        parts: [{
                                text: `You are Gete (ጌጤ), the AI tutor for Get'Edil (ጌት፟እድል). Speak ONLY natural Amharic. No transliterations, no English.\n\nStudent: ${msg}`
                            }]
                    }]
            });
            return r.response.text();
        }
        catch { }
    }
    try {
        const r = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: msg }],
            max_tokens: 600
        });
        return r.choices[0]?.message?.content || 'Error.';
    }
    catch {
        return 'AI unavailable.';
    }
}
// === TTS FUNCTION ===
async function textToSpeech(text, lang = 'en') {
    if (lang === 'am') {
        // Fallback to Google TTS for Amharic
        return googleTextToSpeech(text, lang);
    }
    // Use ElevenLabs for English
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
        throw new Error('ELEVENLABS_API_KEY not set');
    }
    const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Adam
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey
        },
        body: JSON.stringify({
            text: text.substring(0, 500),
            model_id: 'eleven_multilingual_v2', // or eleven_flash_v2_5 for speed
            voice_settings: { stability: 0.5, similarity_boost: 0.5 }
        })
    });
    if (!res.ok) {
        const error = await res.text();
        throw new Error(`ElevenLabs failed: ${res.status} - ${error}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
// Fallback Google TTS for Amharic
async function googleTextToSpeech(text, lang) {
    const encodedText = encodeURIComponent(text.substring(0, 500));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://translate.google.com/'
        }
    });
    if (!res.ok)
        throw new Error(`Google TTS failed: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
const COURSES = {
    'ai': {
        'intro': '🤖 **What is AI?**\n\nAI is when computers learn to do tasks that normally need human intelligence.\n\n*Key idea:* Instead of programming every rule, we show the computer *examples* and it learns patterns.\n\n*Your turn:* Ask me anything about AI!',
        'prompts': '✍️ **Prompt Engineering**\n\nA prompt is how you talk to AI. Good prompts = good answers.\n\n*Tip:* Be specific. Instead of "write code", say "write a Python function that sorts a list of numbers".',
        'vectors': '📊 **Vector Databases**\n\nVectors are numbers that represent meaning. Similar ideas = close vectors.\n\n*Example:* "king" - "man" + "woman" = "queen"',
        'llm': '🧠 **Large Language Models**\n\nLLMs like Gemini learn from billions of text examples. They predict the next word.\n\n*Limitation:* They don\'t "know" facts — they predict what sounds right.',
        'apps': '🚀 **Building AI Apps**\n\nNow you combine everything:\n1. Prompt engineering\n2. Vector search\n3. LLM calls\n4. Deploy to Telegram\n\n*Project idea:* Build a bot that answers questions about Ethiopian history!'
    }
};
const bot = new telegraf_1.Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
// === ANTI-SPAM MIDDLEWARE ===
bot.use(async (ctx, next) => {
    if (ctx.chat?.type === 'private')
        return next();
    const userId = ctx.from?.id;
    if (!userId)
        return next();
    try {
        const member = await ctx.getChatMember(userId);
        if (member.status === 'administrator' || member.status === 'creator') {
            return next();
        }
    }
    catch { }
    if (isRateLimited(userId)) {
        await handleSpam(ctx, 'Too many messages');
        return;
    }
    const msg = ctx.message;
    const text = msg?.text || msg?.caption || '';
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
    if (ctx.from?.id)
        await saveProfile(ctx.from.id, ctx.from.first_name || 'Student', ctx.from.username);
    await ctx.reply(`👋 Welcome to <b>Get'Edil</b>! 🚀\n\n` +
        `📚 /courses | 💼 /jobs | 💳 /pay | 🎙️ /voice | ⚙️ /settings | /help`, { parse_mode: 'HTML' });
});
bot.command('help', async (ctx) => {
    await ctx.reply('/courses /jobs /pay /voice /memory /progress /stats /spamstats /settings /help');
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
    const courseId = args[0];
    const modId = args[1];
    if (!courseId || !modId) {
        await ctx.reply('📚 /learn ai intro | /learn ai prompts | /learn ai vectors | /learn ai llm | /learn ai apps');
        return;
    }
    const content = COURSES[courseId]?.[modId];
    if (!content) {
        await ctx.reply('❌ Module not found. Try: /learn ai intro');
        return;
    }
    await ctx.reply(content, { parse_mode: 'Markdown' });
    if (ctx.from?.id)
        await markDone(ctx.from.id, courseId, modId);
});
bot.command('jobs', async (ctx) => {
    try {
        const { data: jobs } = await supabase
            .from('jobs')
            .select('*')
            .order('posted_at', { ascending: false })
            .limit(10);
        if (!jobs || jobs.length === 0) {
            await ctx.reply('💼 No jobs found. Try again later!');
            return;
        }
        let msg = '💼 <b>Latest Tech Jobs</b>\n\n';
        for (const job of jobs) {
            const emoji = job.type === 'remote' ? '🌐' : job.type === 'freelance' ? '💻' : '🏢';
            msg += `${emoji} <b>${job.title}</b>\n`;
            msg += `   ${job.company} | ${job.location}\n`;
            msg += `   <a href="${job.url}">Apply</a>\n\n`;
        }
        await ctx.reply(msg, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true }
        });
    }
    catch {
        await ctx.reply('💼 Jobs unavailable. Try: /jobs later');
    }
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
bot.command('spamstats', async (ctx) => {
    try {
        const { count } = await supabase
            .from('spam_logs')
            .select('*', { count: 'exact', head: true });
        await ctx.reply(`🛡️ <b>Anti-Spam Stats</b>\n\nTotal blocked: ${count || 0}\nActive violators: ${userViolations.size}`, { parse_mode: 'HTML' });
    }
    catch {
        await ctx.reply('Stats unavailable.');
    }
});
// === VOICE COMMANDS ===
bot.command('voice', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) {
        await ctx.reply('Cannot identify user.');
        return;
    }
    const { data: messages } = await supabase
        .from('conversation_history')
        .select('content')
        .eq('telegram_id', uid)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1);
    const lastReply = messages?.[0]?.content;
    if (!lastReply) {
        await ctx.reply('Ask me a question first, then /voice to hear the reply.');
        return;
    }
    await ctx.reply('🎙️ Generating voice...');
    try {
        const isAmharic = /[\u1200-\u137F]/.test(lastReply);
        const audioBuffer = await textToSpeech(lastReply, isAmharic ? 'am' : 'en');
        await ctx.replyWithVoice({ source: audioBuffer });
    }
    catch {
        await ctx.reply('❌ Voice generation failed. Try again.');
    }
});
bot.command('settings', async (ctx) => {
    await ctx.reply('⚙️ <b>Settings</b>\n\n' +
        '🎙️ Voice replies: /voice_on or /voice_off\n' +
        '🌐 Language: /lang_en or /lang_am', { parse_mode: 'HTML' });
});
bot.command('voice_on', async (ctx) => {
    if (ctx.from?.id) {
        await supabase.from('user_profiles').update({ voice_replies: true }).eq('telegram_id', ctx.from.id);
        await ctx.reply('🎙️ Voice replies enabled! I will reply with voice for all messages.');
    }
});
bot.command('voice_off', async (ctx) => {
    if (ctx.from?.id) {
        await supabase.from('user_profiles').update({ voice_replies: false }).eq('telegram_id', ctx.from.id);
        await ctx.reply('🎙️ Voice replies disabled.');
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
        // Check if user wants voice replies
        if (uid) {
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('voice_replies')
                .eq('telegram_id', uid)
                .single();
            if (profile?.voice_replies) {
                await ctx.sendChatAction('record_voice');
                const isAmharic = /[\u1200-\u137F]/.test(reply);
                const audioBuffer = await textToSpeech(reply, isAmharic ? 'am' : 'en');
                await ctx.replyWithVoice({ source: audioBuffer });
                return;
            }
        }
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
    }
    catch {
        await ctx.reply('❌ Failed.');
    }
});
// === SCHEDULED TASKS ===
node_cron_1.default.schedule('0 9 * * *', async () => {
    console.log('🌅 Scheduled daily tips...');
    try {
        const { sendDailyTips } = await import('./cron/daily-tip.js');
        await sendDailyTips();
    }
    catch (e) {
        console.error('Daily tips failed:', e);
    }
});
node_cron_1.default.schedule('0 */6 * * *', async () => {
    console.log('🔍 Scheduled job scraping...');
    try {
        const { scrapeAllJobs } = await import('./cron/job-scraper.js');
        await scrapeAllJobs();
    }
    catch (e) {
        console.error('Job scraping failed:', e);
    }
});
// === HEALTH + ANALYTICS SERVER ===
const port = parseInt(process.env.PORT || '10000');
(0, http_1.createServer)(async (req, res) => {
    if (req.url === '/health') {
        res.writeHead(200).end('OK');
        return;
    }
    if (req.url === '/analytics') {
        try {
            const { count: totalUsers } = await supabase
                .from('user_profiles')
                .select('*', { count: 'exact', head: true });
            const { count: activeToday } = await supabase
                .from('user_profiles')
                .select('*', { count: 'exact', head: true })
                .gte('last_active_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
            const { count: totalMessages } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true });
            const { count: messagesToday } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
            const { count: spamBlocked } = await supabase
                .from('spam_logs')
                .select('*', { count: 'exact', head: true });
            const { count: totalJobs } = await supabase
                .from('jobs')
                .select('*', { count: 'exact', head: true });
            const analytics = {
                users: { total: totalUsers || 0, activeToday: activeToday || 0 },
                messages: { total: totalMessages || 0, today: messagesToday || 0 },
                spamBlocked: spamBlocked || 0,
                jobs: totalJobs || 0,
                timestamp: new Date().toISOString()
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(analytics, null, 2));
            return;
        }
        catch {
            res.writeHead(500).end('Error');
            return;
        }
    }
    res.writeHead(200).end('GETEDIL-OS-BOT');
}).listen(port, () => console.log('🏥 Health + Analytics :' + port));
bot.launch({ dropPendingUpdates: true })
    .then(() => console.log('✅ Polling connected'))
    .catch(() => setTimeout(() => bot.launch({ dropPendingUpdates: true }), 5000));
process.once('SIGINT', async () => {
    try {
        await bot.stop();
    }
    catch { }
    process.exit(0);
});
process.once('SIGTERM', async () => {
    try {
        await bot.stop();
    }
    catch { }
    process.exit(0);
});
// Helper function
async function getOrCreateUser(telegramUser) {
    const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('telegram_id', telegramUser.id)
        .single();
    if (data)
        return data;
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
//# sourceMappingURL=app.js.map