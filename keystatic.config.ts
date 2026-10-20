import {
  collection,
  config,
  fields,
  singleton,
  type BasicFormField,
} from '@keystatic/core';
import { block } from '@keystatic/core/content-components';
import { createElement, useCallback, useEffect, useState } from 'react';
import taxonomy from './src/data/wander-taxonomy.json';
import { normalizeTaxonomyValue, normalizeTaxonomyValues } from './src/lib/wander-taxonomy.js';

// Local-mode admin: open /keystatic while `npm run dev` is running.
// Edits write straight to the working tree; commit/push stays manual.
// NOTE: after editing 话题与类别 (the taxonomy singleton), restart the dev
// server so the category/topic dropdown options below pick up the change.

// `import.meta.env` is required here: Astro/Vite bundles this config for the
// hosted API route and substitutes these values at build time.
const useGitHubStorage = import.meta.env.KEYSTATIC_STORAGE === 'github';
const githubRepo = import.meta.env.KEYSTATIC_GITHUB_REPO;

if (useGitHubStorage && !githubRepo) {
  throw new Error('KEYSTATIC_GITHUB_REPO is required in GitHub mode (owner/repository).');
}

const storage = useGitHubStorage
  ? {
      kind: 'github' as const,
      repo: githubRepo as `${string}/${string}`,
      // Hosted authoring uses reviewable content branches rather than
      // writing straight to the production branch.
      branchPrefix: 'content/',
    }
  : { kind: 'local' as const };

const categoryOptions = taxonomy.categories.map((item) => ({
  label: `${item.zh} / ${item.en}`,
  value: item.slug,
}));

const topicOptions = taxonomy.topics.map((item) => ({
  label: `${item.zh} / ${item.en}`,
  value: item.slug,
}));

const categorySlugs = categoryOptions.map((item) => item.value);
const topicSlugs = topicOptions.map((item) => item.value);

// Keystatic's built-in select fields reject a stored value that no longer
// exists in their options. Taxonomy terms are intentionally owner-editable,
// so normalize retired values to "unassigned" while keeping the familiar
// select/multiselect UI. This lets old works open, save, or be deleted after
// a term is removed. Display-name changes remain automatic because works
// store only the stable slug.
const tolerantCategoryField = () => {
  const field = fields.select({
    label: '类别（可留空）',
    description: '删除类别后，旧作品会自动变为“未分类”，不会失效。',
    options: [{ label: '未分类 / Uncategorised', value: '' }, ...categoryOptions],
    defaultValue: '',
  });
  const parse = (value: Parameters<typeof field.parse>[0]) => normalizeTaxonomyValue(value, categorySlugs);
  return { ...field, parse, reader: { parse } };
};

const tolerantTopicsField = () => {
  const field = fields.multiselect({
    label: '话题（可为零个或多个）',
    description: '删除话题后，旧作品会自动取消该标签；其他标签保留。',
    options: topicOptions,
  });
  const parse = (value: Parameters<typeof field.parse>[0]) => normalizeTaxonomyValues(value, topicSlugs);
  return { ...field, parse, reader: { parse } };
};

const imageExtensions = '{avif,gif,jpeg,jpg,png,svg,webp}';
const documentExtensions = '{7z,csv,doc,docx,epub,key,md,odt,pdf,ppt,pptx,rtf,txt,xls,xlsx,zip}';

// Reusable selectors intentionally scan content-resource directories only.
// Including a file extension removes folders from Keystatic's combobox;
// limiting the roots keeps site internals (favicon, robots, etc.) out.
const imageAssetPattern =
  `public/{assets/images,images/about,images/career,images/now,images/wander}/**/*.${imageExtensions}`;
const wanderImagePattern = `public/{assets/images,images/wander}/**/*.${imageExtensions}`;
const portraitImagePattern = `public/{assets/images,images/about/portraits}/**/*.${imageExtensions}`;
const artworkImagePattern = `public/{assets/images,images/about/artworks}/**/*.${imageExtensions}`;
const documentAssetPattern = `public/{assets/documents,cv}/**/*.${documentExtensions}`;
const resumeAssetPattern = (language: 'zh' | 'en') =>
  `public/cv/${language}/**/*.${documentExtensions}`;

const sharedImageComponent = block({
  label: '复用共享图片',
  description: '只选择已在「图片资源」中登记的图片；不会上传或复制文件。',
  schema: {
    image: fields.relationship({
      label: '共享图片',
      collection: 'imageAssets',
      validation: { isRequired: true },
      description: '下拉列表只包含已登记的图片资源，不包含文档。',
    }),
    alt: fields.text({
      label: '本次使用的图片描述（可选）',
      description: '留空时使用图片资源中登记的 Alt；仅在这篇文章需要不同描述时填写。',
      multiline: true,
    }),
  },
});

type AssetKind = 'image' | 'document';
type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; formatted: string }
  | { status: 'error'; message: string };

function currentResourceSlug(kind: AssetKind) {
  if (typeof window === 'undefined') return undefined;
  const collectionName = kind === 'image' ? 'imageAssets' : 'documentAssets';
  const marker = `/collection/${collectionName}/item/`;
  const markerIndex = window.location.pathname.indexOf(marker);
  if (markerIndex === -1) return undefined;
  const remainder = window.location.pathname.slice(markerIndex + marker.length);
  const slug = remainder.split('/')[0];
  return slug ? decodeURIComponent(slug) : undefined;
}

function AssetReferencePreview({ kind }: { kind: AssetKind }) {
  const [state, setState] = useState<PreviewState>({ status: 'loading' });

  const load = useCallback(async () => {
    const slug = currentResourceSlug(kind);
    if (!slug) {
      setState({ status: 'error', message: 'Save this resource first to generate its preview.' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const response = await fetch(
        `/__keystatic/asset-reference-preview?kind=${kind}&slug=${encodeURIComponent(slug)}`,
        { cache: 'no-store' }
      );
      const data = (await response.json()) as { formatted?: string; error?: string };
      if (!response.ok || !data.formatted) throw new Error(data.error || 'Reference scan failed.');
      setState({ status: 'ready', formatted: data.formatted });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Reference scan failed.',
      });
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const content =
    state.status === 'loading'
      ? 'Scanning references…'
      : state.status === 'ready'
        ? state.formatted
        : state.message;

  return createElement(
    'section',
    {
      style: {
        border: '1px solid color-mix(in srgb, currentColor 18%, transparent)',
        borderRadius: '10px',
        padding: '16px',
      },
    },
    createElement(
      'div',
      {
        style: {
          alignItems: 'center',
          display: 'flex',
          gap: '12px',
          justifyContent: 'space-between',
          marginBottom: '12px',
        },
      },
      createElement('strong', null, 'Deletion preview'),
      createElement(
        'button',
        {
          type: 'button',
          onClick: () => void load(),
          style: {
            background: 'transparent',
            border: '1px solid currentColor',
            borderRadius: '6px',
            color: 'inherit',
            cursor: 'pointer',
            font: 'inherit',
            padding: '5px 9px',
          },
        },
        'Refresh'
      )
    ),
    createElement(
      'pre',
      {
        'aria-live': 'polite',
        style: {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          lineHeight: 1.65,
          margin: 0,
          overflowWrap: 'anywhere',
          whiteSpace: 'pre-wrap',
        },
      },
      content
    ),
    createElement(
      'p',
      { style: { fontSize: '12px', margin: '10px 0 0', opacity: 0.7 } },
      'Read-only. Nothing is deleted until you confirm it manually.'
    )
  );
}

const assetReferencePreviewField = (kind: AssetKind): BasicFormField<null> => ({
  kind: 'form',
  Input: () => createElement(AssetReferencePreview, { kind }),
  defaultValue: () => null,
  parse: () => null,
  serialize: () => ({ value: undefined }),
  validate: () => null,
  reader: { parse: () => null },
});

const cvEntryArray = (label: string) =>
  fields.array(
    fields.object({
      period: fields.text({ label: '时间段' }),
      role: fields.text({ label: '角色 / 名称' }),
      org: fields.text({ label: '机构 / 项目' }),
      bullets: fields.array(fields.text({ label: '要点', multiline: true }), {
        label: '要点',
        itemLabel: (props) => props.value,
      }),
    }),
    { label, itemLabel: (props) => props.fields.role.value }
  );

const simpleCareerEntryArray = (label: string) =>
  fields.array(
    fields.object({
      heading: fields.text({ label: '小标题' }),
      items: fields.text({ label: '内容要点', multiline: true }),
    }),
    { label, itemLabel: (props) => props.fields.heading.value || '未命名内容' }
  );

const careerSchema = (language: 'zh' | 'en') => ({
  language: fields.select({
    label: '语言（请勿修改）',
    options: [
      { label: '中文', value: 'zh' },
      { label: 'English', value: 'en' },
    ],
    defaultValue: language,
  }),
  email: fields.text({ label: '联系邮箱' }),
  resumeDownloads: fields.array(
    fields.object({
      label: fields.text({
        label: language === 'zh' ? '中文界面上的接口文本' : 'English interface label',
        description:
          language === 'zh'
            ? '例如：下载中文 IT 简历'
            : 'For example: Download IT CV',
      }),
      file: fields.file({
        label: '上传 / 替换文件',
        description: '直接上传新文件；已有文件会在保存后替换。若资源已存在，请优先使用下面的复用字段。',
        directory: `public/cv/${language}`,
        publicPath: `/cv/${language}/`,
      }),
      fileRef: fields.pathReference({
        label: '复用已有文件（可选，优先）',
        description: `从 public/cv/${language}/ 中选择已有文档，不会重复复制；填写后优先于上面的上传文件。`,
        pattern: resumeAssetPattern(language),
      }),
    }),
    {
      label: language === 'zh' ? '中文简历下载接口' : 'English resume download links',
      description: '可新增、删除、排序；只有当前语言的职业页会显示这里的项目。接口文本和文件均可独立维护。',
      itemLabel: (props) => props.fields.label.value || '未命名简历接口',
    }
  ),
  summary: fields.text({
    label: language === 'zh' ? '页面开头摘要' : 'Page summary',
    description:
      language === 'zh'
        ? '显示在“职业”标题下方，同时用于本页的搜索与社交分享描述。'
        : 'Shown below the Career title and also used for this page’s search and social-sharing description.',
    multiline: true,
  }),
  sections: fields.array(
    fields.object({
      title: fields.text({
        label: language === 'zh' ? '模块标题' : 'Section title',
        description:
          language === 'zh'
            ? '例如：技能、项目、研究、工作经历。'
            : 'For example: Skills, Projects, Research, or Work Experience.',
      }),
      content: fields.conditional(
        fields.select({
          label: language === 'zh' ? '内容模式' : 'Content mode',
          description:
            language === 'zh'
              ? '切换模式会重置这个模块已填写的内容。'
              : 'Switching modes resets the content already entered in this section.',
          options: [
            {
              label: language === 'zh' ? '小标题 + 内容要点（类似技能）' : 'Subtitle + details (like Skills)',
              value: 'simple',
            },
            {
              label:
                language === 'zh'
                  ? '时间 + 角色 + 机构 + 内容要点（类似项目）'
                  : 'Period + role + organisation + bullet points (like Projects)',
              value: 'detailed',
            },
          ],
          defaultValue: 'detailed',
        }),
        {
          simple: simpleCareerEntryArray(language === 'zh' ? '内容' : 'Items'),
          detailed: cvEntryArray(language === 'zh' ? '条目' : 'Entries'),
        }
      ),
    }),
    {
      label: language === 'zh' ? '页面模块' : 'Page sections',
      description:
        language === 'zh'
          ? '可新增、删除和排序。删除模块会同时删除该模块下的全部内容；中文与英文页面需分别维护。'
          : 'Add, delete, or reorder sections. Deleting a section also deletes all content inside it; maintain each language separately.',
      itemLabel: (props) => props.fields.title.value || (language === 'zh' ? '未命名模块' : 'Untitled section'),
    }
  ),
  extra: fields.markdoc({
    label: '附加内容（渲染在 CV 下方）',
    extension: 'md',
    options: {
      image: {
        directory: 'public/images/career',
        publicPath: '/images/career/',
      },
    },
  }),
});

const aboutSchema = (language: 'zh' | 'en') => ({
  language: fields.select({
    label: '语言（请勿修改）',
    options: [
      { label: '中文', value: 'zh' },
      { label: 'English', value: 'en' },
    ],
    defaultValue: language,
  }),
  contextIntro: fields.text({
    label: '一点背景 · 引言（时间轴上方的正文；空行分段，纯文本）',
    multiline: true,
  }),
  timeline: fields.array(
    fields.object({
      role: fields.text({ label: '职位 / 身份' }),
      org: fields.text({ label: '公司 / 学校' }),
      period: fields.text({ label: '时间段' }),
      description: fields.text({ label: '一句话简介', multiline: true }),
    }),
    { label: '一点背景 · 时间轴', itemLabel: (props) => `${props.fields.role.value} · ${props.fields.org.value}` }
  ),
  story: fields.markdoc({
    label: '一点故事（正文）',
    extension: 'md',
    options: {
      image: {
        directory: 'public/images/about',
        publicPath: '/images/about/',
      },
    },
  }),
});

export default config({
  storage,
  ui: {
    brand: { name: '呦呦漫游' },
  },
  collections: {
    imageAssets: collection({
      label: '资源库 · 图片',
      slugField: 'title',
      path: 'src/data/assets/images/*',
      format: { data: 'json' },
      entryLayout: 'form',
      columns: ['title', 'usage'],
      schema: {
        title: fields.slug({
          name: { label: '资源名称' },
          slug: {
            label: '资源 slug',
            description: '使用简短英文与短横线，例如 profile-portrait；上传后尽量不要修改。',
          },
        }),
        asset: fields.conditional(
          fields.select({
            label: '资源来源与类型',
            options: [
              { label: '上传图片', value: 'image' },
              { label: '登记已有图片（不重复上传）', value: 'existingImage' },
            ],
            defaultValue: 'image',
          }),
          {
            image: fields.object({
              file: fields.image({
                label: '图片文件',
                directory: 'public/assets/images',
                publicPath: '/assets/images/',
                validation: { isRequired: true },
              }),
              alt: fields.text({
                label: '图片描述（Alt）',
                description: '说明图片中最重要的内容；纯装饰图片可以留空。',
                multiline: true,
              }),
            }),
            existingImage: fields.object({
              file: fields.pathReference({
                label: '已有图片文件',
                description:
                  '只显示共享资源与 About / Career / Now / Wander 目录中的图片文件；不显示文件夹或站点内部图片，也不会复制文件。',
                pattern: imageAssetPattern,
              }),
              alt: fields.text({
                label: '图片描述（Alt）',
                description: '说明图片中最重要的内容；纯装饰图片可以留空。',
                multiline: true,
              }),
            }),
          }
        ),
        usage: fields.text({
          label: '用途 / 使用位置',
          description: '例如：About 肖像、Wander 封面或正文；便于以后判断资源是否仍在使用。',
          multiline: true,
        }),
        deletionRequested: fields.checkbox({
          label: '加入待删除检查清单（不会自动删除）',
          description:
            '下方会直接显示最新引用；勾选并保存只会把它加入终端的批量预览清单。人工确认前请勿点击集合列表的垃圾桶。',
          defaultValue: false,
        }),
        ...(!useGitHubStorage ? { referencePreview: assetReferencePreviewField('image') } : {}),
      },
    }),
    documentAssets: collection({
      label: '资源库 · 文档',
      slugField: 'title',
      path: 'src/data/assets/documents/*',
      format: { data: 'json' },
      entryLayout: 'form',
      columns: ['title', 'usage'],
      schema: {
        title: fields.slug({
          name: { label: '资源名称' },
          slug: {
            label: '资源 slug',
            description: '使用简短英文与短横线；上传后尽量不要修改。',
          },
        }),
        asset: fields.conditional(
          fields.select({
            label: '资源来源与类型',
            options: [
              { label: '上传文档 / 压缩包', value: 'document' },
              { label: '登记已有文档（不重复上传）', value: 'existingDocument' },
            ],
            defaultValue: 'document',
          }),
          {
            document: fields.object({
              file: fields.file({
                label: '文档文件',
                directory: 'public/assets/documents',
                publicPath: '/assets/documents/',
                validation: { isRequired: true },
              }),
              description: fields.text({ label: '文档说明', multiline: true }),
            }),
            existingDocument: fields.object({
              file: fields.pathReference({
                label: '已有文档文件',
                description:
                  '只显示 public/assets/documents 与 public/cv 中的文档或压缩包；不显示文件夹，也不会复制文件。',
                pattern: documentAssetPattern,
              }),
              description: fields.text({ label: '文档说明', multiline: true }),
            }),
          }
        ),
        usage: fields.text({
          label: '用途 / 使用位置',
          description: '例如：Career 简历、公开资料；便于以后判断资源是否仍在使用。',
          multiline: true,
        }),
        deletionRequested: fields.checkbox({
          label: '加入待删除检查清单（不会自动删除）',
          description:
            '下方会直接显示最新引用；勾选并保存只会把它加入终端的批量预览清单。人工确认前请勿点击集合列表的垃圾桶。',
          defaultValue: false,
        }),
        ...(!useGitHubStorage ? { referencePreview: assetReferencePreviewField('document') } : {}),
      },
    }),
    wander: collection({
      label: 'Wander 作品',
      slugField: 'title',
      path: 'src/content/wander/*',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['title', 'category', 'language', 'month'],
      schema: {
        title: fields.slug({
          name: { label: '标题' },
          slug: {
            label: '文件名 slug',
            description: '结尾用 .zh 或 .en 标记语言，例如 big-fish.zh；同名 .zh/.en 视为同一作品的两个语言版本',
          },
        }),
        language: fields.select({
          label: '语言',
          options: [
            { label: '中文', value: 'zh' },
            { label: 'English', value: 'en' },
          ],
          defaultValue: 'zh',
        }),
        category: tolerantCategoryField(),
        topics: tolerantTopicsField(),
        month: fields.text({
          label: '年月',
          description: '只填年和月，格式为 YYYY-MM，例如 2025-05。',
          validation: {
            pattern: {
              regex: /^\d{4}-(0[1-9]|1[0-2])$/,
              message: '请使用 YYYY-MM 格式。',
            },
          },
        }),
        summary: fields.text({
          label: '摘要（一般留空即可：卡片会自动截取正文开头。仅当正文为空、或想覆盖自动摘要时才填写）',
          multiline: true,
        }),
        englishTitle: fields.text({
          label: '英文标题',
          description: '中文作品在英文页显示的标题；留空则沿用原标题',
        }),
        englishSummary: fields.text({
          label: '英文摘要',
          description: '仅中文作品需要：在英文页中转页（无英文全文时）显示的翻译摘要',
          multiline: true,
        }),
        thumbnail: fields.image({
          label: '上传新封面（可选）',
          description: '仅在这是此作品独有的新图片时上传；若图片已存在，请使用下面的「复用已有封面」。',
          directory: 'public/images/wander',
          publicPath: '/images/wander/',
        }),
        thumbnailRef: fields.pathReference({
          label: '复用已有封面（可选）',
          description:
            '从共享资源或各内容图片目录中选择一个已有图片文件，不会复制；优先级高于上面的新上传封面。',
          pattern: wanderImagePattern,
        }),
        gallery: fields.array(
          fields.object({
            image: fields.image({
              label: '上传新图片（可选）',
              description: '仅在这张图是此作品独有的新图片时上传；已有图片请用下面的复用字段。',
              directory: 'public/images/wander',
              publicPath: '/images/wander/',
            }),
            imageRef: fields.pathReference({
              label: '复用已有图片（可选，优先）',
              description: '从共享资源或各内容图片目录中选择已有图片，不会复制；填写后优先于上面的上传。',
              pattern: wanderImagePattern,
            }),
            alt: fields.text({
              label: '图片描述（Alt）',
              description: '说明画面中最重要的内容，供读屏软件与图片加载失败时使用。',
              multiline: true,
            }),
            caption: fields.text({
              label: '单张图注（可选）',
              description: '显示在这张图下方。整组作品集的说明请写在正文里，不要重复写在每张图上。',
              multiline: true,
            }),
          }),
          {
            label: '作品集图片（仅「画廊」类作品需要）',
            description:
              '填写后，详情页会在正文上方渲染一个灯箱：左右箭头切换、点击放大、键盘可操作。留空则按普通文章渲染。顺序即展示顺序，可拖动调整。',
            // Only string-valued fields here: an image field's value is an
            // upload object, not a path, so it cannot label the row.
            itemLabel: (props) => props.fields.alt.value || props.fields.imageRef.value || '未命名图片',
          }
        ),
        body: fields.markdoc({
          label: '正文',
          extension: 'md',
          components: {
            sharedImage: sharedImageComponent,
          },
          options: {
            image: {
              directory: 'public/images/wander',
              publicPath: '/images/wander/',
            },
          },
        }),
      },
    }),
    now: collection({
      label: 'Now 月度记录',
      slugField: 'title',
      path: 'src/content/now/*',
      format: { contentField: 'body' },
      entryLayout: 'content',
      columns: ['year', 'month', 'language'],
      schema: {
        title: fields.slug({
          name: { label: '条目名（仅后台显示）' },
          slug: { label: '文件名 slug', description: '建议 年-月.语言，例如 2026-07.zh' },
        }),
        language: fields.select({
          label: '语言',
          options: [
            { label: '中文', value: 'zh' },
            { label: 'English', value: 'en' },
          ],
          defaultValue: 'zh',
        }),
        year: fields.integer({ label: '年', validation: { min: 2000, max: 2100 } }),
        month: fields.integer({ label: '月', validation: { min: 1, max: 12 } }),
        body: fields.markdoc({
          label: '正文',
          extension: 'md',
          options: {
            image: {
              directory: 'public/images/now',
              publicPath: '/images/now/',
            },
          },
        }),
      },
    }),
  },
  singletons: {
    careerZh: singleton({
      label: '职业页 · 中文',
      path: 'src/content/career/zh',
      format: { contentField: 'extra' },
      entryLayout: 'form',
      schema: careerSchema('zh'),
    }),
    careerEn: singleton({
      label: '职业页 · English',
      path: 'src/content/career/en',
      format: { contentField: 'extra' },
      entryLayout: 'form',
      schema: careerSchema('en'),
    }),
    aboutZh: singleton({
      label: '关于我 · 中文',
      path: 'src/content/about/zh',
      format: { contentField: 'story' },
      entryLayout: 'form',
      schema: aboutSchema('zh'),
    }),
    aboutEn: singleton({
      label: '关于我 · English',
      path: 'src/content/about/en',
      format: { contentField: 'story' },
      entryLayout: 'form',
      schema: aboutSchema('en'),
    }),
    aboutImages: singleton({
      label: '关于我 · 图片',
      path: 'src/data/about-images',
      format: { data: 'json' },
      schema: {
        portraits: fields.array(
          fields.image({
            label: '肖像图片',
            directory: 'public/images/about/portraits',
            publicPath: '/images/about/portraits/',
          }),
          { label: '肖像（每次访问随机展示一张）' }
        ),
        artworks: fields.array(
          fields.image({
            label: '作品图片',
            directory: 'public/images/about/artworks',
            publicPath: '/images/about/artworks/',
          }),
          { label: '画作 / 摄影（箭头切换）' }
        ),
        portraitRefs: fields.array(
          fields.pathReference({
            label: '已有肖像图片',
            description: '选择已经存放在共享资源或内容图片目录中的图片文件；不会再复制一份。',
            pattern: portraitImagePattern,
          }),
          {
            label: '复用已有肖像图片（不重复上传）',
            description: '仅在图片已经存在时使用；与上面的直接上传肖像合并后，每次访问随机展示一张。',
          }
        ),
        artworkRefs: fields.array(
          fields.pathReference({
            label: '已有作品图片',
            description: '选择已经存放在共享资源或内容图片目录中的图片文件；不会再复制一份。',
            pattern: artworkImagePattern,
          }),
          {
            label: '复用已有画作 / 摄影（不重复上传）',
            description: '仅在图片已经存在时使用；与上面的直接上传作品合并后，通过页面箭头切换。',
          }
        ),
      },
    }),
    nowStatus: singleton({
      label: '当下 · 状态',
      path: 'src/data/now-status',
      format: { data: 'json' },
      schema: {
        zh: fields.text({ label: '中文状态（如：研究生在读 / 在职 / 求职中）' }),
        en: fields.text({ label: '英文状态（如：Graduate student / Open to work）' }),
      },
    }),
    taxonomy: singleton({
      label: '话题与类别',
      path: 'src/data/wander-taxonomy',
      format: { data: 'json' },
      schema: {
        categories: fields.array(
          fields.object({
            slug: fields.text({
              label: '稳定 ID（新增时填写，之后不要修改）',
              description: '重命名请只改下方中英文名；作品保存的是这个 ID，删除条目会自动取消标签。',
            }),
            zh: fields.text({ label: '中文名' }),
            en: fields.text({ label: '英文名' }),
          }),
          {
            label: '类别 Categories',
            itemLabel: (props) => `${props.fields.zh.value} / ${props.fields.en.value}`,
          }
        ),
        topics: fields.array(
          fields.object({
            slug: fields.text({
              label: '稳定 ID（新增时填写，之后不要修改）',
              description: '重命名请只改下方中英文名；作品保存的是这个 ID，删除条目会自动取消标签。',
            }),
            zh: fields.text({ label: '中文名' }),
            en: fields.text({ label: '英文名' }),
          }),
          {
            label: '话题 Topics',
            itemLabel: (props) => `${props.fields.zh.value} / ${props.fields.en.value}`,
          }
        ),
      },
    }),
    socialLinks: singleton({
      label: '外部链接',
      path: 'src/data/social-links',
      format: { data: 'json' },
      schema: {
        links: fields.array(
          fields.object({
            key: fields.text({
              label: '图标 key',
              description: '已有图标：github / linkedin / email；其他 key 暂用通用图标，新平台图标在 SiteFooter.astro 中添加',
            }),
            label: fields.text({ label: '名称（无障碍标签）' }),
            href: fields.text({ label: '链接（邮箱用 mailto: 开头）' }),
          }),
          {
            label: '底部栏外部链接',
            itemLabel: (props) => props.fields.label.value,
          }
        ),
      },
    }),
  },
});
