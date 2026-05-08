import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface ModuleInfo {
  id: string;
  title: { en: string; am: string };
  order: number;
}

export interface CourseMetadata {
  id: string;
  title: { en: string; am: string };
  description: { en: string; am: string };
  difficulty: string;
  estimatedHours: number;
  modules: ModuleInfo[];
}

export interface ModuleContent {
  moduleId: string;
  courseId: string;
  markdown: string;
}

export class CourseManager {
  private courses: Map<string, CourseMetadata> = new Map();
  private content: Map<string, string> = new Map();

  constructor(private contentPath: string = './content/courses') {
    this.loadCourses();
  }

  private loadCourses(): void {
    try {
      const dirs = readdirSync(this.contentPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const dir of dirs) {
        const metaPath = join(this.contentPath, dir, 'metadata.json');
        if (existsSync(metaPath)) {
          const meta: CourseMetadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
          this.courses.set(meta.id, meta);

          // Load module content
          for (const mod of meta.modules) {
            const modPath = join(this.contentPath, dir, `${mod.id}.md`);
            if (existsSync(modPath)) {
              const content = readFileSync(modPath, 'utf-8');
              this.content.set(`${meta.id}/${mod.id}`, content);
            }
          }
        }
      }
      console.log(`📚 Loaded ${this.courses.size} courses with ${this.content.size} modules`);
    } catch (e: any) {
      console.error('Failed to load courses:', e.message);
    }
  }

  getCourses(): CourseMetadata[] {
    return Array.from(this.courses.values());
  }

  getCourse(courseId: string): CourseMetadata | null {
    return this.courses.get(courseId) || null;
  }

  getModule(courseId: string, moduleId: string): ModuleContent | null {
    const course = this.courses.get(courseId);
    if (!course) return null;
    const mod = course.modules.find(m => m.id === moduleId);
    if (!mod) return null;
    const content = this.content.get(`${courseId}/${moduleId}`);
    if (!content) return null;
    return { moduleId, courseId, markdown: content };
  }

  getNextModule(courseId: string, currentModuleId: string): ModuleInfo | null {
    const course = this.courses.get(courseId);
    if (!course) return null;
    const sorted = [...course.modules].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(m => m.id === currentModuleId);
    if (idx < 0 || idx >= sorted.length - 1) return null;
    return sorted[idx + 1]!;
  }

  formatCourseList(locale: 'en' | 'am' = 'en'): string {
    const courses = this.getCourses();
    if (!courses.length) return '📚 No courses available yet.';

    let msg = '📚 <b>Available Courses</b>\n\n';
    for (const c of courses) {
      msg += `<b>${c.title[locale]}</b>\n`;
      msg += `${c.description[locale].slice(0, 100)}...\n`;
      msg += `⏱ ${c.estimatedHours}h | 📊 ${c.difficulty}\n`;
      msg += `📋 ${c.modules.length} modules\n`;
      msg += `👉 /learn ${c.id}\n\n`;
    }
    return msg;
  }

  formatModuleMessage(content: ModuleContent, course: CourseMetadata, locale: 'en' | 'am' = 'en'): string {
    const mod = course.modules.find(m => m.id === content.moduleId);
    const next = this.getNextModule(course.id, content.moduleId);

    let msg = `📚 <b>${course.title[locale]}</b>\n`;
    msg += `📖 Module ${mod?.order || '?'}: <b>${mod?.title[locale] || content.moduleId}</b>\n\n`;
    msg += content.markdown.slice(0, 3500); // Telegram limit is 4096

    if (next) {
      msg += `\n\n➡️ <b>Next:</b> ${next.title[locale]}\n`;
      msg += `👉 /learn ${course.id} ${next.id}`;
    } else {
      msg += `\n\n🎉 <b>Course Complete!</b>\n`;
      msg += `🏆 Congratulations! You've finished ${course.title[locale]}.\n`;
      msg += `📜 Check /progress for your certificate.`;
    }

    return msg;
  }
}
