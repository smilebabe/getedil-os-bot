export declare function generateEmbedding(text: string): Promise<number[]>;
export declare function seedContentEmbeddings(supabase: any): Promise<void>;
export declare function indexUserMessage(supabase: any, telegramId: number, role: string, content: string, topic?: string): Promise<void>;
export declare function searchContext(supabase: any, query: string, telegramId?: number, limit?: number): Promise<string>;
export declare function getUserProfileContext(supabase: any, telegramId: number): Promise<string>;
//# sourceMappingURL=embeddings.d.ts.map