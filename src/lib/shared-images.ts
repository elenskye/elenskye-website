interface ImageAssetRecord {
  title: string;
  asset: {
    discriminant: 'image' | 'existingImage';
    value: {
      file?: string;
      alt?: string;
    };
  };
}

export interface SharedImageAsset {
  slug: string;
  src: string;
  alt: string;
}

const assetModules = import.meta.glob<{ default: ImageAssetRecord }>(
  '../data/assets/images/*.json',
  { eager: true }
);

function toPublicUrl(record: ImageAssetRecord): string | undefined {
  const file = record.asset?.value?.file;
  if (!file) return undefined;
  if (file.startsWith('public/')) return `/${file.slice('public/'.length)}`;
  if (file.startsWith('/')) return file;
  return record.asset.discriminant === 'image' ? `/assets/images/${file}` : `/${file}`;
}

const sharedImages = new Map<string, SharedImageAsset>();

for (const module of Object.values(assetModules)) {
  const record = module.default;
  const src = toPublicUrl(record);
  if (!record?.title || !src) continue;
  sharedImages.set(record.title, {
    slug: record.title,
    src,
    alt: record.asset.value.alt ?? '',
  });
}

export function getSharedImage(slug: string): SharedImageAsset | undefined {
  return sharedImages.get(slug);
}

