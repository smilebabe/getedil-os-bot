import { GoogleGenerativeAI } from '@google/generative-ai';

const geminiEmbedder = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = geminiEmbedder.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export async function seedContentEmbeddings(supabase: any) {
  const { data: existing } = await supabase.from('content_embeddings').select('id').limit(1);
  if (existing && existing.length > 0) return;

  const content = [
    { type: 'course', title: 'AI Engineering 101', content: '5-module course: AI intro, prompt engineering, vector databases, LLM integration, building AI apps. Beginner-friendly.', lang: 'en' },
    { type: 'lesson', title: 'Introduction to AI', content: 'AI teaches computers to think. Machine learning, deep learning, NLP. AI in Ethiopia: agriculture, healthcare, finance.', lang: 'en' },
    { type: 'lesson', title: 'Prompt Engineering', content: '4 elements: Role, Context, Task, Format. Chain-of-thought and few-shot prompting.', lang: 'en' },
    { type: 'lesson', title: 'Vector Databases', content: 'Search by meaning using embeddings. Semantic search, RAG. Tools: Pinecone, Weaviate, pgvector.', lang: 'en' },
    { type: 'lesson', title: 'LLM Integration', content: 'Connect AI to apps. Choose models, get API keys, send prompts, build features.', lang: 'en' },
    { type: 'lesson', title: 'Building AI Apps', content: 'Final project module. Build real AI applications.', lang: 'en' },
    { type: 'lesson', title: 'የAI መግቢያ', content: 'AI ምንድነው? ማሽን ለርኒንግ፣ ዲፕ ለርኒንግ እና NLP። AI በኢትዮጵያ።', lang: 'am' },
    { type: 'lesson', title: 'ፕሮምፕት ኢንጂነሪንግ', content: 'ጥሩ ፕሮምፕት አፃፃፍ። 4 አካላት፡ ሚና፣ አውድ፣ ተግባር፣ ቅርፀት።', lang: 'am' },
    { type: 'job', title: 'AI/ML Engineer', content: 'Ethiopian AI Institute. Addis Ababa. Full-time AI role.', lang: 'en' },
    { type: 'job', title: 'Full Stack Developer', content: 'Safaricom Ethiopia. Addis Ababa. Web and mobile development.', lang: 'en' },
    { type: 'job', title: 'Python Developer', content: 'Multiple companies. Remote or Addis Ababa. Contract Python work.', lang: 'en' },
    { type: 'job', title: 'Data Scientist', content: 'Commercial Bank of Ethiopia. Addis Ababa. Data analytics and ML.', lang: 'en' },
    { type: 'job', title: 'Freelance AI Trainer', content: 'Upwork and Fiverr. Remote. Train AI models.', lang: 'en' },
    { type: 'faq', title: 'What is Getedil?', content: 'Getedil is a free AI learning platform for Ethiopian students with courses, voice transcription, and job listings.', lang: 'en' },
    { type: 'faq', title: 'Is Getedil free?', content: 'Yes, Getedil is completely free. No payments, no subscriptions, no ads.', lang: 'en' },
    { type: 'faq', title: 'What languages?', content: 'Getedil speaks fluent Amharic and English. Voice notes work in both languages.', lang: 'en' },
    { type: 'faq', title: 'ገተድል ምንድነው?', content: 'ገተድል ለኢትዮጵያ ተማሪዎች ነፃ AI የትምህርት መድረክ ነው።', lang: 'am' },
    { type: 'faq', title: 'ስንት ያስከፍላል?', content: 'ገተድል ሙሉ በሙሉ ነፃ ነው።', lang: 'am' },
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
    } catch (e: any) {
      console.error('  ❌', item.title, e.message);
    }
  }
  console.log('📚 Content seeded!');
}

export async function indexUserMessage(supabase: any, telegramId: number, role: string, content: string, topic: string = 'general') {
  try {
    const embedding = await generateEmbedding(content);
    await supabase.from('memory_embeddings').insert({
      telegram_id: telegramId,
      content: `${role}: ${content}`,
      embedding,
      topic,
    });
  } catch {}
}

export async function searchContext(supabase: any, query: string, telegramId?: number, limit: number = 4): Promise<string> {
  const results: string[] = [];
  try {
    const embedding = await generateEmbedding(query);
    const { data: contentMatches } = await supabase.rpc('match_content', {
      query_embedding: embedding, match_threshold: 0.4, match_count: limit,
    });
    if (contentMatches) {
      for (const m of contentMatches) {
        results.push(`📚 **${m.title}**\n${m.content.slice(0, 200)}`);
      }
    }
    if (telegramId) {
      const { data: memoryMatches } = await supabase.rpc('match_user_memory', {
        query_embedding: embedding, match_threshold: 0.4, match_count: 3, user_id: telegramId,
      });
      if (memoryMatches) {
        for (const m of memoryMatches) {
          results.push(`🧠 **Your past**\n${m.content.slice(0, 200)}`);
        }
      }
    }
  } catch {}
  return results.length > 0 ? results.join('\n\n') : '';
}

export async function getUserProfileContext(supabase: any, telegramId: number): Promise<string> {
  try {
    const { data: courses } = await supabase.from('course_progress')
      .select('course_id, module_id').eq('telegram_id', telegramId).eq('completed', true);
    const { data: topics } = await supabase.from('memory_embeddings')
      .select('topic').eq('telegram_id', telegramId).order('created_at', { ascending: false }).limit(20);
    const completedModules = courses?.length || 0;
    const topicList = topics ? [...new Set(topics.map((t: any) => t.topic))].slice(0, 5) : [];
    return `Completed ${completedModules} course modules. Topics: ${topicList.join(', ') || 'general'}.`;
  } catch {
    return '';
  }
}
