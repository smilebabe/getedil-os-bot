export { loadConfig } from './config.js';
export type { AppConfig } from './config.js';
export { getSupabase, saveConversation, getRecentConversations, upsertUserProfile, getTotalMessages, markModuleComplete, getCourseProgress, getCompletedCourses } from './supabase.js';

console.log('@getedil/core loaded');
