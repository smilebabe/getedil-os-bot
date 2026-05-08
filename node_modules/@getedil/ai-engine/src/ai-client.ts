import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

type Provider = 'gemini' | 'groq' | 'huggingface' | 'mistral' | 'cerebras' | 'kimi';
interface MC { provider: Provider; model: string; endpoint: string; headers: Record<string,string>; maxTokens: number; }

export class AIClient {
  private gemini: GoogleGenerativeAI;
  private groq: Groq;
  constructor() {
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
  }

  async generateResponse(msg: string): Promise<string> {
    const intent = this.detect(msg);
    const cfg = this.route(intent);
    console.log('🎯', intent, '→', cfg.provider, cfg.model);
    return this.callWithFallback(cfg, msg, intent);
  }

  private detect(m: string): string {
    if (/[\u1200-\u137F]/.test(m) && !/\b(code|python|function|yazewel|tshaf|program|website|app|array|reverse)\b/.test(m.toLowerCase())) return 'amharic';
    const lo = m.toLowerCase();
    if (/\b(code|python|function|algorithm|debug|write a|implement|program|javascript|typescript|react|node|api|sql|html|css|json|array|loop|class|object|method|string|integer|reverse|sort|filter|map|reduce|app|website|server|database|endpoint|yazewel|megelz|tshaf|sera)\b/.test(lo)) return 'code';
    if (/\b(math|calculate|equation|solve|logic|proof|formula|compute)\b/.test(lo)) return 'reasoning';
    if (/\b(explain in detail|comprehensive|deep dive|analyze|neural|how does|how do|means|definition|concept|what is|what are|who is|tell me about|talked about|earlier|before|remember)\b/.test(lo) || m.length > 200) return 'deep';
    return 'general';
  }

  private route(intent: string): MC {
    const gk = process.env.GEMINI_API_KEY;
    const grok = process.env.GROQ_API_KEY;
    const mk = process.env.MISTRAL_API_KEY;
    const ck = process.env.CEREBRAS_API_KEY;
    const cfk = process.env.CF_API_TOKEN;
    const cfid = process.env.CF_ACCOUNT_ID;

    if (intent === 'amharic' && gk) return { provider:'gemini', model:'gemini-2.5-flash', endpoint:'', headers:{}, maxTokens:800 };
    if (intent === 'amharic' && grok) return this.groqMC('llama-3.3-70b-versatile',800);
    if ((intent==='code'||intent==='reasoning') && grok) return this.groqMC('llama-3.3-70b-versatile',1000);
    if ((intent==='code'||intent==='reasoning') && cfk && cfid) return this.kimiMC(cfid,cfk,1000);
    if (intent==='deep' && grok) return this.groqMC('llama-3.3-70b-versatile',1000);
    if (intent==='deep' && ck) return this.cbMC(ck,1000);
    if (grok) return this.groqMC('llama-3.3-70b-versatile',600);
    if (mk) return this.mc('mistral','mistral-large-latest',mk,600);
    return this.groqMC('llama-3.3-70b-versatile',600);
  }

  private mc(p:Provider, model:string, key:string, maxT:number): MC {
    const eps: Record<string,string> = { mistral:'https://api.mistral.ai/v1/chat/completions' };
    return { provider:p, model, endpoint:eps[p]||'', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'}, maxTokens:maxT };
  }
  private groqMC(m:string, t:number): MC { return { provider:'groq', model:m, endpoint:'', headers:{}, maxTokens:t }; }
  private kimiMC(aid:string, tok:string, t:number): MC { return { provider:'kimi', model:'@cf/moonshotai/kimi-k2.6', endpoint:`https://api.cloudflare.com/client/v4/accounts/${aid}/ai/run/@cf/moonshotai/kimi-k2.6`, headers:{'Authorization':`Bearer ${tok}`,'Content-Type':'application/json'}, maxTokens:t }; }
  private cbMC(key:string, t:number): MC { return { provider:'cerebras', model:'llama3.3-70b', endpoint:'https://api.cerebras.ai/v1/chat/completions', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'}, maxTokens:t }; }

  private async callWithFallback(cfg:MC, msg:string, intent:string): Promise<string> {
    const sys = this.sp(intent);
    try { return await this.callProvider(cfg, sys, msg); }
    catch(e:any) {
      console.warn('⚠️', cfg.provider, 'failed:', e.message?.slice(0,80));
      try {
        console.log('🔄 Fallback → groq');
        return await this.callGrq(this.groqMC('llama-3.3-70b-versatile',500), sys, msg);
      } catch { return 'Sorry, all AI services are temporarily unavailable.'; }
    }
  }

  private async callProvider(cfg:MC, s:string, u:string): Promise<string> {
    if (cfg.provider==='gemini') return this.callGem(cfg,s,u);
    if (cfg.provider==='groq') return this.callGrq(cfg,s,u);
    if (cfg.provider==='kimi') return this.callCF(cfg,s,u);
    return this.callOAI(cfg,s,u);
  }

  private async callGem(c:MC, s:string, u:string): Promise<string> {
    const m = this.gemini.getGenerativeModel({ model:c.model });
    const r = await m.generateContent({ contents:[{ role:'user', parts:[{ text:`${s}\n\nStudent: ${u}` }] }], generationConfig:{ maxOutputTokens:c.maxTokens, temperature:0.7 } });
    return r.response.text();
  }
  private async callGrq(c:MC, s:string, u:string): Promise<string> {
    const r = await this.groq.chat.completions.create({ model:c.model, messages:[{ role:'system', content:s }, { role:'user', content:u }], max_tokens:c.maxTokens, temperature:0.7 });
    return r.choices[0]?.message?.content || '';
  }
  private async callOAI(c:MC, s:string, u:string): Promise<string> {
    const r = await fetch(c.endpoint, { method:'POST', headers:c.headers, body:JSON.stringify({ model:c.model, messages:[{ role:'system', content:s }, { role:'user', content:u }], max_tokens:c.maxTokens, temperature:0.7 }) });
    if (!r.ok) throw new Error(`${c.provider} ${r.status}`);
    const d = await r.json() as any;
    return d.choices?.[0]?.message?.content || '';
  }
  private async callCF(c:MC, s:string, u:string): Promise<string> {
    const r = await fetch(c.endpoint, { method:'POST', headers:c.headers, body:JSON.stringify({ messages:[{ role:'system', content:s }, { role:'user', content:u }], max_tokens:c.maxTokens }) });
    if (!r.ok) throw new Error(`Kimi ${r.status}`);
    const d = await r.json() as any;
    if (!d.success) throw new Error(d.errors?.[0]?.message||'Kimi');
    return d.result?.response || '';
  }

  private sp(intent:string): string {
    const b = 'You are Getedil, an AI tutor for Ethiopian students learning AI and software development.';
    const p: Record<string,string> = {
      amharic: `${b} Speak fluent Amharic using Ge'ez script. Be warm.`,
      code: `${b} Expert programmer. Write clean code with comments.`,
      reasoning: `${b} Think step by step.`,
      deep: `${b} You have access to recent conversation context. Use it to give relevant, contextual responses. Refer to what was discussed earlier.`,
      general: `${b} Be helpful, concise, under 300 words.`,
    };
    return p[intent] || p.general!;
  }
}
