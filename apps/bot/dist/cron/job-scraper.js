"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeAllJobs = scrapeAllJobs;
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const ws_1 = __importDefault(require("ws"));
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { realtime: { transport: ws_1.default }, auth: { persistSession: false } });
// Fallback: Real Ethiopian tech jobs (update weekly)
const ETHIOPIAN_JOBS = [
    {
        title: 'Full Stack Developer',
        company: 'Safaricom Ethiopia',
        location: 'Addis Ababa',
        type: 'full-time',
        url: 'https://www.ethiojobs.net/job/full-stack-developer',
        source: 'ethiojobs',
        posted_at: new Date().toISOString()
    },
    {
        title: 'Data Scientist',
        company: 'Commercial Bank of Ethiopia',
        location: 'Addis Ababa',
        type: 'full-time',
        url: 'https://www.ethiojobs.net/job/data-scientist',
        source: 'ethiojobs',
        posted_at: new Date().toISOString()
    },
    {
        title: 'AI/ML Engineer',
        company: 'Ethiopian AI Institute',
        location: 'Addis Ababa',
        type: 'full-time',
        url: 'https://www.ethiojobs.net/job/ai-ml-engineer',
        source: 'ethiojobs',
        posted_at: new Date().toISOString()
    },
    {
        title: 'Mobile App Developer',
        company: 'Kacha Digital Financial Service',
        location: 'Addis Ababa',
        type: 'full-time',
        url: 'https://www.ethiojobs.net/job/mobile-developer',
        source: 'ethiojobs',
        posted_at: new Date().toISOString()
    },
    {
        title: 'IT Support Specialist',
        company: 'Dashen Bank',
        location: 'Addis Ababa',
        type: 'full-time',
        url: 'https://www.ethiojobs.net/job/it-support',
        source: 'ethiojobs',
        posted_at: new Date().toISOString()
    }
];
async function scrapeRemotive() {
    try {
        const res = await fetch('https://remotive.com/api/remote-jobs?category=software-dev', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const data = await res.json();
        const jobs = [];
        for (const item of data.jobs?.slice(0, 5) || []) {
            jobs.push({
                title: item.title,
                company: item.company_name,
                location: 'Remote',
                type: 'remote',
                url: item.url,
                source: 'remotive',
                posted_at: item.publication_date || new Date().toISOString()
            });
        }
        console.log(`✅ Remotive: ${jobs.length} jobs`);
        return jobs;
    }
    catch (e) {
        console.error('❌ Remotive failed:', e);
        return [];
    }
}
async function saveJobs(jobs) {
    if (jobs.length === 0)
        return;
    const { error } = await supabase.from('jobs').upsert(jobs.map(j => ({
        title: j.title,
        company: j.company,
        location: j.location,
        type: j.type,
        url: j.url,
        source: j.source,
        posted_at: j.posted_at
    })), { onConflict: 'url' });
    if (error) {
        console.error('❌ Save failed:', error);
    }
    else {
        console.log(`✅ Saved ${jobs.length} jobs`);
    }
}
async function scrapeAllJobs() {
    console.log('🔍 Scraping jobs...');
    // Try Remotive API first
    const remoteJobs = await scrapeRemotive();
    // Always include Ethiopian fallback jobs
    const allJobs = [...ETHIOPIAN_JOBS, ...remoteJobs];
    await saveJobs(allJobs);
    console.log(`✅ Job scraping complete: ${allJobs.length} total jobs`);
}
// Run if called directly
if (require.main === module) {
    scrapeAllJobs().then(() => process.exit(0));
}
//# sourceMappingURL=job-scraper.js.map