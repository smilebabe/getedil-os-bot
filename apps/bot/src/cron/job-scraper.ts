import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import WebSocket from 'ws';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { realtime: { transport: WebSocket as any }, auth: { persistSession: false } }
);

interface Job {
  title: string;
  company: string;
  location: string;
  type: 'full-time' | 'remote' | 'freelance';
  url: string;
  source: string;
  posted_at: string;
}

async function scrapeEthioJobs(): Promise<Job[]> {
  try {
    const res = await fetch('https://www.ethiojobs.net/search-results-jobs/?searchId=1715600.8959&action=search&page=1&listings_per_page=10&view=list');
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const jobs: Job[] = [];
    
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
  } catch (e) {
    console.error('❌ EthioJobs failed:', e);
    return [];
  }
}

async function scrapeRemoteOK(): Promise<Job[]> {
  try {
    const res = await fetch('https://remoteok.com/api?tags=ai,python,developer');
    const data = await res.json();
    
    const jobs: Job[] = [];
    
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
  } catch (e) {
    console.error('❌ RemoteOK failed:', e);
    return [];
  }
}

async function saveJobs(jobs: Job[]) {
  if (jobs.length === 0) return;
  
  // Delete old jobs (keep last 50)
  await supabase.from('jobs').delete().lt('id', 
    (await supabase.from('jobs').select('id').order('id', { ascending: false }).limit(50)).data?.[49]?.id || 0
  );
  
  // Insert new jobs
  const { error } = await supabase.from('jobs').upsert(
    jobs.map(j => ({
      title: j.title,
      company: j.company,
      location: j.location,
      type: j.type,
      url: j.url,
      source: j.source,
      posted_at: j.posted_at
    })),
    { onConflict: 'url' }
  );
  
  if (error) {
    console.error('❌ Save failed:', error);
  } else {
    console.log(`✅ Saved ${jobs.length} jobs`);
  }
}

export async function scrapeAllJobs() {
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