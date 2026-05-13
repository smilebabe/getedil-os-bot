"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyTips = sendDailyTips;
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const generative_ai_1 = require("@google/generative-ai");
const ws_1 = __importDefault(require("ws"));
const gemini = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { realtime: { transport: ws_1.default }, auth: { persistSession: false } });
const TIP_TOPICS = [
    'AI prompt engineering tip',
    'Python best practice',
    'Machine learning concept',
    'Career advice for Ethiopian tech',
    'New AI tool or library',
    'Debugging technique',
    'Code optimization',
    'Ethiopian tech news',
    'Freelancing tip',
    'Interview preparation'
];
async function generateTip() {
    const topic = TIP_TOPICS[Math.floor(Math.random() * TIP_TOPICS.length)];
    try {
        const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({
            contents: [{
                    role: 'user',
                    parts: [{
                            text: `You are Gete, an AI tutor for Ethiopian students learning tech. 
Generate a short, practical daily learning tip about: ${topic}
Keep it under 150 words. Make it actionable and encouraging.
Include an emoji at the start.`
                        }]
                }]
        });
        return result.response.text();
    }
    catch {
        // Fallback tips if AI fails
        const fallbacks = [
            '💡 **Tip:** Use specific prompts with AI. Instead of "help me code", say "Write a Python function to filter a list of dictionaries by a key value".',
            '🐍 **Tip:** In Python, use list comprehensions instead of for-loops for cleaner code: `[x*2 for x in numbers]` instead of a loop.',
            '🤖 **Tip:** When debugging AI output, ask it to explain its reasoning step by step. This helps you understand AND fix errors.',
            '💼 **Tip:** Build a portfolio with 3 solid projects before applying for jobs. Employers care more about what you built than certificates.',
            '⚡ **Tip:** Use `async/await` instead of callbacks in JavaScript. Your code will be readable and maintainable.'
        ];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}
async function sendDailyTips() {
    console.log('🌅 Starting daily tips...');
    // Get all active users (messaged in last 7 days)
    const { data: users } = await supabase
        .from('user_profiles')
        .select('telegram_id')
        .gte('last_active_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    if (!users || users.length === 0) {
        console.log('No active users found');
        return;
    }
    console.log(`📨 Sending tips to ${users.length} users...`);
    const tip = await generateTip();
    // Send via Telegram Bot API directly
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
        console.error('No bot token');
        return;
    }
    let sent = 0;
    let failed = 0;
    for (const user of users) {
        try {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: user.telegram_id,
                    text: `📚 <b>Daily Learning Tip</b>\n\n${tip}\n\n<i>Reply to chat with Gete</i>`,
                    parse_mode: 'HTML'
                })
            });
            sent++;
            // Rate limit: max 30 messages/second
            if (sent % 30 === 0) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        catch {
            failed++;
        }
    }
    console.log(`✅ Sent: ${sent}, Failed: ${failed}`);
    // Log to database
    await supabase.from('daily_tips').insert({
        tip,
        recipients_count: sent,
        failed_count: failed,
        sent_at: new Date().toISOString()
    });
}
// Run if called directly
if (require.main === module) {
    sendDailyTips().then(() => process.exit(0)).catch(() => process.exit(1));
}
//# sourceMappingURL=daily-tip.js.map