import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

function getAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  console.log('🔑 Supabase admin client created. Key:', key ? 'YES' : 'NO');
  adminClient = createClient(url, key, { auth: { persistSession: false } });
  return adminClient;
}

export function getSupabase(): SupabaseClient {
  return getAdmin();
}

export async function saveConversation(telegramId: number, role: 'user' | 'assistant', content: string, intent?: string, provider?: string) {
  const { error } = await getAdmin().from('conversation_history').insert({
    telegram_id: telegramId, role, content: content.slice(0, 4000),
    intent: intent || 'general', provider: provider || 'unknown',
  });
  if (error) console.error('❌ Save error:', error.message);
}

export async function getRecentConversations(telegramId: number, limit = 10): Promise<Array<{ role: string; content: string }>> {
  const { data, error } = await getAdmin()
    .from('conversation_history')
    .select('role, content')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { console.error('❌ Get error:', error.message); return []; }
  return (data || []).reverse();
}

export async function upsertUserProfile(telegramId: number, firstName: string, username?: string) {
  const { error } = await getAdmin().from('user_profiles').upsert({
    telegram_id: telegramId, first_name: firstName, username: username || null,
    last_active_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id' });
  if (error) console.error('❌ Profile error:', error.message);
}

export async function getTotalMessages(telegramId: number): Promise<number> {
  const { count, error } = await getAdmin()
    .from('conversation_history')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', telegramId);
  if (error) return 0;
  return count || 0;
}

export async function markModuleComplete(telegramId: number, courseId: string, moduleId: string) {
  const { error } = await getAdmin().from('course_progress').upsert({
    telegram_id: telegramId, course_id: courseId, module_id: moduleId,
    completed: true, completed_at: new Date().toISOString(),
  }, { onConflict: 'telegram_id, course_id, module_id' });
  if (error) console.error('❌ Progress error:', error.message);
}

export async function getCourseProgress(telegramId: number, courseId: string): Promise<string[]> {
  const { data, error } = await getAdmin()
    .from('course_progress')
    .select('module_id')
    .eq('telegram_id', telegramId)
    .eq('course_id', courseId)
    .eq('completed', true);
  if (error || !data) return [];
  return data.map((r: any) => r.module_id);
}

export async function getCompletedCourses(telegramId: number): Promise<Array<{ course_id: string; modules: number; total: number }>> {
  const { data, error } = await getAdmin().from('course_progress').select('course_id').eq('telegram_id', telegramId).eq('completed', true);
  if (error || !data) return [];
  const grouped: Record<string, number> = {};
  for (const r of data) grouped[r.course_id] = (grouped[r.course_id] || 0) + 1;
  return Object.entries(grouped).map(([course_id, modules]) => ({ course_id, modules, total: 0 }));
}
