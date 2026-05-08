"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourseManager = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
var CourseManager = /** @class */ (function () {
    function CourseManager(contentPath) {
        if (contentPath === void 0) { contentPath = './content/courses'; }
        this.contentPath = contentPath;
        this.courses = new Map();
        this.content = new Map();
        this.loadCourses();
    }
    CourseManager.prototype.loadCourses = function () {
        try {
            var dirs = (0, fs_1.readdirSync)(this.contentPath, { withFileTypes: true })
                .filter(function (d) { return d.isDirectory(); })
                .map(function (d) { return d.name; });
            for (var _i = 0, dirs_1 = dirs; _i < dirs_1.length; _i++) {
                var dir = dirs_1[_i];
                var metaPath = (0, path_1.join)(this.contentPath, dir, 'metadata.json');
                if ((0, fs_1.existsSync)(metaPath)) {
                    var meta = JSON.parse((0, fs_1.readFileSync)(metaPath, 'utf-8'));
                    this.courses.set(meta.id, meta);
                    // Load module content
                    for (var _a = 0, _b = meta.modules; _a < _b.length; _a++) {
                        var mod = _b[_a];
                        var modPath = (0, path_1.join)(this.contentPath, dir, "".concat(mod.id, ".md"));
                        if ((0, fs_1.existsSync)(modPath)) {
                            var content = (0, fs_1.readFileSync)(modPath, 'utf-8');
                            this.content.set("".concat(meta.id, "/").concat(mod.id), content);
                        }
                    }
                }
            }
            console.log("\uD83D\uDCDA Loaded ".concat(this.courses.size, " courses with ").concat(this.content.size, " modules"));
        }
        catch (e) {
            console.error('Failed to load courses:', e.message);
        }
    };
    CourseManager.prototype.getCourses = function () {
        return Array.from(this.courses.values());
    };
    CourseManager.prototype.getCourse = function (courseId) {
        return this.courses.get(courseId) || null;
    };
    CourseManager.prototype.getModule = function (courseId, moduleId) {
        var course = this.courses.get(courseId);
        if (!course)
            return null;
        var mod = course.modules.find(function (m) { return m.id === moduleId; });
        if (!mod)
            return null;
        var content = this.content.get("".concat(courseId, "/").concat(moduleId));
        if (!content)
            return null;
        return { moduleId: moduleId, courseId: courseId, markdown: content };
    };
    CourseManager.prototype.getNextModule = function (courseId, currentModuleId) {
        var course = this.courses.get(courseId);
        if (!course)
            return null;
        var sorted = __spreadArray([], course.modules, true).sort(function (a, b) { return a.order - b.order; });
        var idx = sorted.findIndex(function (m) { return m.id === currentModuleId; });
        if (idx < 0 || idx >= sorted.length - 1)
            return null;
        return sorted[idx + 1];
    };
    CourseManager.prototype.formatCourseList = function (locale) {
        if (locale === void 0) { locale = 'en'; }
        var courses = this.getCourses();
        if (!courses.length)
            return '📚 No courses available yet.';
        var msg = '📚 <b>Available Courses</b>\n\n';
        for (var _i = 0, courses_1 = courses; _i < courses_1.length; _i++) {
            var c = courses_1[_i];
            msg += "<b>".concat(c.title[locale], "</b>\n");
            msg += "".concat(c.description[locale].slice(0, 100), "...\n");
            msg += "\u23F1 ".concat(c.estimatedHours, "h | \uD83D\uDCCA ").concat(c.difficulty, "\n");
            msg += "\uD83D\uDCCB ".concat(c.modules.length, " modules\n");
            msg += "\uD83D\uDC49 /learn ".concat(c.id, "\n\n");
        }
        return msg;
    };
    CourseManager.prototype.formatModuleMessage = function (content, course, locale) {
        if (locale === void 0) { locale = 'en'; }
        var mod = course.modules.find(function (m) { return m.id === content.moduleId; });
        var next = this.getNextModule(course.id, content.moduleId);
        var msg = "\uD83D\uDCDA <b>".concat(course.title[locale], "</b>\n");
        msg += "\uD83D\uDCD6 Module ".concat((mod === null || mod === void 0 ? void 0 : mod.order) || '?', ": <b>").concat((mod === null || mod === void 0 ? void 0 : mod.title[locale]) || content.moduleId, "</b>\n\n");
        msg += content.markdown.slice(0, 3500); // Telegram limit is 4096
        if (next) {
            msg += "\n\n\u27A1\uFE0F <b>Next:</b> ".concat(next.title[locale], "\n");
            msg += "\uD83D\uDC49 /learn ".concat(course.id, " ").concat(next.id);
        }
        else {
            msg += "\n\n\uD83C\uDF89 <b>Course Complete!</b>\n";
            msg += "\uD83C\uDFC6 Congratulations! You've finished ".concat(course.title[locale], ".\n");
            msg += "\uD83D\uDCDC Check /progress for your certificate.";
        }
        return msg;
    };
    return CourseManager;
}());
exports.CourseManager = CourseManager;
