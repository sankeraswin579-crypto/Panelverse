(() => {
  const form = document.querySelector('#comic-discovery-form');
  if (!form) return;
  const input = document.querySelector('#comic-discovery-input');
  const typeSelect = document.querySelector('#comic-discovery-type');
  const status = document.querySelector('#comic-discovery-status');
  const results = document.querySelector('#comic-discovery-results');
  let activeRequest = 0;
  let currentResults = [];

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
    const key = discoveryKey(item);
    const saved = (state.discoveries || []).some(row => row.discoveryId === key);
    const image = typeof item.imageUrl === 'string' && /^https:\/\/(upload\.wikimedia\.org|images\.wikipedia\.org|image\.tmdb\.org|covers\.openlibrary\.org)\//.test(item.imageUrl)
      ? `<img class="discovery-art-image" src="${esc(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
      : `<div class="discovery-art-fallback" aria-hidden="true">${isCharacter ? '✦' : '▤'}</div>`;
    return `<article class="discovery-card">
      <div class="discovery-card-art">${image}<span>${esc(typeLabels[item.type] || 'DISCOVERY')}</span></div>
      <div class="discovery-card-copy"><div class="discovery-source">${esc(item.source || 'External source')}</div>
        <h3>${esc(item.title)}</h3><p>${esc(item.summary || 'Open a source page for more information.')}</p>
        <div class="discovery-links">${renderSourceLinks(item.sourceLinks)}</div>
        <button class="save-inline discovery-save" data-save-discovery="${esc(key)}">${saved ? '▣ Saved to shelf' : '＋ Save to shelf'}</button>
      </div>
    </article>`;
  }
  function discoveryKey(item) {
    const title = String(item.title || '').normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 180);
    return `${String(item.type || '').toLowerCase()}:${title}`;
  }
  function renderResults() {
    results.innerHTML = currentResults.length
      ? currentResults.map(resultCard).join('')
      : '<div class="discovery-empty">No matching results were found. Try a character, comic, actor, film, team, storyline or publisher.</div>';
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
      currentResults = response.results;
      renderResults();
    } catch (error) {
      if (requestId !== activeRequest) return;
      status.textContent = error.message || 'Live comic search is unavailable. Please try again.';
      results.innerHTML = '';
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); search(); });
  results.addEventListener('click', async event => {
    const button = event.target.closest('[data-save-discovery]');
    if (!button) return;
    const item = currentResults.find(result => discoveryKey(result) === button.dataset.saveDiscovery);
    if (!item) return;
    button.disabled = true;
    try {
      state.discoveries = (await api('/api/discovery-saves', {
        method: 'POST',
        body: JSON.stringify({ item })
      })).data;
      renderResults();
      renderAll();
      window.dispatchEvent(new Event('panelverse:discoveries-updated'));
      toast('Saved web discovery to your shelf');
    } catch (error) {
      button.disabled = false;
      if ((error.message || '').toLowerCase().includes('sign in')) {
        toast('Sign in to save web discoveries across your devices.');
        setTimeout(() => { location.href = '/login'; }, 900);
        return;
      }
      toast(error.message || 'Could not save this discovery.');
    }
  });
  window.addEventListener('panelverse:discoveries-updated', renderResults);
  document.addEventListener('click', event => {
    const nav = event.target.closest('[data-page], [data-go]');
    if (nav && (nav.dataset.page || nav.dataset.go) === 'discover') {
      document.querySelector('#breadcrumb-current').textContent = 'Explore everything';
      setTimeout(() => input.focus(), 0);
    }
  });
})();
