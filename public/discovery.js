(() => {
  const form = document.querySelector('#comic-discovery-form');
  if (!form) return;
  const input = document.querySelector('#comic-discovery-input');
  const typeSelect = document.querySelector('#comic-discovery-type');
  const status = document.querySelector('#comic-discovery-status');
  const results = document.querySelector('#comic-discovery-results');
  let activeRequest = 0;

  const typeLabels = {
    character: 'CHARACTER',
    comic: 'COMIC / BOOK',
    film: 'FILM',
    series: 'TV / SERIES',
    person: 'ACTOR / CREATOR',
    team: 'TEAM',
    world: 'WORLD',
    event: 'EVENT',
    storyline: 'STORYLINE',
    adaptation: 'ADAPTATION',
    reference: 'REFERENCE'
  };
  function renderSourceLinks(links) {
    return (Array.isArray(links) ? links : []).map(link => {
      if (typeof link.url !== 'string' || !link.url.startsWith('https://')) return '';
      return `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label || 'Open source')} ↗</a>`;
    }).join('');
  }
  function resultCard(item) {
    const isCharacter = item.type === 'character';
    const image = typeof item.imageUrl === 'string' && /^https:\/\/(upload\.wikimedia\.org|images\.wikipedia\.org|image\.tmdb\.org|covers\.openlibrary\.org)\//.test(item.imageUrl)
      ? `<img class="discovery-art-image" src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="discovery-art-fallback" aria-hidden="true">${isCharacter ? '✦' : '▤'}</div>`;
    return `<article class="discovery-card">
      <div class="discovery-card-art">${image}<span>${esc(typeLabels[item.type] || 'DISCOVERY')}</span></div>
      <div class="discovery-card-copy"><div class="discovery-source">${esc(item.source || 'External source')}</div>
        <h3>${esc(item.title)}</h3><p>${esc(item.summary || 'Open a source page for more information.')}</p>
        <div class="discovery-links">${renderSourceLinks(item.sourceLinks)}</div>
      </div>
    </article>`;
  }
  async function search() {
    const query = input.value.trim();
    const type = typeSelect.value;
    const requestId = ++activeRequest;
    if (query.length < 2) {
      status.textContent = 'Enter at least two characters to search.';
      input.focus();
      return;
    }
    status.textContent = 'Searching the selected content types across public sources…';
    results.innerHTML = '';
    try {
      const response = await api(`/api/discover/comics?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`);
      if (requestId !== activeRequest) return;
      status.textContent = `${response.total} entries · Sources: ${response.sources.join(' · ')} · ${response.notice}`;
      results.innerHTML = response.results.length
        ? response.results.map(resultCard).join('')
        : '<div class="discovery-empty">No matching results were found. Try a character, comic, actor, film, team, storyline or publisher.</div>';
    } catch (error) {
      if (requestId !== activeRequest) return;
      status.textContent = error.message || 'Live comic search is unavailable. Please try again.';
      results.innerHTML = '';
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); search(); });
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-page], [data-go]');
    if (nav && (nav.dataset.page || nav.dataset.go) === 'discover') {
      document.querySelector('#breadcrumb-current').textContent = 'Explore everything';
      setTimeout(() => input.focus(), 0);
    }
  });
})();
