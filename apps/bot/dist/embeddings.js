"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEmbedding = generateEmbedding;
exports.seedContentEmbeddings = seedContentEmbeddings;
exports.indexUserMessage = indexUserMessage;
exports.searchContext = searchContext;
exports.getUserProfileContext = getUserProfileContext;
const transformers_1 = require("@xenova/transformers");
let embedder = null;
async function getEmbedder() {
    if (!embedder) {
        console.log('📥 Loading embedding model (first time may download ~80MB)...');
        embedder = await (0, transformers_1.pipeline)('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log('✅ Embedding model ready');
    }
    return embedder;
}
async function generateEmbedding(text) {
    const model = await getEmbedder();
    const result = await model(text, { pooling: 'mean', normalize: true });
    return Array.from(result.data);
}
async function seedContentEmbeddings(supabase) {
    const { data: existing } = await supabase.from('content_embeddings').select('id').limit(1);
    if (existing && existing.length > 0) {
        console.log('📚 Embeddings already seeded');
        return;
    }
    const content = [
        { type: 'course', title: 'AI Engineering 101', content: '5-module course: AI intro, prompt engineering, vector databases, LLM integration, building AI apps. Beginner-friendly. Amharic and English.', lang: 'en' },
        { type: 'lesson', title: 'Introduction to AI', content: 'AI teaches computers to think. Machine learning, deep learning, NLP. AI in Ethiopia: agriculture, healthcare, finance.', lang: 'en' },
        { type: 'lesson', title: 'Prompt Engineering', content: '4 elements: Role, Context, Task, Format. Chain-of-thought and few-shot prompting techniques.', lang: 'en' },
        { type: 'lesson', title: 'Vector Databases', content: 'Search by meaning using embeddings. Semantic search, RAG. Tools: Pinecone, Weaviate, pgvector.', lang: 'en' },
        { type: 'lesson', title: 'LLM Integration', content: 'Connect AI to apps. Choose models, get API keys, send prompts, build features.', lang: 'en' },
        { type: 'lesson', title: 'Building AI Apps', content: 'Final project module. Build real AI applications with everything learned.', lang: 'en' },
        { type: 'lesson', title: 'የAI መግቢያ', content: 'AI ምንድነው? ማሽን ለርኒንግ፣ ዲፕ ለርኒንግ እና NLP። AI በኢትዮጵያ።', lang: 'am' },
        { type: 'lesson', title: 'ፕሮምፕት ኢንጂነሪንግ', content: 'ጥሩ ፕሮምፕት አፃፃፍ። 4 አካላት፡ ሚና፣ አውድ፣ ተግባር፣ ቅርፀት።', lang: 'am' },
        { type: 'job', title: 'AI/ML Engineer', content: 'Ethiopian AI Institute. Addis Ababa. Full-time AI role.', lang: 'en' },
        { type: 'job', title: 'Full Stack Developer', content: 'Safaricom Ethiopia. Addis Ababa. Web and mobile development.', lang: 'en' },
        { type: 'job', title: 'Python Developer', content: 'Multiple companies. Remote or Addis Ababa. Contract Python work.', lang: 'en' },
        { type: 'job', title: 'Data Scientist', content: 'Commercial Bank of Ethiopia. Addis Ababa. Data analytics and ML.', lang: 'en' },
        { type: 'job', title: 'Freelance AI Trainer', content: 'Upwork and Fiverr. Remote. Train AI models.', lang: 'en' },
        { type: 'faq', title: "What is Get'Edil?", content: "Get'Edil (ጌት፟እድል) is a free AI learning platform for Ethiopian students with courses, voice transcription, and job listings.", lang: 'en' },
        { type: 'faq', title: "Is Get'Edil free?", content: "Yes, Get'Edil is completely free. No payments, no subscriptions, no ads.", lang: 'en' },
        { type: 'faq', title: 'What languages?', content: "Get'Edil speaks fluent Amharic and English. Voice notes work in both languages.", lang: 'en' },
        { type: 'faq', title: 'ጌት፟እድል ምንድነው?', content: 'ጌት፟እድል ለኢትዮጵያ ተማሪዎች ነፃ AI የትምህርት መድረክ ነው።', lang: 'am' },
        { type: 'faq', title: 'ስንት ያስከፍላል?', content: 'ጌት፟እድል ሙሉ በሙሉ ነፃ ነው።', lang: 'am' },
    ];
    console.log('📚 Seeding', content.length, 'embeddings...');
    for (const item of content) {
        try {
            const embedding = await generateEmbedding(item.content);
            await supabase.from('content_embeddings').insert({
                content_type: item.type,
                title: item.title,
                content: item.content,
                embedding,
                language: item.lang,
                metadata: {},
            });
            console.log('  ✅', item.title);
        }
        catch (e) {
            console.error('  ❌', item.title, e.message);
        }
    }
    console.log('📚 Content seeded!');
}
async function indexUserMessage(supabase, telegramId, role, content, topic = 'general') {
    try {
        const embedding = await generateEmbedding(content);
        await supabase.from('memory_embeddings').insert({
            telegram_id: telegramId,
            content: `${role}: ${content}`,
            embedding,
            topic,
        });
    }
    catch { }
}
async function searchContext(supabase, query, telegramId, limit = 4) {
    const results = [];
    try {
        const embedding = await generateEmbedding(query);
        const { data: contentMatches } = await supabase.rpc('match_content', {
            query_embedding: embedding, match_threshold: 0.3, match_count: limit,
        });
        if (contentMatches) {
            for (const m of contentMatches) {
                results.push(`📚 **${m.title}**\n${m.content.slice(0, 200)}`);
            }
        }
        if (telegramId) {
            const { data: memoryMatches } = await supabase.rpc('match_user_memory', {
                query_embedding: embedding, match_threshold: 0.3, match_count: 3, user_id: telegramId,
            });
            if (memoryMatches) {
                for (const m of memoryMatches) {
                    results.push(`🧠 **Your past**\n${m.content.slice(0, 200)}`);
                }
            }
        }
    }
    catch { }
    return results.length > 0 ? results.join('\n\n') : '';
}
async function getUserProfileContext(supabase, telegramId) {
    try {
        const { data: courses } = await supabase.from('course_progress')
            .select('course_id, module_id').eq('telegram_id', telegramId).eq('completed', true);
        const completedModules = courses?.length || 0;
        return `Completed ${completedModules} course modules.`;
    }
    catch {
        return '';
    }
}
//# sourceMappingURL=embeddings.js.map