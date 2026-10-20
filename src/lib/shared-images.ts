import { toPublicAssetUrl } from './gallery.js';

interface ImageAssetRecord {
  title: string;
  asset: {
    discriminant: 'existingImage';
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

const sharedImages = new Map<string, SharedImageAsset>();

for (const module of Object.values(assetModules)) {
  const record = module.default;
  const src = toPublicAssetUrl(record.asset?.value?.file);
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

