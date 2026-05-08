import { Telegraf } from 'telegraf';

export class BotService {
  private bot: Telegraf;

  constructor(config: any, ai: any, transcriber: any) {
    this.bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

    this.bot.command('start', async (ctx) => {
      await ctx.reply('Welcome to <b>Getedil</b>! 🚀\n\n🎤 Voice | 💼 Jobs | 📚 Courses | 🧠 AI\n/help', { parse_mode: 'HTML' });
    });

    this.bot.command('help', async (ctx) => {
      await ctx.reply('<b>Commands</b>\n📚 /courses\n💼 /jobs\n📝 /memory\n📊 /progress\n/help', { parse_mode: 'HTML' });
    });

    this.bot.command('courses', async (ctx) => {
      await ctx.reply('📚 <b>Courses</b>\n\n<b>AI Engineering 101</b>\nLearn AI fundamentals, prompt engineering & LLMs.\n⏱ 20h | 📊 Beginner\n👉 /learn ai-engineering-101\n\n<b>Bot Development</b>\nBuild Telegram bots with Python & AI.\n⏱ 15h | 📊 Intermediate\n👉 /learn bot-development', { parse_mode: 'HTML' });
    });

    this.bot.command('learn', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1);
      if (!args.length) { await ctx.reply('Usage: /learn <course>\nTry /courses'); return; }

      const courseId = args[0]!;

      if (courseId === 'ai-engineering-101') {
        if (args[1] === 'intro' || !args[1]) {
          await ctx.reply(
            '📚 <b>AI Engineering 101</b>\n📖 Module 1: <b>Introduction to AI</b>\n\n' +
            '<b>What is AI?</b>\nArtificial Intelligence teaches computers to think like humans.\n\n' +
            '<b>Key Concepts:</b>\n• Machine Learning - learn from data\n• Deep Learning - neural networks\n• NLP - understand language\n\n' +
            '<b>Ethiopia & AI:</b>\n• Smart farming\n• Healthcare diagnostics\n• Tech sector jobs\n\n' +
            '➡️ <b>Next:</b> Prompt Engineering\n👉 /learn ai-engineering-101 prompt-engineering',
            { parse_mode: 'HTML' }
          );
        } else if (args[1] === 'prompt-engineering') {
          await ctx.reply(
            '📚 <b>AI Engineering 101</b>\n📖 Module 2: <b>Prompt Engineering</b>\n\n' +
            '<b>4 Elements of a Great Prompt:</b>\n1. Role - Tell AI who to be\n2. Context - Give background\n3. Task - Be specific\n4. Format - Specify output\n\n' +
            '<b>Example:</b>\n"You are a Python tutor. I\'m a beginner. Explain loops with Amharic examples."\n\n' +
            '➡️ <b>Next:</b> Vector Databases\n👉 /learn ai-engineering-101 vector-databases',
            { parse_mode: 'HTML' }
          );
        } else {
          await ctx.reply('Module not found. Try: /learn ai-engineering-101 intro', { parse_mode: 'HTML' });
        }
      } else if (courseId === 'bot-development') {
        await ctx.reply(
          '📚 <b>Bot Development</b>\n📖 Module 1: <b>Telegram Bot Basics</b>\n\n' +
          '<b>What You\'ll Learn:</b>\n• Create a bot with @BotFather\n• Handle commands & messages\n• Add keyboards & buttons\n• Connect to AI APIs\n\n' +
          '➡️ <b>Next:</b> Python Bots\n👉 /learn bot-development python-bots',
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.reply('Course not found. Try /courses');
      }
    });

    this.bot.command('jobs', async (ctx) => {
      await ctx.reply(
        '💼 <b>Job Listings</b>\n\n' +
        '<b>AI/ML Engineer</b>\n🏢 Ethiopian AI Institute\n📍 Addis Ababa | Full-time\n\n' +
        '<b>Full Stack Developer</b>\n🏢 Safaricom Ethiopia\n📍 Addis Ababa | Full-time\n\n' +
        '<b>Python Developer</b>\n🏢 Remote | Contract\n\n' +
        '<b>Freelance AI Trainer</b>\n🏢 Upwork/Fiverr | Remote\n\n' +
        'Try: /jobs ai | /jobs remote',
        { parse_mode: 'HTML' }
      );
    });

    this.bot.command('memory', async (ctx) => {
      await ctx.reply('📝 Memory requires Supabase. Configure SUPABASE_URL in .env');
    });

    this.bot.command('progress', async (ctx) => {
      await ctx.reply('📊 <b>Progress</b>\n\n💬 Messages: Active\n📚 Courses: Try /learn!\n\n🚀 Keep learning!', { parse_mode: 'HTML' });
    });

    this.bot.on('voice', async (ctx) => {
      await ctx.reply('🎤 Transcribing...');
      if (transcriber) {
        try {
          const url = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
          const { text } = await transcriber.transcribe(url.href);
          await ctx.reply(`📝 <i>"${text}"</i>\n🤖 Thinking...`, { parse_mode: 'HTML' });
          const reply = await ai.generateResponse(text);
          await ctx.reply(reply);
        } catch { await ctx.reply('❌ Failed.'); }
      }
    });

    this.bot.on('text', async (ctx) => {
      const msg = ctx.message.text;
      if (msg.startsWith('/')) return;
      await ctx.sendChatAction('typing');
      try {
        const reply = await ai.generateResponse(msg);
        await ctx.reply(reply);
      } catch { await ctx.reply('Error.'); }
    });

    this.bot.catch(async (err) => { console.error(err); });
  }

  async start(): Promise<void> { console.log('🤖 Starting...'); await this.bot.launch(); console.log('✅ Running'); }
  async stop(): Promise<void> { await this.bot.stop(); console.log('🛑 Stopped'); }
}
