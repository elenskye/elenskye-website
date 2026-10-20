import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keystatic content bridge: convert the custom syntax used by the editor
// into ordinary mdast nodes that Astro's Markdown renderer understands.
// The editor saves tables in Markdoc syntax:
//
//   {% table %}
//   - Header A
//   - Header B
//   ---
//   - Cell 1
//   - Cell 2
//   {% /table %}
//
// Astro's remark pipeline doesn't know Markdoc tags, so without help these
// render as literal text plus stray lists. This plugin rewrites such blocks
// into standard mdast tables (first row = header), while leaving ordinary
// pipe tables untouched. Malformed blocks are left as-is rather than dropped.

function isTagParagraph(node, tag) {
  return (
    node?.type === 'paragraph' &&
    node.children?.length === 1 &&
    node.children[0].type === 'text' &&
    node.children[0].value.trim() === tag
  );
}

function buildTable(nodes) {
  const groups = [[]];
  for (const node of nodes) {
    if (node.type === 'thematicBreak') {
      groups.push([]);
    } else {
      groups[groups.length - 1].push(node);
    }
  }

  const rows = [];
  for (const group of groups) {
    if (group.length !== 1 || group[0].type !== 'list') return null;
    const cells = group[0].children.map((item) => ({
      type: 'tableCell',
      children: item.children.flatMap((child) =>
        child.type === 'paragraph' ? child.children : [child]
      ),
    }));
    rows.push({ type: 'tableRow', children: cells });
  }

  if (rows.length === 0) return null;
  return { type: 'table', align: rows[0].children.map(() => null), children: rows };
}

// Without a blank line before {% /table %}, markdown swallows the closing
// tag into the last list item as a lazy continuation line — so also look for
// it at the tail of a node's last text.
const CLOSE_TAG = /\s*\{%\s*\/table\s*%\}\s*$/;
const SHARED_IMAGE_TAG = /^\s*\{%\s*sharedImage\b([\s\S]*?)\/%\}\s*$/;
const imageRegistryDirectory = fileURLToPath(new URL('../data/assets/images/', import.meta.url));

function toPublicUrl(record) {
  const file = record?.asset?.value?.file;
  if (!file) return undefined;
  if (file.startsWith('public/')) return `/${file.slice('public/'.length)}`;
  if (file.startsWith('/')) return file;
  return record.asset.discriminant === 'image' ? `/assets/images/${file}` : `/${file}`;
}

function loadSharedImages() {
  const registry = new Map();
  let filenames = [];
  try {
    filenames = readdirSync(imageRegistryDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') return registry;
    throw error;
  }

  for (const filename of filenames) {
    if (extname(filename) !== '.json') continue;
    const record = JSON.parse(readFileSync(join(imageRegistryDirectory, filename), 'utf8'));
    const src = toPublicUrl(record);
    if (!record?.title || !src) continue;
    registry.set(record.title, { src, alt: record.asset?.value?.alt ?? '' });
  }
  return registry;
}

function decodeAttribute(value) {
  if (!value) return '';
  if (value.startsWith('"')) return JSON.parse(value);
  return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([A-Za-z][\w-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  for (const match of source.matchAll(pattern)) attributes[match[1]] = decodeAttribute(match[2]);
  return attributes;
}

function sharedImageNode(node, registry) {
  if (
    node?.type !== 'paragraph' ||
    node.children?.length !== 1 ||
    node.children[0].type !== 'text'
  ) {
    return undefined;
  }

  const tag = SHARED_IMAGE_TAG.exec(node.children[0].value);
  if (!tag) return undefined;
  const attributes = parseAttributes(tag[1]);
  const asset = registry.get(attributes.image);
  if (!asset) {
    // A registry entry may be retired independently from an article. Keep
    // the article buildable and omit only the missing image; the dedicated
    // admin-reference QA reports the stale slug with its source location.
    return { type: 'html', value: '' };
  }
  return {
    type: 'paragraph',
    children: [
      {
        type: 'image',
        url: asset.src,
        alt: attributes.alt || asset.alt,
        title: null,
      },
    ],
  };
}

function lastTextNode(node) {
  let current = node;
  while (current && Array.isArray(current.children) && current.children.length > 0) {
    current = current.children[current.children.length - 1];
  }
  return current && current.type === 'text' ? current : null;
}

function transform(node, sharedImages) {
  if (!Array.isArray(node.children)) return;

  const result = [];
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];

    const image = sharedImageNode(child, sharedImages);
    if (image) {
      result.push(image);
      continue;
    }

    if (isTagParagraph(child, '{% table %}')) {
      let closeIndex = -1;
      let closeInsideLastNode = false;
      for (let j = i + 1; j < node.children.length; j++) {
        const candidate = node.children[j];
        if (isTagParagraph(candidate, '{% /table %}')) {
          closeIndex = j;
          break;
        }
        const tail = lastTextNode(candidate);
        if (tail && CLOSE_TAG.test(tail.value)) {
          closeIndex = j;
          closeInsideLastNode = true;
          break;
        }
      }

      if (closeIndex !== -1) {
        let restore;
        if (closeInsideLastNode) {
          const tail = lastTextNode(node.children[closeIndex]);
          restore = { tail, value: tail.value };
          tail.value = tail.value.replace(CLOSE_TAG, '');
        }
        const between = node.children.slice(i + 1, closeInsideLastNode ? closeIndex + 1 : closeIndex);
        const table = buildTable(between);
        if (table) {
          result.push(table);
          i = closeIndex;
          continue;
        }
        if (restore) restore.tail.value = restore.value;
      }
    }

    transform(child, sharedImages);
    result.push(child);
  }

  node.children = result;
}

export default function remarkMarkdocTable() {
  return (tree) => {
    transform(tree, loadSharedImages());
  };
}
