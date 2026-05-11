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
const embeddings_1 = require("./embeddings");
const WebSocket = require('ws');
const gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY || '' });
async function hfAmharicReply(msg) {
    if (!process.env.HF_API_KEY)
        return null;
    try {
        const r = await fetch('https://api-inference.huggingface.co/models/EthioFX/getedil-amharic-v1', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.HF_API_KEY}` },
            body: JSON.stringify({
                inputs: `<|system|>You are Gete (ጌጤ), an AI tutor for Get'Edil (ጌት፟እድል). Speak natural Amharic.</s><|user|>${msg}</s><|assistant|>`,
                parameters: { max_new_tokens: 300, temperature: 0.7 }
            }),
        });
        const d = await r.json();
        if (d.error) {
            console.log('HF error:', d.error);
            return null;
        }
        return d[0]?.generated_text?.split('<|assistant|>').pop()?.trim() || null;
    }
    catch {
        return null;
    }
}
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
        (0, embeddings_1.seedContentEmbeddings)(supabase).catch(() => { });
    }
    else {
        console.log('⚠️ Supabase URL or key missing');
    }
}
catch (e) {
    supabase = null;
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
async function getCourseStats(uid) {
    try {
        const { data } = await supabase.from('course_progress').select('course_id,module_id').eq('telegram_id', uid).eq('completed', true);
        if (!data)
            return [];
        const g = {};
        for (const r of data) {
            if (!g[r.course_id])
                g[r.course_id] = [];
            g[r.course_id].push(r.module_id);
        }
        return Object.entries(g).map(([c, m]) => ({ course: c, done: m.length, total: COURSES[c]?.mods.length || 0 }));
    }
    catch {
        return [];
    }
}
const COURSES = {
    'ai': { title: 'AI Engineering 101', mods: ['intro', 'prompts', 'vectors', 'llm', 'apps'] },
};
const LESSONS = {
    'ai/intro': '🤖 <b>Introduction to AI</b>\n\nAI teaches computers to think like humans.\n\n📌 <b>Key Concepts:</b>\n• Machine Learning — learn from data\n• Deep Learning — neural networks\n• NLP — understand language\n\n🇪🇹 <b>AI in Ethiopia:</b> Smart farming, healthcare, tech jobs\n\n➡️ /learn ai prompts',
    'ai/prompts': '🎯 <b>Prompt Engineering</b>\n\n<b>4 Elements of Great Prompts:</b>\n1. Role — Tell AI who to be\n2. Context — Give background\n3. Task — Be specific\n4. Format — Specify output\n\n💡 <b>Example:</b>\n"You are a Python tutor. Explain loops with Amharic examples."\n\n➡️ /learn ai vectors',
    'ai/vectors': '🗄️ <b>Vector Databases</b>\n\nStore & search by meaning, not keywords.\n\n🔍 <b>Use Cases:</b>\n• Semantic search\n• RAG (Retrieval Augmented Generation)\n• Recommendations\n\n🛠️ <b>Tools:</b> Pinecone, Weaviate, pgvector\n\n➡️ /learn ai llm',
    'ai/llm': '🔌 <b>LLM Integration</b>\n\nConnect AI models to your apps.\n\n📋 <b>Steps:</b>\n1. Choose model (Gemini, GPT, Llama)\n2. Get API key\n3. Send prompts → Get responses\n4. Build features\n\n➡️ /learn ai apps',
    'ai/apps': '🏗️ <b>Building AI Apps</b>\n\n✅ <b>You\'ve learned:</b>\n• AI fundamentals\n• Prompt engineering\n• Vector databases\n• LLM integration\n\n🎉 <b>Course Complete!</b> 🏆\n\nCheck /progress to see your achievement!',
};
async function aiReply(msg, telegramId) {
    let context = '';
    if (supabase) {
        try {
            const knowledgeContext = await (0, embeddings_1.searchContext)(supabase, msg, telegramId, 4);
            if (knowledgeContext)
                context = 'Relevant information:\n\n' + knowledgeContext + '\n\n';
            if (telegramId) {
                const profile = await (0, embeddings_1.getUserProfileContext)(supabase, telegramId);
                if (profile)
                    context += 'About user: ' + profile + '\n\n';
            }
        }
        catch { }
    }
    if (/[\u1200-\u137F]/.test(msg)) {
        const hfReply = await hfAmharicReply(msg);
        if (hfReply)
            return hfReply;
        if (process.env.GEMINI_API_KEY) {
            try {
                const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
                const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `${context}You are Gete (ጌጤ), the AI tutor for Get'Edil (ጌት፟እድል). Speak natural Amharic.\n\nStudent: ${msg}` }] }] });
                return r.response.text();
            }
            catch { }
        }
    }
    try {
        const r = await groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: `You are Gete (ጌጤ), the AI tutor for Get'Edil (ጌት፟እድል). ${context}` }, { role: 'user', content: msg }], max_tokens: 600 });
        return r.choices[0]?.message?.content || 'Error.';
    }
    catch {
        return 'AI unavailable.';
    }
}
const bot = new telegraf_1.Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
// ==================== COMMANDS ====================
bot.command('start', async (ctx) => {
    const uid = ctx.from?.id;
    if (uid)
        await saveProfile(uid, ctx.from?.first_name || 'Student', ctx.from?.username);
    await ctx.reply('👋 Welcome to <b>Get\'Edil</b> (ጌት፟እድል)! 🚀\n\n' +
        'I\'m your AI tutor. I speak <b>Amharic</b> and <b>English</b>.\n\n' +
        '📚 /courses | 💼 /jobs | 📝 /memory | 📊 /progress\n\n' +
        'Try sending me a message or voice note! 🎤', { parse_mode: 'HTML' });
});
bot.command('pay', async (ctx) => {
    const uid = ctx.from?.id;
    if (!uid) {
        await ctx.reply('Cannot identify user.');
        return;
    }
    await ctx.reply('💳 Generating your payment link...');
    try {
        const response = await fetch(`https://txhcnsxzcbkoroyasmlc.supabase.co/functions/v1/super-service`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                amount: 100,
                email: `${uid}@getedil.user`,
                first_name: ctx.from?.first_name || 'Student',
                last_name: ctx.from?.last_name || '',
                tx_ref: `GETEDIL-${Date.now()}-${uid}`,
                user_id: uid
            })
        });
        const data = await response.json();
        if (data.status === 'success' && data.data?.checkout_url) {
            // Save transaction
            if (supabase) {
                await supabase.from('transactions').insert({
                    user_id: uid,
                    amount: 100,
                    tx_ref: data.data.tx_ref,
                    status: 'pending',
                    type: 'course_purchase'
                });
            }
            await ctx.reply(`💳 <b>Complete Your Payment</b>\n\n` +
                `💰 Amount: 100 ETB (Test)\n` +
                `📚 Get'Edil Premium Access\n\n` +
                `🔗 <b>Pay here:</b>\n${data.data.checkout_url}\n\n` +
                `<i>Test card: 4242 4242 4242 4242 | Any date | Any CVV</i>`, { parse_mode: 'HTML' });
        }
        else {
            throw new Error(data.message || 'Payment link failed');
        }
    }
    catch (e) {
        console.error('Payment error:', e.message);
        await ctx.reply('💳 <b>Get\'Edil Premium</b>\n\n' +
            '📚 Full AI Engineering Course\n🏆 NFT Certificate\n💬 Priority Support\n\n' +
            '💰 <b>500 ETB</b> (one-time)\n\n' +
            '⚠️ Payment via Chapa (Telebirr/CBE) coming soon.\n' +
            'For now, all content is <b>FREE</b>! Start: /learn ai intro', { parse_mode: 'HTML' });
    }
});
bot.command('help', async (ctx) => { await ctx.reply('/courses /jobs /memory /progress /stats /help'); });
bot.command('courses', async (ctx) => {
    await ctx.reply('📚 <b>AI Engineering 101</b> — 5 modules\n👉 /learn ai intro', { parse_mode: 'HTML' });
});
bot.command('learn', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    const uid = ctx.from?.id;
    if (!args.length) {
        await ctx.reply('Usage: /learn ai intro');
        return;
    }
    const courseId = args[0];
    const modId = args[1];
    const course = COURSES[courseId];
    if (!course) {
        await ctx.reply('Course not found. /courses');
        return;
    }
    if (!modId) {
        const done = uid ? await getDone(uid, courseId) : [];
        const list = course.mods.map((m, i) => `${i + 1}. ${m}${done.includes(m) ? ' ✅' : ''}\n   /learn ${courseId} ${m}`).join('\n\n');
        await ctx.reply(`📚 <b>${course.title}</b>\n\n${list}`, { parse_mode: 'HTML' });
        return;
    }
    const key = `${courseId}/${modId}`;
    const lesson = LESSONS[key] || '📖 Module coming soon!';
    await ctx.reply(lesson, { parse_mode: 'HTML' });
    if (uid)
        await markDone(uid, courseId, modId);
});
bot.command('jobs', async (ctx) => {
    const jobs = [
        { t: 'AI/ML Engineer', c: 'Ethiopian AI Institute', l: 'Addis Ababa' },
        { t: 'Full Stack Developer', c: 'Safaricom Ethiopia', l: 'Addis Ababa' },
        { t: 'Python Developer', c: 'Multiple Companies', l: 'Remote / Addis Ababa' },
        { t: 'Data Scientist', c: 'Commercial Bank of Ethiopia', l: 'Addis Ababa' },
        { t: 'Freelance AI Trainer', c: 'Upwork / Fiverr', l: 'Remote' },
        { t: 'Cloud Engineer', c: 'Raxio Data Centre', l: 'Addis Ababa' },
        { t: 'React Native Developer', c: 'Gebeya Inc.', l: 'Addis Ababa' },
    ];
    const msg = '💼 <b>Ethiopian Tech Jobs</b>\n\n' + jobs.map(j => `<b>${j.t}</b>\n🏢 ${j.c}\n📍 ${j.l}`).join('\n\n');
    await ctx.reply(msg, { parse_mode: 'HTML' });
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
    let m = `📝 <b>Your Memory</b> (${total} messages)\n\n`;
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
    const msgs = await countMsgs(uid);
    const courses = await getCourseStats(uid);
    let m = `📊 <b>Your Progress</b>\n\n💬 Messages: ${msgs}\n\n`;
    if (courses.length) {
        m += '<b>Courses:</b>\n';
        for (const c of courses)
            m += `📚 ${c.course}: ${c.done}/${c.total} modules\n`;
    }
    else {
        m += '📚 No courses started. Try /learn ai intro!';
    }
    await ctx.reply(m, { parse_mode: 'HTML' });
});
// ==================== AUTOMATION SUITE ====================
bot.on('new_chat_members', async (ctx) => {
    const newMembers = ctx.message['new_chat_members'] || [];
    for (const member of newMembers) {
        if (member.is_bot)
            return;
        const name = member.first_name || 'Friend';
        await ctx.reply(`👋 እንኳን ደህና መጣህ ${name}! Welcome to <b>Get'Edil Community</b>! 🇪🇹\n\n` +
            `I'm <b>Gete</b> (ጌጤ), your AI tutor.\n\n` +
            `📚 /courses | 💼 /jobs | 💬 Ask me anything\n\n` +
            `🔗 Updates: @GetEdilOfficial`, { parse_mode: 'HTML' });
    }
});
bot.on('my_chat_member', async (ctx) => {
    const update = ctx.update['my_chat_member'];
    if (update?.new_chat_member?.status === 'administrator') {
        await ctx.reply(`👋 <b>Get'Edil is here!</b> 🇪🇹\n\n` +
            `I'm your AI tutor and community manager.\n\n` +
            `📚 /courses | 💼 /jobs | 💬 Ask me anything\n\n` +
            `Happy learning! 🚀`, { parse_mode: 'HTML' });
    }
});
bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (uid)
        activeUsers.add(uid);
    await next();
});
const SPAM_PATTERNS = [/t\.me\/joinchat/i, /bit\.ly/i, /tinyurl/i, /click here/i, /earn.*money/i, /make.*money/i, /crypto.*invest/i, /forex/i, /casino/i, /betting/i];
bot.use(async (ctx, next) => {
    if (ctx.message && 'text' in ctx.message) {
        const text = ctx.message.text;
        if (SPAM_PATTERNS.some(p => p.test(text))) {
            try {
                await ctx.deleteMessage();
            }
            catch { }
            return;
        }
    }
    await next();
});
async function postWeeklyJobs() {
    const jobs = [
        { t: 'AI/ML Engineer', c: 'Ethiopian AI Institute', l: 'Addis Ababa' },
        { t: 'Full Stack Developer', c: 'Safaricom Ethiopia', l: 'Addis Ababa' },
        { t: 'Python Developer', c: 'Multiple Companies', l: 'Remote / Addis Ababa' },
        { t: 'Data Scientist', c: 'Commercial Bank of Ethiopia', l: 'Addis Ababa' },
        { t: 'Freelance AI Trainer', c: 'Upwork / Fiverr', l: 'Remote' },
    ];
    const msg = `📊 <b>Weekly Ethiopian Tech Jobs</b>\n📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}\n\n` +
        jobs.map(j => `🔥 <b>${j.t}</b>\n🏢 ${j.c}\n📍 ${j.l}\n\n`).join('') +
        `💡 Start learning: @GETEDILOSBOT\n👥 Join: @GetEdilCommunity`;
    try {
        await bot.telegram.sendMessage('@GetEdilOfficial', msg, { parse_mode: 'HTML' });
    }
    catch { }
}
async function postDailyTip() {
    const tips = ['💡 Write prompts with 4 elements: Role, Context, Task, Format.', '💡 Practice coding 30 minutes daily.', '💡 Build a portfolio project.', '💡 Use Git for version control.', '💡 Read error messages carefully.', '💡 Join Ethiopian tech communities.', '💡 Start freelancing early.'];
    const tip = tips[new Date().getDay() % tips.length];
    try {
        await bot.telegram.sendMessage('@GetEdilOfficial', tip, { parse_mode: 'HTML' });
    }
    catch { }
}
setInterval(() => {
    const now = new Date();
    if (now.getUTCHours() === 6 && now.getUTCMinutes() === 0) {
        if (now.getUTCDay() === 1)
            postWeeklyJobs();
        postDailyTip();
    }
}, 60000);
setTimeout(() => { postWeeklyJobs(); postDailyTip(); }, 15000);
// Stats command (works with or without bot tag)
bot.hears(/^\/stats(@GETEDILOSBOT)?/, async (ctx) => {
    try {
        const memberCount = await ctx.getChatMembersCount();
        await ctx.reply(`📊 <b>Community Stats</b>\n\n👥 Members: ${memberCount}\n📅 Active today: ${activeUsers.size} users`, { parse_mode: 'HTML' });
    }
    catch {
        await ctx.reply('Stats not available.');
    }
});
// ==================== VOICE & TEXT ====================
bot.on('voice', async (ctx) => {
    if (!transcriber) {
        await ctx.reply('🎤 Voice not available.');
        return;
    }
    const uid = ctx.from?.id;
    await ctx.reply('🎤 Transcribing...');
    try {
        const url = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
        const { text, language } = await transcriber.transcribe(url.href);
        console.log('🎤 Voice:', language, '-', text.slice(0, 80));
        await ctx.reply('📝 ' + (language === 'am' ? 'የተፃፈ' : 'Transcribed') + ': "' + text + '"\n\n🤖 Thinking...');
        if (uid) {
            await saveMsg(uid, 'user', '🎤 ' + text);
            (0, embeddings_1.indexUserMessage)(supabase, uid, 'user', text).catch(() => { });
        }
        await ctx.sendChatAction('typing');
        const reply = await aiReply(text, uid);
        if (uid) {
            await saveMsg(uid, 'assistant', reply);
            (0, embeddings_1.indexUserMessage)(supabase, uid, 'assistant', reply).catch(() => { });
        }
        await ctx.reply(reply);
    }
    catch (e) {
        console.error('Voice error:', e.message);
        await ctx.reply('❌ Could not transcribe.');
    }
});
bot.on('text', async (ctx) => {
    const msg = ctx.message.text;
    if (msg.startsWith('/'))
        return;
    const uid = ctx.from?.id;
    console.log('📩', ctx.from?.first_name, ':', msg.slice(0, 60));
    if (uid) {
        await saveProfile(uid, ctx.from?.first_name || '', ctx.from?.username);
        await saveMsg(uid, 'user', msg);
        (0, embeddings_1.indexUserMessage)(supabase, uid, 'user', msg).catch(() => { });
    }
    await ctx.sendChatAction('typing');
    try {
        const reply = await aiReply(msg, uid);
        if (uid) {
            await saveMsg(uid, 'assistant', reply);
            (0, embeddings_1.indexUserMessage)(supabase, uid, 'assistant', reply).catch(() => { });
        }
        await ctx.reply(reply);
    }
    catch {
        await ctx.reply('Error.');
    }
});
// ==================== VOICE TRANSCRIBER ====================
class VoiceTranscriber {
    async transcribe(fileUrl) {
        const r = await fetch(fileUrl);
        const buf = Buffer.from(await r.arrayBuffer());
        const b64 = buf.toString('base64');
        const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const res = await m.generateContent([
            { text: 'Transcribe this audio. Output only the text. If Amharic, use Ge\'ez script.' },
            { inlineData: { mimeType: 'audio/ogg', data: b64 } },
        ]);
        const text = res.response.text().trim();
        return { text, language: /[\u1200-\u137F]/.test(text) ? 'am' : 'en' };
    }
}
if (process.env.GEMINI_API_KEY) {
    transcriber = new VoiceTranscriber();
    console.log('🎤 Voice enabled');
}
// ==================== START ====================
const port = parseInt(process.env.PORT || '10000');
(0, http_1.createServer)((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200).end('OK');
        return;
    }
    res.writeHead(200).end('GETEDIL-OS-BOT');
}).listen(port, () => console.log('🏥 Health :' + port));
console.log('🤖 Starting polling mode...');
bot.launch({ dropPendingUpdates: true, allowedUpdates: ['message', 'callback_query'] }).then(() => {
    console.log('✅ Polling connected');
}).catch(() => {
    console.log('⚠️ Polling error, retrying in 5s...');
    setTimeout(() => bot.launch({ dropPendingUpdates: true }), 5000);
});
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
//# sourceMappingURL=app.js.map