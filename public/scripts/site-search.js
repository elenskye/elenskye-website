const roots = document.querySelectorAll('[data-search-root]');

for (const root of roots) {
  const form = root.querySelector('[data-search-form]');
  const input = root.querySelector('[data-search-input]');
  const status = root.querySelector('[data-search-status]');
  const emptyVisual = root.querySelector('[data-search-empty-visual]');
  const results = root.querySelector('[data-search-results]');
  const fallbackSource = root.querySelector('[data-search-documents]');
  if (!form || !input || !status || !emptyVisual || !results || !fallbackSource) continue;

  let fallbackDocuments = [];
  try {
    fallbackDocuments = JSON.parse(fallbackSource.textContent ?? '[]');
  } catch {
    fallbackDocuments = [];
  }

  let pagefindPromise;
  let timer;
  let requestId = 0;

  const text = (key, fallback = '') => root.dataset[key] ?? fallback;
  const loadPagefind = () => {
    if (root.dataset.pagefindReady !== 'true') {
      return Promise.reject(new Error('Pagefind is only generated for production builds.'));
    }
    pagefindPromise ??= (async () => {
      // Pagefind is generated after Astro's bundle step and loaded directly
      // by the browser from the same static origin.
      const pagefind = await import('/pagefind/pagefind.js');
      await pagefind.init();
      return pagefind;
    })();
    return pagefindPromise;
  };

  const updateQueryUrl = (query) => {
    const url = new URL(window.location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const clearResults = () => results.replaceChildren();
  const showEmptyVisual = (visible) => {
    emptyVisual.hidden = !visible;
  };

  const searchFallback = (query) => {
    const normalizedQuery = query.normalize('NFKC').toLocaleLowerCase();
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    return fallbackDocuments
      .map((document) => {
        const title = document.title.normalize('NFKC').toLocaleLowerCase();
        const haystack = `${document.title} ${document.text}`.normalize('NFKC').toLocaleLowerCase();
        if (!terms.every((term) => haystack.includes(term))) return undefined;
        const score = title.includes(normalizedQuery) ? 2 : title.includes(terms[0] ?? '') ? 1 : 0;
        return {
          score,
          data: {
            url: document.url,
            meta: { title: document.title },
            plain_excerpt: document.excerpt,
          },
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((result) => result.data);
  };

  const renderResult = (data) => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    const title = document.createElement('h2');
    const excerpt = document.createElement('p');
    const meta = document.createElement('p');

    item.className = 'site-search-result';
    link.href = data.url;
    title.textContent = (data.meta.title ?? data.url).replace(/\s*\|\s*Elen Skye$/, '');
    excerpt.textContent = (data.plain_excerpt ?? data.excerpt?.replace(/<[^>]+>/g, '') ?? '')
      .replace(/^[\s:：·.–—]+/, '');
    meta.className = 'site-search-result-meta';
    meta.textContent = `${text('languageLabel')}: ${text('languageValue')}`;

    link.append(title, excerpt, meta);
    item.append(link);
    return item;
  };

  const runSearch = async () => {
    const query = input.value.trim();
    const currentRequest = ++requestId;
    updateQueryUrl(query);
    clearResults();
    showEmptyVisual(false);

    if (!query) {
      status.textContent = '';
      return;
    }

    status.textContent = text('loading');
    let data;
    try {
      const pagefind = await loadPagefind();
      const response = await pagefind.search(query);
      if (currentRequest !== requestId) return;
      data = await Promise.all(response.results.slice(0, 20).map((result) => result.data()));
    } catch {
      data = searchFallback(query);
    }
    if (currentRequest !== requestId) return;
    if (!Array.isArray(data)) {
      status.textContent = text('error');
      showEmptyVisual(true);
      return;
    }
    if (data.length === 0) {
      status.textContent = text('empty');
      showEmptyVisual(true);
      return;
    }

    status.textContent = data.length === 1
      ? text('countOne')
      : text('countMany').replace('{count}', String(data.length));
    results.append(...data.map(renderResult));
  };

  const scheduleSearch = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void runSearch(), 180);
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(timer);
    void runSearch();
  });
  input.addEventListener('input', scheduleSearch);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value) {
      input.value = '';
      void runSearch();
    }
    if (event.key === 'ArrowDown') {
      const firstResult = results.querySelector('a');
      if (firstResult) {
        event.preventDefault();
        firstResult.focus();
      }
    }
  });

  const initialQuery = new URL(window.location.href).searchParams.get('q')?.trim() ?? '';
  if (initialQuery) {
    input.value = initialQuery;
    void runSearch();
  }
}
