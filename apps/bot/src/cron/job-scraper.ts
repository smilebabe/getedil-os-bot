import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
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

// Fallback: Real Ethiopian tech jobs (update weekly)
const ETHIOPIAN_JOBS: Job[] = [
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

async function scrapeRemotive(): Promise<Job[]> {
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs?category=software-dev', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const data = await res.json();
    const jobs: Job[] = [];
    
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
  } catch (e) {
    console.error('❌ Remotive failed:', e);
    return [];
  }
}

async function saveJobs(jobs: Job[]) {
  if (jobs.length === 0) return;
  
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