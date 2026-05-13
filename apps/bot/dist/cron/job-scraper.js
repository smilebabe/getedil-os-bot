"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeAllJobs = scrapeAllJobs;
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const cheerio = __importStar(require("cheerio"));
const ws_1 = __importDefault(require("ws"));
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { realtime: { transport: ws_1.default }, auth: { persistSession: false } });
async function scrapeEthioJobs() {
    try {
        const res = await fetch('https://www.ethiojobs.net/search-results-jobs/?searchId=1715600.8959&action=search&page=1&listings_per_page=10&view=list');
        const html = await res.text();
        const $ = cheerio.load(html);
        const jobs = [];
        $('.job-item').each((_, el) => {
            const title = $(el).find('.job-title').text().trim();
            const company = $(el).find('.company-name').text().trim();
            const location = $(el).find('.job-location').text().trim() || 'Addis Ababa';
            if (title && company) {
                jobs.push({
                    title,
                    company,
                    location,
                    type: 'full-time',
                    url: 'https://www.ethiojobs.net' + $(el).find('a').attr('href'),
                    source: 'ethiojobs',
                    posted_at: new Date().toISOString()
                });
            }
        });
        console.log(`✅ EthioJobs: ${jobs.length} jobs`);
        return jobs;
    }
    catch (e) {
        console.error('❌ EthioJobs failed:', e);
        return [];
    }
}
async function scrapeRemoteOK() {
    try {
        const res = await fetch('https://remoteok.com/api?tags=ai,python,developer');
        const data = await res.json();
        const jobs = [];
        for (const item of data.slice(0, 10)) {
            if (item.position && item.company) {
                jobs.push({
                    title: item.position,
                    company: item.company,
                    location: item.location || 'Remote',
                    type: 'remote',
                    url: item.url || `https://remoteok.com/remote-jobs/${item.id}`,
                    source: 'remoteok',
                    posted_at: new Date(item.date || Date.now()).toISOString()
                });
            }
        }
        console.log(`✅ RemoteOK: ${jobs.length} jobs`);
        return jobs;
    }
    catch (e) {
        console.error('❌ RemoteOK failed:', e);
        return [];
    }
}
async function saveJobs(jobs) {
    if (jobs.length === 0)
        return;
    // Delete old jobs (keep last 50)
    await supabase.from('jobs').delete().lt('id', (await supabase.from('jobs').select('id').order('id', { ascending: false }).limit(50)).data?.[49]?.id || 0);
    // Insert new jobs
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
    const [ethioJobs, remoteJobs] = await Promise.all([
        scrapeEthioJobs(),
        scrapeRemoteOK()
    ]);
    await saveJobs([...ethioJobs, ...remoteJobs]);
    console.log('✅ Job scraping complete');
}
// Run if called directly
if (require.main === module) {
    scrapeAllJobs().then(() => process.exit(0));
}
//# sourceMappingURL=job-scraper.js.map