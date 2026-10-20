import { isWanderCardVisible } from '../lib/wander-filter.js';

type FilterState = {
  topic: string | null;
  categories: Set<string>;
  expanded: boolean;
};

const layoutWanderWall = () => {
  document.querySelectorAll<HTMLElement>('.wander-wall').forEach((wall) => {
    const styles = window.getComputedStyle(wall);
    const columnCount = styles.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
    if (columnCount <= 1) {
      wall.querySelectorAll<HTMLElement>('.wander-card').forEach((card) => {
        card.style.removeProperty('grid-row-end');
      });
      return;
    }
    const rowHeight = Number.parseFloat(styles.getPropertyValue('grid-auto-rows')) || 4;
    const rowGap = Number.parseFloat(styles.getPropertyValue('row-gap')) || 0;

    wall.querySelectorAll<HTMLElement>('.wander-card').forEach((card) => {
      if (card.hidden) return;
      card.style.gridRowEnd = 'span 1';
      const cardHeight = card.scrollHeight;
      const span = Math.ceil((cardHeight + rowGap) / (rowHeight + rowGap));
      card.style.gridRowEnd = `span ${span}`;
    });
  });
};

let wanderMasonryTimer: number | undefined;
const scheduleWanderLayout = () => {
  window.clearTimeout(wanderMasonryTimer);
  wanderMasonryTimer = window.setTimeout(layoutWanderWall, 80);
};

const setupWanderWall = () => {
  const wall = document.querySelector<HTMLElement>('.wander-wall');
  if (!wall) return;
  if (wall.dataset.wanderReady === 'true') {
    layoutWanderWall();
    return;
  }
  wall.dataset.wanderReady = 'true';

  document.querySelectorAll<HTMLButtonElement>('[data-topic-scroll]').forEach((arrow) => {
    arrow.addEventListener('click', () => {
      const track = arrow.parentElement?.querySelector<HTMLElement>('[data-topic-track]');
      if (!track) return;
      const direction = Number(arrow.dataset.topicScroll) || 1;
      track.scrollBy({ left: direction * Math.max(160, track.clientWidth * 0.7) });
    });
  });

  const expandButton = document.querySelector<HTMLButtonElement>('[data-expand-wall]');
  const expandContainer = expandButton?.parentElement;
  const state: FilterState = {
    topic: null,
    categories: new Set<string>(),
    expanded: !expandButton,
  };
  const cards = document.querySelectorAll<HTMLElement>('.wander-wall .wander-card');
  const emptyNote = document.querySelector<HTMLElement>('[data-filter-empty]');

  const applyFilter = () => {
    let visible = 0;
    cards.forEach((card) => {
      card.hidden = !isWanderCardVisible(
        {
          topics: (card.dataset.topics || '').split(',').filter(Boolean),
          category: card.dataset.category || '',
          overflow: card.dataset.overflow === 'true',
        },
        state
      );
      if (!card.hidden) visible += 1;
    });

    const hasActiveFilters = Boolean(state.topic) || state.categories.size > 0;
    if (expandContainer) expandContainer.hidden = state.expanded || hasActiveFilters;
    if (emptyNote) emptyNote.hidden = visible > 0;
    layoutWanderWall();
  };

  expandButton?.addEventListener('click', () => {
    state.expanded = true;
    applyFilter();
  });

  document.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const next = state.topic === chip.dataset.topic ? null : (chip.dataset.topic ?? null);
      state.topic = next;
      document.querySelectorAll<HTMLButtonElement>('.topic-chip').forEach((other) => {
        other.setAttribute('aria-pressed', other.dataset.topic === next ? 'true' : 'false');
      });
      applyFilter();
    });
  });

  document.querySelectorAll<HTMLElement>('.filter-category').forEach((root) => {
    const toggle = root.querySelector<HTMLButtonElement>('.category-toggle');
    const label = root.querySelector<HTMLElement>('.category-toggle-label');
    const panel = root.querySelector<HTMLElement>('.category-panel');
    const boxes = root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const clearButton = root.querySelector<HTMLButtonElement>('.category-clear');
    if (!toggle || !label || !panel || !clearButton) return;

    const close = (restoreFocus = false) => {
      root.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
      if (restoreFocus) toggle.focus();
    };

    toggle.addEventListener('click', () => {
      const open = Boolean(panel.hidden);
      root.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    });

    document.addEventListener('click', (event) => {
      if (event.target instanceof Node && !root.contains(event.target)) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) close(true);
    });

    const syncLabel = () => {
      label.textContent =
        state.categories.size === 0
          ? root.dataset.allLabel || ''
          : `${state.categories.size}${root.dataset.selectedSuffix || ''}`;
    };

    boxes.forEach((box) => {
      box.addEventListener('change', () => {
        if (box.checked) state.categories.add(box.value);
        else state.categories.delete(box.value);
        syncLabel();
        applyFilter();
      });
    });

    clearButton.addEventListener('click', () => {
      state.categories.clear();
      boxes.forEach((box) => {
        box.checked = false;
      });
      syncLabel();
      applyFilter();
    });
  });

  document.querySelectorAll<HTMLImageElement>('.wander-card img').forEach((image) => {
    const markMissing = () => {
      const card = image.closest<HTMLElement>('.wander-card');
      if (!card) return;
      card.classList.add('has-missing-image', 'wander-card--plain');
      card.classList.remove('wander-card--image');
      scheduleWanderLayout();
    };
    image.addEventListener('error', markMissing, { once: true });
    if (image.complete && image.naturalWidth === 0) markMissing();
    if (!image.complete) image.addEventListener('load', layoutWanderWall, { once: true });
  });

  applyFilter();
};

window.addEventListener('load', layoutWanderWall);
window.addEventListener('resize', scheduleWanderLayout);
document.addEventListener('astro:page-load', setupWanderWall);
setupWanderWall();
