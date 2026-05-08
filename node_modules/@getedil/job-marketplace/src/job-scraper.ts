export interface JobListing {
  title: string;
  company: string;
  location: string;
  type: string;
  category: string;
  postedDate: string;
  applyUrl: string;
  source: string;
}

export class JobScraper {
  private cache: Map<string, { jobs: JobListing[]; timestamp: number }> = new Map();
  private CACHE_TTL = 30 * 60 * 1000;

  async getJobs(source: string = 'all', query: string = 'all', limit: number = 10): Promise<JobListing[]> {
    const cacheKey = `${source}-${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) return cached.jobs.slice(0, limit);

    let jobs: JobListing[] = [...this.getCuratedTechJobs()];

    if (query !== 'all') {
      const q = query.toLowerCase();
      jobs = jobs.filter(j =>
        j.title.toLowerCase().includes(q) || j.category.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q) || j.type.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q)
      );
    }

    jobs.sort((a, b) => b.postedDate.localeCompare(a.postedDate));
    this.cache.set(cacheKey, { jobs, timestamp: Date.now() });
    return jobs.slice(0, limit);
  }

  private getCuratedTechJobs(): JobListing[] {
    const today = new Date().toISOString().split('T')[0]!;
    return [
      { title: 'AI/ML Engineer', company: 'Ethiopian AI Institute', location: 'Addis Ababa', type: 'Full-time', category: 'AI & Machine Learning', postedDate: today, applyUrl: 'https://www.ethiojobs.net', source: 'curated' },
      { title: 'Full Stack Developer', company: 'Safaricom Ethiopia', location: 'Addis Ababa', type: 'Full-time', category: 'Software Development', postedDate: today, applyUrl: 'https://www.ethiojobs.net', source: 'curated' },
      { title: 'Data Scientist', company: 'Commercial Bank of Ethiopia', location: 'Addis Ababa', type: 'Full-time', category: 'Data Science', postedDate: today, applyUrl: 'https://www.ethiojobs.net', source: 'curated' },
      { title: 'Python Developer', company: 'Multiple Companies', location: 'Remote / Addis Ababa', type: 'Contract', category: 'Software Development', postedDate: today, applyUrl: 'https://dereja.com', source: 'curated' },
      { title: 'Freelance AI Trainer', company: 'Upwork / Fiverr', location: 'Remote', type: 'Freelance', category: 'AI & Machine Learning', postedDate: today, applyUrl: 'https://www.upwork.com', source: 'curated' },
      { title: 'React Native Developer', company: 'Tech Startup Ethiopia', location: 'Remote', type: 'Contract', category: 'Software Development', postedDate: today, applyUrl: 'https://dereja.com', source: 'curated' },
      { title: 'Cloud Engineer', company: 'AWS Ethiopia', location: 'Addis Ababa', type: 'Full-time', category: 'IT & Networking', postedDate: today, applyUrl: 'https://www.ethiojobs.net', source: 'curated' },
    ];
  }

  formatJobsMessage(jobs: JobListing[], page: number = 1): string {
    if (!jobs.length) return '💼 No jobs found.\n\nTry: /jobs ai | /jobs python | /jobs remote';
    const start = (page - 1) * 5;
    const pageJobs = jobs.slice(start, start + 5);
    let msg = `💼 <b>Job Listings</b> (${jobs.length} found)\n\n`;
    for (const job of pageJobs) {
      msg += `<b>${job.title}</b>\n🏢 ${job.company}\n📍 ${job.location} | 🏷 ${job.type}\n📂 ${job.category} | 📡 ${job.source}\n🔗 ${job.applyUrl}\n\n`;
    }
    msg += 'Try: /jobs ai | /jobs python | /jobs remote';
    return msg;
  }
}
