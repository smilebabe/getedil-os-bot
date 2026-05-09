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
// Voice transcriber (uses gemini from line 77)
let transcriber = null;
console.log('\nGETEDIL-OS-BOT\n');
// ============================================
// Supabase (safe init)
// ============================================
let supabase = null;
try {
    const url = process.env.SUPABASE_URL || '';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    if (url && key) {
        supabase = (0, supabase_js_1.createClient)(url, key, { realtime: { transport: WebSocket },
            auth: { persistSession: false },
        });
        console.log('📦 Supabase connected');
    }
    else {
        console.log('⚠️ Supabase URL or key missing');
    }
}
catch (e) {
    supabase = null;
    console.log('⚠️ Supabase init failed:', e.message);
}
// Safe DB helpers - never crash on error
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
// ============================================
// Courses
// ============================================
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
// ============================================
// AI
// ============================================
const gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const groq = new groq_sdk_1.default({ apiKey: process.env.GROQ_API_KEY || '' });
async function aiReply(msg) {
    if (/[\u1200-\u137F]/.test(msg) && process.env.GEMINI_API_KEY) {
        try {
            const m = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const r = await m.generateContent({ contents: [{ role: 'user', parts: [{ text: `You are Getedil, an AI tutor for Ethiopian students. Speak natural Amharic.\n\nStudent: ${msg}` }] }] });
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
// ============================================
// Bot
// ============================================
const bot = new telegraf_1.Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
bot.command('start', async (ctx) => {
    const uid = ctx.from?.id;
    if (uid)
        await saveProfile(uid, ctx.from?.first_name || 'Student', ctx.from?.username);
    await ctx.reply('👋 Welcome to <b>Getedil</b>! 🚀\n\n📚 /courses | 💼 /jobs | 📝 /memory | 📊 /progress\n\nJust send me a message!', { parse_mode: 'HTML' });
});
bot.command('help', async (ctx) => { await ctx.reply('/courses /jobs /memory /progress /help'); });
bot.command('courses', async (ctx) => {
    await ctx.reply('📚 <b>Courses</b>\n\n<b>AI Engineering 101</b> — 5 modules\n👉 /learn ai intro\n\nStart with /learn ai intro', { parse_mode: 'HTML' });
});
bot.command('jobs', async (ctx) => {
    await ctx.reply('💼 Fetching Ethiopian tech jobs...');
    const jobs = [];
    // Try Ethiojobs
    try {
        const res = await fetch('https://www.ethiojobs.net/jobs/', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await res.text();
        // Simple regex extraction of job titles
        const titleRegex = /<h2[^>]*class="[^"]*job-title[^"]*"[^>]*>(.*?)<\/h2>/gi;
        let match;
        while ((match = titleRegex.exec(html)) !== null && jobs.length < 4) {
            const title = match[1].replace(/<[^>]*>/g, '').trim();
            if (title)
                jobs.push(`<b>${title}</b>\n🏢 Ethiojobs\n📍 Ethiopia\n🔗 https://www.ethiojobs.net`);
        }
    }
    catch (e) {
        console.log('Ethiojobs:', e.message);
    }
    // Try Dereja  
    if (jobs.length < 4) {
        try {
            const res = await fetch('https://dereja.com/jobs', {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const html = await res.text();
            const titleRegex = /<h3[^>]*>(.*?)<\/h3>/gi;
            let match;
            while ((match = titleRegex.exec(html)) !== null && jobs.length < 8) {
                const title = match[1].replace(/<[^>]*>/g, '').trim();
                if (title && title.length > 5)
                    jobs.push(`<b>${title}</b>\n🏢 Dereja\n📍 Ethiopia\n🔗 https://dereja.com`);
            }
        }
        catch (e) {
            console.log('Dereja:', e.message);
        }
    }
    // Fallback
    if (jobs.length === 0) {
        const fallbacks = [
            '<b>AI/ML Engineer</b>\n🏢 Ethiopian AI Institute\n📍 Addis Ababa',
            '<b>Full Stack Developer</b>\n🏢 Safaricom Ethiopia\n📍 Addis Ababa',
            '<b>Python Developer</b>\n🏢 Multiple Companies\n📍 Remote / Addis Ababa',
            '<b>Data Scientist</b>\n🏢 Commercial Bank of Ethiopia\n📍 Addis Ababa',
            '<b>Freelance AI Trainer</b>\n🏢 Upwork / Fiverr\n📍 Remote',
            '<b>Cloud Engineer</b>\n🏢 Raxio Data Centre\n📍 Addis Ababa',
        ];
        jobs.push(...fallbacks);
    }
    await ctx.reply('💼 <b>Ethiopian Tech Jobs</b>\n\n' + jobs.join('\n\n'), { parse_mode: 'HTML' });
});
;
bot.command('jobs', async (ctx) => {
    await ctx.reply('💼 Searching latest Ethiopian tech jobs...');
    const jobs = [];
    // Scrape Ethiojobs
    try {
        const res = await fetch('https://www.ethiojobs.net/jobs/', {
            headers: { 'User-Agent': 'GetedilBot/1.0 (Telegram Education Bot)' },
            signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            $('.job-listing, .job-item, article, .listing-card').each((_i, el) => {
                if (_i >= 5)
                    return false;
                const title = $(el).find('.job-title, h2, h3, .title').first().text().trim();
                const company = $(el).find('.company-name, .employer, .company').first().text().trim();
                const location = $(el).find('.location, .region').first().text().trim() || 'Ethiopia';
                const link = $(el).find('a').first().attr('href') || '';
                if (title && title.length > 3) {
                    jobs.push({
                        title,
                        company: company || 'Ethiojobs',
                        location,
                        url: link.startsWith('http') ? link : 'https://www.ethiojobs.net' + link,
                    });
                }
            });
        }
    }
    catch (e) {
        console.log('Ethiojobs scrape:', e.message);
    }
    // Scrape Dereja
    if (jobs.length < 5) {
        try {
            const res = await fetch('https://dereja.com/jobs', {
                headers: { 'User-Agent': 'GetedilBot/1.0 (Telegram Education Bot)' },
                signal: AbortSignal.timeout(8000),
            });
            if (res.ok) {
                const html = await res.text();
                const $ = cheerio.load(html);
                $('.job-card, .listing-item, .vacancy, .job-listing').each((_i, el) => {
                    if (jobs.length >= 8)
                        return false;
                    const title = $(el).find('.title, h3, h4, .job-title').first().text().trim();
                    const company = $(el).find('.company, .organization, .employer').first().text().trim();
                    const location = $(el).find('.location, .region').first().text().trim() || 'Ethiopia';
                    const link = $(el).find('a').first().attr('href') || '';
                    if (title && title.length > 3) {
                        jobs.push({
                            title,
                            company: company || 'Dereja',
                            location,
                            url: link.startsWith('http') ? link : 'https://dereja.com' + link,
                        });
                    }
                });
            }
        }
        catch (e) {
            console.log('Dereja scrape:', e.message);
        }
    }
    // Fallback curated jobs if scraping returned nothing
    if (jobs.length === 0) {
        jobs.push({ title: 'AI/ML Engineer', company: 'Ethiopian AI Institute', location: 'Addis Ababa', url: 'https://www.ethiojobs.net' }, { title: 'Full Stack Developer', company: 'Safaricom Ethiopia', location: 'Addis Ababa', url: 'https://www.ethiojobs.net' }, { title: 'Python Developer', company: 'Multiple Companies', location: 'Remote / Addis Ababa', url: 'https://dereja.com' }, { title: 'Data Scientist', company: 'Commercial Bank of Ethiopia', location: 'Addis Ababa', url: 'https://www.ethiojobs.net' }, { title: 'Freelance AI Trainer', company: 'Upwork / Fiverr', location: 'Remote', url: 'https://www.upwork.com' }, { title: 'React Native Developer', company: 'Gebeya Inc.', location: 'Addis Ababa', url: 'https://dereja.com' }, { title: 'Cloud Engineer', company: 'Raxio Data Centre', location: 'Addis Ababa', url: 'https://www.ethiojobs.net' });
    }
    const msg = '💼 <b>Ethiopian Tech Jobs</b>\n\n' +
        jobs.slice(0, 8).map(j => `<b>${j.title}</b>\n🏢 ${j.company}\n📍 ${j.location}\n🔗 ${j.url}`).join('\n\n');
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
        await ctx.reply('📝 No messages yet. Send me something!');
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
        if (uid)
            await saveMsg(uid, 'user', '🎤 ' + text);
        await ctx.sendChatAction('typing');
        const reply = await aiReply(text);
        if (uid)
            await saveMsg(uid, 'assistant', reply);
        await ctx.reply(reply);
    }
    catch (e) {
        console.error('Voice error:', e.message);
        await ctx.reply('❌ Could not transcribe. Try again.');
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
    }
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
// ============================================
// Voice Handler
// ============================================
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
// ============================================
// Start
// ============================================
const port = parseInt(process.env.PORT || '10000');
(0, http_1.createServer)((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200).end('OK');
        return;
    }
    res.writeHead(200).end('GETEDIL-OS-BOT');
}).listen(port, () => console.log('🏥 Health :' + port));
console.log('🤖 Starting polling mode...');
bot.launch({
    dropPendingUpdates: true,
    allowedUpdates: ['message', 'callback_query']
}).then(() => {
    console.log('✅ Polling connected');
}).catch(() => {
    console.log('⚠️ Polling error, retrying in 5s...');
    setTimeout(() => bot.launch({ dropPendingUpdates: true }), 5000);
});
console.log('✅ Bot polling for messages...');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
//# sourceMappingURL=app.js.map