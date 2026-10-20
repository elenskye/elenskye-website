import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// One pattern for all four collections. `npm run qa:workspace` is what keeps
// this honest: it fails on any file here that is not named
// `<slug>.zh.md` / `<slug>.en.md`, so a stray duplicate or backup is reported
// rather than silently turning into a page.
const CONTENT_PATTERN = '**/*.md';

const wander = defineCollection({
  loader: glob({ pattern: CONTENT_PATTERN, base: './src/content/wander' }),
  schema: z.object({
    title: z.string(),
    language: z.enum(['zh', 'en']),
    // NOTE: keep every field below tolerant of empty or half-filled values
    // (cleared selects and text). A schema-invalid file makes the dev content
    // sync fail silently and the site freezes on stale data.
    // Zero or one current Category per card. A retired taxonomy value is
    // tolerated here and normalized away at render time.
    category: z.string().default(''),
    // Zero or more current Topics per card (growing taxonomy; same JSON file).
    topics: z.array(z.string()).default([]),
    // Publication precision stops at the month. Invalid/cleared input
    // is treated as absent so one half-filled field cannot freeze content sync.
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional()
      .catch(undefined),
    // Optional: Chinese cards auto-excerpt the body; English cards use this.
    summary: z.string().optional(),
    // For Chinese-only pieces: translated title/summary shown on the English
    // wall and the English stub page. A full English twin file (same base
    // name, `.en` suffix) replaces the stub entirely.
    englishTitle: z.string().optional(),
    englishSummary: z.string().optional(),
    // Files are referenced from the library (public/assets/images/…).
    thumbnailRef: z.string().optional(),
    // Gallery works: an ordered image set rendered as a lightbox above the
    // body text. Empty for every other kind of work. Kept deliberately
    // tolerant — a half-filled row must not fail the schema, which would
    // silently freeze the whole dev content sync.
    gallery: z
      .array(
        z.object({
          imageRef: z.string().optional(),
          alt: z.string().optional(),
          caption: z.string().optional(),
        })
      )
      .default([]),
  }),
});

const now = defineCollection({
  loader: glob({ pattern: CONTENT_PATTERN, base: './src/content/now' }),
  schema: z.object({
    title: z.string().optional(),
    language: z.enum(['zh', 'en']),
    year: z.number(),
    month: z.number().min(1).max(12),
  }),
});

const cvEntry = z.object({
  period: z.string().default(''),
  role: z.string().default(''),
  org: z.string().default(''),
  bullets: z.array(z.string()).default([]),
});

const simpleCareerEntry = z.object({
  heading: z.string().default(''),
  items: z.string().default(''),
});

const careerSection = z.object({
  title: z.string().default(''),
  content: z.discriminatedUnion('discriminant', [
    z.object({
      discriminant: z.literal('simple'),
      value: z.array(simpleCareerEntry).default([]),
    }),
    z.object({
      discriminant: z.literal('detailed'),
      value: z.array(cvEntry).default([]),
    }),
  ]),
});

// A document of the library (public/assets/documents/…).
const resumeDownload = z.object({
  label: z.string().optional(),
  fileRef: z.string().optional(),
});

// One file per language (zh.md / en.md). Structured CV data lives in
// frontmatter; the markdown body is an optional extra section rendered
// under the structured CV when needed.
const career = defineCollection({
  loader: glob({ pattern: CONTENT_PATTERN, base: './src/content/career' }),
  schema: z.object({
    language: z.enum(['zh', 'en']),
    email: z.string(),
    resumeDownloads: z.array(resumeDownload).default([]),
    summary: z.string().default(''),
    sections: z.array(careerSection).default([]),
  }),
});

// One file per language (zh.md / en.md). The context intro and background
// timeline live in frontmatter; the markdown body is the
// "一点故事 / A LITTLE HISTORY" prose. The pictures (library references) live in
// src/data/about-images.json.
const about = defineCollection({
  loader: glob({ pattern: CONTENT_PATTERN, base: './src/content/about' }),
  schema: z.object({
    language: z.enum(['zh', 'en']),
    // Plain paragraphs shown above the timeline (blank line = new paragraph).
    contextIntro: z.string().optional(),
    // Maggie-style three-part entries: role @ org, period, short description.
    timeline: z
      .array(
        z.object({
          role: z.string(),
          org: z.string(),
          period: z.string(),
          description: z.string().optional(),
        })
      )
      .default([]),
  }),
});

export const collections = { wander, now, career, about };
