import { GoogleGenerativeAI } from '@google/generative-ai';

export class VoiceTranscriber {
  private gemini: GoogleGenerativeAI;

  constructor() {
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  async transcribe(fileUrl: string): Promise<{ text: string; language: string }> {
    try {
      // Download the voice file from Telegram using the full URL
      console.log('📥 Downloading voice from:', fileUrl);
      
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString('base64');

      console.log('📥 Downloaded:', (buffer.length / 1024).toFixed(1), 'KB');

      // Send to Gemini for transcription
      const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = 'Transcribe this audio message. If it is in Amharic, output Amharic text in Ge\'ez script. If it is in English, output English text. Only output the transcription, nothing else.';

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: 'audio/ogg',
            data: base64,
          },
        },
      ]);

      const text = result.response.text().trim();
      const isAmharic = /[\u1200-\u137F]/.test(text);
      
      return { text, language: isAmharic ? 'am' : 'en' };
    } catch (error: any) {
      console.error('❌ Transcription error:', error.message);
      throw new Error('Failed to transcribe voice message.');
    }
  }
}
