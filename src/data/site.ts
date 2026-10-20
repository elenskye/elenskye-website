export type Locale = 'zh' | 'en';
export type PageKey = 'wander' | 'career' | 'now' | 'about';

export const discoveryPaths: Record<'search' | 'rss', Record<Locale, string>> = {
  search: { zh: '/search/', en: '/en/search/' },
  rss: { zh: '/rss.xml', en: '/en/rss.xml' },
};

export const localeConfig = {
  zh: {
    lang: 'zh-CN',
    label: '中文',
    languageTooltip: '切换语言',
    themeToggleLabel: '切换颜色模式',
    footerHeading: '笔者最近在做什么？',
    browseLabel: '浏览',
  },
  en: {
    lang: 'en',
    label: 'English',
    languageTooltip: 'Change Language',
    themeToggleLabel: 'Toggle color mode',
    footerHeading: 'Want to stay up to date?',
    browseLabel: 'Browse',
  },
} as const;

export const pagePaths: Record<PageKey, Record<Locale, string>> = {
  wander: {
    zh: '/',
    en: '/en/',
  },
  career: {
    zh: '/career/',
    en: '/en/career/',
  },
  now: {
    zh: '/now/',
    en: '/en/now/',
  },
  about: {
    zh: '/about/',
    en: '/en/about/',
  },
};

// Social links and the Wander taxonomy are stored as JSON so the Keystatic
// admin (/keystatic during `npm run dev`) can edit them. Restart the dev
// server after editing the taxonomy so the admin's dropdown options refresh.
import socialLinksData from './social-links.json';
import taxonomyData from './wander-taxonomy.json';

export const socialLinks: Array<{ key: string; label: string; href: string }> = socialLinksData.links;

// Wander taxonomy, confirmed by the owner on 2026-07-09. Every card carries
// exactly one Category and one or more Topics. Topics are a growing list
// (scrollable row); Categories are the fixed kinds (dropdown with counts).
// Formal Category pages are future post-launch work in ROADMAP.md.
export interface WanderTerm {
  slug: string;
  label: Record<Locale, string>;
}

export const wanderCategories: WanderTerm[] = taxonomyData.categories.map((item) => ({
  slug: item.slug,
  label: { zh: item.zh, en: item.en },
}));

export const wanderTopics: WanderTerm[] = taxonomyData.topics.map((item) => ({
  slug: item.slug,
  label: { zh: item.zh, en: item.en },
}));

export type WanderCategorySlug = string;
export type WanderTopicSlug = string;

export const filterBarCopy: Record<
  Locale,
  { topics: string; category: string; allCategories: string; selectedSuffix: string }
> = {
  zh: { topics: '话题', category: '类别', allCategories: '全部类别', selectedSuffix: ' 类已选' },
  en: { topics: 'Topics', category: 'Category', allCategories: 'All Categories', selectedSuffix: ' selected' },
};

export const navItems: Record<Locale, Array<{ key: PageKey; label: string; href: string }>> = {
  zh: [
    { key: 'wander', label: '呦呦漫游', href: pagePaths.wander.zh },
    { key: 'career', label: '职业', href: pagePaths.career.zh },
    { key: 'now', label: '当下', href: pagePaths.now.zh },
    { key: 'about', label: '关于我', href: pagePaths.about.zh },
  ],
  en: [
    { key: 'wander', label: 'Wander', href: pagePaths.wander.en },
    { key: 'career', label: 'Career', href: pagePaths.career.en },
    { key: 'now', label: 'Now', href: pagePaths.now.en },
    { key: 'about', label: 'About', href: pagePaths.about.en },
  ],
};

export const pageCopy = {
  zh: {
    wander: {
      eyebrow: 'Wander',
      title: '呦呦漫游',
      description: '这里收纳写作、项目、画作和一些我想要做出的探索',
    },
    career: {
      eyebrow: 'Career',
      title: '职业',
      description:
        '重庆大学（985）本科，新加坡国立大学系统分析研究生（GDipSA, NUS-ISS），机器学习与全栈软件工程并行：设计并评测过多个深度学习模型，也以 Java/Spring Boot/ReactJS 交付生产级系统',
    },
    now: {
      eyebrow: 'Now',
      title: '当下',
      description: '不定期更新的日志，记录我近期的阅读、探索和思考',
    },
    about: {
      eyebrow: 'About',
      title: '雷天佑',
      description: '小画家，胡思乱写者，敲代码的',
    },
    search: {
      eyebrow: 'Search',
      title: '站内搜索',
      description: '搜索本站内容',
    },
  },
  en: {
    wander: {
      eyebrow: 'Wander',
      title: 'Wander',
      description: 'A home for writing, projects, artwork, and the explorations I want to make',
    },
    career: {
      eyebrow: 'Career',
      title: 'Career',
      description:
        'Chongqing University undergraduate and GDipSA (NUS-ISS) student combining machine learning with full-stack software engineering — from benchmarked deep-learning models to production systems in Java/Spring Boot/ReactJS',
    },
    now: {
      eyebrow: 'Now',
      title: 'Now',
      description: 'An irregularly updated log of my recent reading, explorations, and thinking',
    },
    about: {
      eyebrow: 'About',
      title: 'Elen Skye',
      description: 'Painter, writer and mediocre developer',
    },
    search: {
      eyebrow: 'Search',
      title: 'Search',
      description: 'Search this site',
    },
  },
} as const;

export function getAlternateLocale(locale: Locale): Locale {
  return locale === 'zh' ? 'en' : 'zh';
}

export function getAlternatePath(pageKey: PageKey, locale: Locale): string {
  return pagePaths[pageKey][getAlternateLocale(locale)];
}

export function getPagePath(pageKey: PageKey, locale: Locale): string {
  return pagePaths[pageKey][locale];
}
