const state={characters:[],comics:[],paths:[],adaptations:[],movies:[],storylines:[],shelf:[],query:'',universe:'All',format:'All formats',comicUniverse:'All',shelfMode:'all'};
let currentOwner='local';

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=n=>n.split(/\s+/).map(w=>w[0]).slice(0,2).join('');

async function api(url,options={}){
  const headers=new Headers(options.headers||{});

  if(options.body!=null&&!headers.has('Content-Type')){
    headers.set('Content-Type','application/json');
  }

  if(!headers.has('Accept')){
    headers.set('Accept','application/json');
  }

  const response=await fetch(url,{
    ...options,
    headers,
    credentials:options.credentials||'same-origin'
  });

  const raw=await response.text();
  let payload={};

  if(raw){
    try{
      payload=JSON.parse(raw);
    }catch{
      payload={
        error:raw.slice(0,240)||'The server returned an unreadable response.'
      };
    }
  }

  if(!response.ok){
    throw Error(payload.error||`Request failed (${response.status})`);
  }

  return payload;
}

const matches=x=>!state.query||JSON.stringify(x).toLowerCase().includes(state.query.toLowerCase());

function card(p){
  const saved=state.shelf.some(x=>x.itemType==='character'&&x.itemId===p.id);

  return `<article class="character-card" data-person="${esc(p.id)}">
    <div class="portrait" data-universe="${esc(p.universe)}">
      ${p.imageUrl?`<img class="character-art" src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:''}
      <strong class="portrait-mark">${esc(initials(p.name))}</strong>
      <button class="save-button" data-save-type="character" data-save-id="${esc(p.id)}" aria-label="${saved?'Remove':'Save'} ${esc(p.name)}">${saved?'▣':'＋'}</button>
    </div>
    <div class="card-copy">
      <small class="card-kicker">${esc(p.universe.toUpperCase())} · ${esc(p.kind.toUpperCase())}</small>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.summary)}</p>
      <div class="tag-row">${p.powers.slice(0,2).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>
    </div>
  </article>`;
}

function comicCard(c){
  const saved=state.shelf.some(x=>x.itemType==='comic'&&x.itemId===c.id);

  return `<article class="comic-card">
    <div class="cover" data-u="${esc(c.universe)}">${esc(c.title)}</div>
    <div class="comic-copy">
      <small>${esc(c.universe.toUpperCase())} · ${esc(c.format.toUpperCase())}</small>
      <h3>${esc(c.title)}</h3>
      <p class="creators">${esc(c.creators)}</p>
      <p>${esc(c.description)}</p>
      <div class="comic-actions">
        <a class="publisher-link" href="${esc(c.publisherUrl)}" target="_blank" rel="noreferrer">Publisher info ↗</a>
        <button class="save-inline" data-save-type="comic" data-save-id="${esc(c.id)}">${saved?'▣ Saved':'＋ Save'}</button>
      </div>
    </div>
  </article>`;
}

function renderCharacters(){
  const people=state.characters.filter(p=>
    (state.universe==='All'||p.universe===state.universe)&&matches(p)
  );

  $('#character-grid').innerHTML=people.length
    ?people.map(card).join('')
    :'<div class="loading">No characters match this search.</div>';

  $('#featured-grid').innerHTML=state.characters.slice(0,3).map(card).join('');
}

function renderComics(){
  const rows=state.comics.filter(c=>
    (state.comicUniverse==='All'||c.universe===state.comicUniverse)&&
    (state.format==='All formats'||c.format===state.format)&&matches(c)
  );

  $('#comic-grid').innerHTML=rows.length
    ?rows.map(comicCard).join('')
    :'<div class="loading">No comics match this search.</div>';
}

function pathCard(p,i,short=false){
  return `<article class="path-card">
    <div class="path-number">${String(i+1).padStart(2,'0')}</div>
    <small>${esc(p.level.toUpperCase())} · ${p.items.length} STORIES</small>
    <h3>${esc(p.title)}</h3>
    <p>${esc(p.description)}</p>
    <ol>${p.items.slice(0,short?2:undefined).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
  </article>`;
}

function renderPaths(){
  const rows=state.paths.filter(matches);

  $('#path-grid').innerHTML=rows.length
    ?rows.map((p,i)=>pathCard(p,i)).join('')
    :'<div class="loading">No reading paths match this search.</div>';

  $('#featured-paths').innerHTML=rows.slice(0,3).map((p,i)=>pathCard(p,i,true)).join('');
}

function renderAdaptations(){
  const rows=state.adaptations.filter(matches);

  $('#adaptation-grid').innerHTML=rows.length
    ?rows.map(a=>`<article class="adaptation-card">
      <span class="adapt-icon">▣</span>
      <small>${esc(a.universe.toUpperCase())} · ${esc(a.medium.toUpperCase())}</small>
      <h3>${esc(a.title)}</h3>
      <p>${esc(a.description)}</p>
      <a href="${esc(a.publisherUrl)}" target="_blank" rel="noreferrer">Explore publisher info ↗</a>
    </article>`).join('')
    :'<div class="loading">No adaptations match this search.</div>';
}

function renderShelf(){
  const pids=new Set(state.shelf.filter(x=>x.itemType==='character').map(x=>x.itemId));
  const cids=new Set(state.shelf.filter(x=>x.itemType==='comic').map(x=>x.itemId));

  const people=state.characters.filter(p=>pids.has(p.id)&&matches(p));
  const comics=state.comics.filter(c=>cids.has(c.id)&&matches(c));

  $('#shelf-characters').innerHTML=state.shelfMode==='comic'?'':people.map(card).join('');
  $('#shelf-comics').innerHTML=state.shelfMode==='character'?'':comics.map(comicCard).join('');

  $('#shelf-empty').hidden=state.shelf.length>0;
  $('#shelf-count').textContent=state.shelf.length;
  $('#stat-saved').textContent=state.shelf.length;
}

function renderAll(){
  renderCharacters();
  renderComics();
  renderPaths();
  renderAdaptations();
  renderShelf();
}

function showPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${id}`));
  document.querySelectorAll('.nav-link').forEach(b=>b.classList.toggle('active',b.dataset.page===id));

  $('#breadcrumb-current').textContent=({
    overview:'Overview',
    characters:'Characters',
    comics:'Comics library',
    paths:'Reading paths',
    screen:'On screen',
    shelf:'My shelf'
  })[id]||'Overview';

  window.scrollTo({top:0,behavior:'smooth'});
}

function toast(message){
  const box=$('#toast');
  box.textContent=message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>box.classList.remove('show'),2300);
}

async function toggleSaved(type,id){
  const exists=state.shelf.some(x=>x.itemType===type&&x.itemId===id);

  try{
    state.shelf=(await api('/api/shelf',{
      method:exists?'DELETE':'POST',
      body:JSON.stringify({itemType:type,itemId:id})
    })).data;

    renderAll();
    toast(exists?'Removed from your shelf':'Saved to your shelf');
  }catch(error){
    if(error.message.toLowerCase().includes('sign in')){
      toast('Create a free account or sign in to save your collection.');
      setTimeout(()=>location.href='/login',900);
      return;
    }
    throw error;
  }
}

function openCharacter(id){
  const p=state.characters.find(x=>x.id===id);
  if(!p)return;

  $('#detail-universe').textContent=p.universe.toUpperCase();
  $('#detail-monogram').textContent=initials(p.name);
  const detailArt=$('#detail-art-image');
  if(detailArt){detailArt.src=p.imageUrl||'';detailArt.hidden=!p.imageUrl;}
  $('#detail-meta').textContent=`${p.universe.toUpperCase()} · ${p.kind.toUpperCase()}`;
  $('#detail-name').textContent=p.name;
  $('#detail-identity').textContent=p.identity;
  $('#detail-summary').textContent=p.summary;

  $('#detail-powers').innerHTML=p.powers.map(x=>`<span class="tag">${esc(x)}</span>`).join('');
  $('#detail-connections').innerHTML=p.connections.map(x=>`<span class="tag">${esc(x)}</span>`).join('');

  $('#detail-first').textContent=p.firstAppearance;
  $('#detail-link').href=p.publisherUrl;

  const saved=state.shelf.some(x=>x.itemType==='character'&&x.itemId===p.id);

  $('#detail-save').textContent=saved?'▣ Saved to shelf':'＋ Save to shelf';
  $('#detail-save').dataset.person=p.id;
  $('#character-dialog').showModal();
}

async function askGuide(question){
  const q=question.trim();
  if(!q)return;

  const messages=$('#guide-messages');
  const user=document.createElement('p');

  user.className='guide-user';
  user.textContent=q;
  messages.append(user);

  $('#guide-input').value='';

  const pending=document.createElement('p');
  pending.className='guide-answer';
  pending.textContent='Looking through the catalog…';
  messages.append(pending);

  messages.scrollTop=messages.scrollHeight;

  try{
    const r=await api('/api/guide',{
      method:'POST',
      body:JSON.stringify({question:q})
    });

    pending.textContent=`${r.answer} (${r.mode})`;
  }catch{
    pending.textContent='The guide is unavailable right now. Please try again.';
  }

  messages.scrollTop=messages.scrollHeight;
}

function openGuide(){
  $('#guide-dialog').showModal();
  $('#guide-input').focus();
}

async function init(){
  try{
    const [a,b,c,d,e]=await Promise.all([
      api('/api/characters'),
      api('/api/comics'),
      api('/api/reading-paths'),
      api('/api/adaptations'),
      api('/api/shelf?owner='+encodeURIComponent(currentOwner))
    ]);

    state.characters=a.data;
    try{
      const names=state.characters.map(p=>p.name).filter(Boolean);
      const artwork=await api('/api/character-art?names='+encodeURIComponent(names.join('|')));
      state.characters=state.characters.map(p=>({...p,imageUrl:artwork.data?.[p.name.toLowerCase()]||null}));
    }catch(artError){console.warn('Character artwork unavailable:',artError.message);}
    state.comics=b.data;
    state.paths=c.data;
    state.adaptations=d.data;
    state.shelf=e.data;

    $('#character-count').textContent=state.characters.length;
    $('#stat-characters').textContent=state.characters.length;
    $('#stat-comics').textContent=state.comics.length;
    $('#stat-paths').textContent=state.paths.length;

    renderAll();
    setupCharacterCompare();
  }catch(error){
    document.querySelectorAll('.card-grid,.comic-grid').forEach(el=>{
      el.innerHTML=`<div class="error-state">${esc(error.message)} · Start the server with <b>npm start</b>.</div>`;
    });
  }
}

document.addEventListener('click',async e=>{
  const nav=e.target.closest('[data-page],[data-go]');

  if(nav){
    e.preventDefault();
    showPage(nav.dataset.page||nav.dataset.go);
    return;
  }

  if(e.target.closest('[data-close]')){
    $('#character-dialog').close();
    return;
  }

  if(e.target.closest('[data-guide-close]')){
    $('#guide-dialog').close();
    return;
  }

  const save=e.target.closest('[data-save-id]');

  if(save){
    e.stopPropagation();
    try{
      await toggleSaved(save.dataset.saveType,save.dataset.saveId);
    }catch(err){
      toast(err.message);
    }
    return;
  }

  const char=e.target.closest('[data-person]');

  if(char&&!e.target.closest('button')){
    openCharacter(char.dataset.person);
  }

  const prompt=e.target.closest('[data-prompt]');
  if(prompt)askGuide(prompt.dataset.prompt);

  if(e.target.closest('#open-guide,#guide-shortcut'))openGuide();
});

$('#detail-save').addEventListener('click',async e=>{
  const id=e.currentTarget.dataset.person;

  try{
    await toggleSaved('character',id);

    e.currentTarget.textContent=state.shelf.some(x=>x.itemType==='character'&&x.itemId===id)
      ?'▣ Saved to shelf'
      :'＋ Save to shelf';
  }catch(err){
    toast(err.message);
  }
});

$('#universe-filter').addEventListener('change',e=>{
  state.universe=e.target.value;
  renderCharacters();
});

$('#format-filter').addEventListener('change',e=>{
  state.format=e.target.value;
  renderComics();
});

// ============================================
// PANELVERSE 3.0 — GLOBAL SEARCH PROTECTION
// ============================================

const globalSearchInput=$('#global-search');

const isEmailAddress=value=>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim());

function clearEmailFromGlobalSearch(){
  if(!globalSearchInput||!isEmailAddress(globalSearchInput.value)){
    return false;
  }

  globalSearchInput.value='';
  state.query='';
  renderAll();

  return true;
}

if(globalSearchInput){
  globalSearchInput.setAttribute('name','panelverse-search-query');
  globalSearchInput.setAttribute('autocomplete','off');
  globalSearchInput.setAttribute('autocapitalize','off');
  globalSearchInput.setAttribute('spellcheck','false');

  globalSearchInput.addEventListener('input',event=>{
    if(isEmailAddress(event.target.value)){
      event.target.value='';
      state.query='';
      renderAll();
      toast('Search for heroes, comics and stories.');
      return;
    }

    state.query=event.target.value;
    renderAll();
  });

  globalSearchInput.addEventListener('change',clearEmailFromGlobalSearch);
  globalSearchInput.addEventListener('blur',clearEmailFromGlobalSearch);
  globalSearchInput.addEventListener('focus',clearEmailFromGlobalSearch);

  window.addEventListener('pageshow',clearEmailFromGlobalSearch);
  window.addEventListener('focus',clearEmailFromGlobalSearch);

  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
      clearEmailFromGlobalSearch();
    }
  });

  clearEmailFromGlobalSearch();
}

document.querySelectorAll('.shelf-tab').forEach(t=>{
  t.addEventListener('click',()=>{
    document.querySelectorAll('.shelf-tab').forEach(x=>x.classList.toggle('active',x===t));
    state.shelfMode=t.dataset.shelf;
    renderShelf();
  });
});

$('#guide-form').addEventListener('submit',e=>{
  e.preventDefault();
  askGuide($('#guide-input').value);
});

document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){
    e.preventDefault();
    $('#global-search').focus();
  }

  if(e.key==='Escape'){
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  }
});

init();

let installPrompt=null;
const installButton=document.querySelector('#install-app');

window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  installPrompt=event;
  installButton.classList.add('ready');
});

window.addEventListener('appinstalled',()=>{
  installPrompt=null;
  installButton.classList.remove('ready');
  installButton.hidden=true;
  toast('Panelverse installed');
});

installButton.addEventListener('click',async()=>{
  if(installPrompt){
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt=null;
    installButton.classList.remove('ready');
    return;
  }

  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);

  toast(ios
    ?'In Safari, tap Share, then Add to Home Screen.'
    :'Use your browser menu and choose Install app or Add to Home screen.'
  );
});

if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost')){
  navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
}

// ============================================
// PANELVERSE 3.0 — READING PROGRESS TRACKER
// ============================================

state.progress=[];

function progressRecord(id){
  return state.progress.find(x=>x.comicId===id);
}

function progressCard(item,compact=false){
  const comic=state.comics.find(x=>x.id===item.comicId);
  if(!comic)return '';

  const pct=item.status==='completed'?100:Number(item.progress)||0;

  const label={
    'want-to-read':'Want to read',
    'reading':'Reading',
    'completed':'Completed'
  }[item.status]||'Want to read';

  return `<article class="progress-card">
    <div class="progress-card-head">
      <div>
        <small>${esc(comic.universe.toUpperCase())} · ${esc(comic.format.toUpperCase())}</small>
        <h3>${esc(comic.title)}</h3>
      </div>
      <span class="progress-badge ${esc(item.status)}">${label}</span>
    </div>

    <div class="progress-meter">
      <span style="width:${pct}%"></span>
    </div>

    <div class="progress-controls">
      <span>${pct}% complete</span>
      ${compact
        ?`<button class="text-button" data-go="shelf">Update progress →</button>`
        :`<label>Status
          <select data-progress-status="${esc(comic.id)}">
            <option value="want-to-read" ${item.status==='want-to-read'?'selected':''}>Want to read</option>
            <option value="reading" ${item.status==='reading'?'selected':''}>Reading</option>
            <option value="completed" ${item.status==='completed'?'selected':''}>Completed</option>
          </select>
        </label>
        <label class="progress-range">Progress
          <input type="range" min="0" max="99" value="${Math.min(99,pct)}" data-progress-value="${esc(comic.id)}" ${item.status!=='reading'?'disabled':''}>
        </label>`
      }
    </div>
  </article>`;
}

function renderTracker(){
  const rows=state.progress
    .map(p=>({...p,comic:state.comics.find(c=>c.id===p.comicId)}))
    .filter(x=>x.comic&&matches(x.comic));

  const active=rows.filter(x=>x.status==='reading');

  $('#progress-grid').innerHTML=rows.length
    ?rows.map(x=>progressCard(x)).join('')
    :'<div class="tracker-empty">Your reading tracker is empty. Open Comics Library and add a title to get started.</div>';

  $('#continue-grid').innerHTML=active.length
    ?active.slice(0,3).map(x=>progressCard(x,true)).join('')
    :'<div class="tracker-empty">No active reads yet. Add a comic to your tracker and your progress will appear here.</div>';
}

async function refreshProgress(){
  const r=await api('/api/progress?owner='+encodeURIComponent(currentOwner));
  state.progress=r.data;
  renderTracker();
}

async function saveProgress(comicId,status,progress){
  const r=await api('/api/progress',{
    method:'POST',
    body:JSON.stringify({comicId,status,progress,owner:currentOwner})
  });

  state.progress=r.data;
  renderAll();
}

const previousComicCard=comicCard;

comicCard=function(c){
  const base=previousComicCard(c);
  const record=progressRecord(c.id);

  const action=record
    ?`${({'want-to-read':'Want to read','reading':'Reading','completed':'Completed'})[record.status]} · ${record.progress}%`
    :'＋ Track reading';

  return base.replace(
    '</div></div></article>',
    `<button class="track-button" data-track="${esc(c.id)}">${esc(action)}</button></div></div></article>`
  );
};

const previousRenderShelf=renderShelf;

renderShelf=function(){
  previousRenderShelf();
  renderTracker();
};

const previousRenderAll=renderAll;

renderAll=function(){
  previousRenderAll();
  renderTracker();
};

document.addEventListener('click',async e=>{
  const track=e.target.closest('[data-track]');

  if(track){
    e.stopPropagation();

    const id=track.dataset.track;
    const current=progressRecord(id);

    const next=current
      ?({'want-to-read':'reading','reading':'completed','completed':'want-to-read'})[current.status]
      :'want-to-read';

    try{
      await saveProgress(id,next,next==='completed'?100:next==='reading'?1:0);

      toast(next==='completed'
        ?'Marked complete'
        :`Added to ${next.replaceAll('-',' ')}`
      );
    }catch(error){
      toast(error.message);
    }
  }
});

document.addEventListener('change',async e=>{
  const status=e.target.closest('[data-progress-status]');

  if(status){
    const current=progressRecord(status.dataset.progressStatus);
    const next=status.value;

    try{
      await saveProgress(
        status.dataset.progressStatus,
        next,
        next==='completed'?100:next==='reading'?(current?.progress||1):0
      );
    }catch(error){
      toast(error.message);
    }

    return;
  }

  const range=e.target.closest('[data-progress-value]');

  if(range){
    const current=progressRecord(range.dataset.progressValue);

    try{
      await saveProgress(
        range.dataset.progressValue,
        current?.status||'reading',
        Number(range.value)
      );
    }catch(error){
      toast(error.message);
    }
  }
});

refreshProgress().catch(()=>{});

// ============================================
// PANELVERSE 3.0 — PERSONALIZED DISCOVERY
// ============================================

function renderRecommendations(){
  const completed=new Set(
    state.progress.filter(x=>x.status==='completed').map(x=>x.comicId)
  );

  const saved=new Set(
    state.shelf.filter(x=>x.itemType==='comic').map(x=>x.itemId)
  );

  const affinity={};

  for(const entry of state.shelf){
    if(entry.itemType==='character'){
      const p=state.characters.find(x=>x.id===entry.itemId);
      if(p){
        affinity[p.universe]=(affinity[p.universe]||0)+2;
      }
    }else{
      const c=state.comics.find(x=>x.id===entry.itemId);
      if(c){
        affinity[c.universe]=(affinity[c.universe]||0)+1;
      }
    }
  }

  for(const record of state.progress){
    const c=state.comics.find(x=>x.id===record.comicId);

    if(c&&record.status==='reading'){
      affinity[c.universe]=(affinity[c.universe]||0)+2;
    }
  }

  const favorite=Object.entries(affinity).sort((a,b)=>b[1]-a[1])[0]?.[0];

  const rows=state.comics
    .filter(c=>!completed.has(c.id)&&!saved.has(c.id))
    .map(c=>{
      const match=favorite&&c.universe===favorite;

      const reason=match
        ?`Matches your interest in ${favorite}`
        :c.format==='Complete story'
          ?'A self-contained place to start'
          :c.format==='Origin issue'
            ?'A compact origin story'
            :'A curated entry in the collection';

      const score=(match?4:0)+(c.format==='Complete story'?2:c.format==='Origin issue'?1:0);

      return {...c,reason,score};
    })
    .sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title))
    .slice(0,3);

  $('#recommendation-basis').textContent=favorite
    ?`Based on your ${favorite} shelf and reading activity`
    :'A few approachable picks to get you started';

  $('#recommendation-grid').innerHTML=rows.length
    ?rows.map(c=>`<div class="recommendation-item">
      <span class="recommendation-reason">✧ ${esc(c.reason)}</span>
      ${comicCard(c)}
    </div>`).join('')
    :'<div class="tracker-empty">You have explored every comic in this starter catalog. More recommendations will appear as the catalog grows.</div>';
}

const trackerWithRecommendations=renderTracker;

renderTracker=function(){
  trackerWithRecommendations();
  renderRecommendations();
};

const allWithRecommendations=renderAll;

renderAll=function(){
  allWithRecommendations();
  renderRecommendations();
};

renderRecommendations();

// ============================================
// PANELVERSE 3.0 — CONNECTED CATALOG
// ============================================

state.characterKind='All types';
state.characterSort='name';
state.screenUniverse='All';
state.screenMedium='All formats';
state.screenSort='newest';
state.storylineUniverse='All';
state.storylineSort='chronological';

function renderCharacterDirectory(){
  let rows=state.characters.filter(p=>
    (state.universe==='All'||p.universe===state.universe)&&
    (state.characterKind==='All types'||p.kind===state.characterKind)&&matches(p)
  );

  rows.sort((a,b)=>
    state.characterSort==='universe'
      ?a.universe.localeCompare(b.universe)||a.name.localeCompare(b.name)
      :a.name.localeCompare(b.name)
  );

  $('#character-grid').innerHTML=rows.length
    ?rows.map(card).join('')
    :'<div class="loading">No characters match these filters.</div>';

  $('#featured-grid').innerHTML=state.characters
    .filter(p=>p.kind==='Hero')
    .slice(0,3)
    .map(card)
    .join('');
}

function screenCard(m){
  const saved=state.shelf.some(x=>x.itemType==='screen'&&x.itemId===m.id);

  const chars=(m.characters||[])
    .map(id=>state.characters.find(p=>p.id===id))
    .filter(Boolean);

  const comic=state.comics.find(c=>c.id===m.relatedComicId);

  return `<article class="screen-card">
    <div class="screen-card-art" data-u="${esc(m.universe)}">
      <span>${esc(m.medium.toUpperCase())}</span>
      <b>${esc(String(m.year))}</b>
      <i>${esc(m.universe.toUpperCase())}</i>
    </div>

    <div class="screen-card-body">
      <div class="screen-meta">
        <span>${esc(m.continuity)}</span>
        <span>${esc(m.genres.join(' · '))}</span>
      </div>

      <h3>${esc(m.title)}</h3>
      <p>${esc(m.summary)}</p>

      <div class="screen-credits">
        <small>CAST</small>
        <span>${esc(m.cast.join(' · '))}</span>
      </div>

      <div class="screen-links">
        <div class="chip-row">
          ${chars.map(p=>`<button class="tag chip-button" data-open-person="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
          ${comic?`<a class="tag" href="${esc(comic.publisherUrl)}" target="_blank" rel="noreferrer">Comic: ${esc(comic.title)} ↗</a>`:''}
        </div>

        <div class="screen-actions">
          <a href="${esc(m.publisherUrl)}" target="_blank" rel="noreferrer">Official details ↗</a>
          <button data-save-type="screen" data-save-id="${esc(m.id)}">${saved?'▣ Watchlist':'＋ Watchlist'}</button>
        </div>
      </div>
    </div>
  </article>`;
}

function renderScreen(){
  let rows=state.movies.filter(m=>
    (state.screenUniverse==='All'||m.universe===state.screenUniverse)&&
    (state.screenMedium==='All formats'||m.medium===state.screenMedium)&&matches(m)
  );

  rows.sort((a,b)=>
    state.screenSort==='title'
      ?a.title.localeCompare(b.title)
      :state.screenSort==='oldest'
        ?a.year-b.year
        :b.year-a.year
  );

  const films=state.movies.filter(x=>x.medium==='Film').length;
  const series=state.movies.filter(x=>x.medium==='Series').length;

  $('#screen-stats').innerHTML=
    `<span><b>${state.movies.length}</b> titles</span>
     <span><b>${films}</b> films</span>
     <span><b>${series}</b> series</span>`;

  $('#screen-grid').innerHTML=rows.length
    ?rows.map(screenCard).join('')
    :'<div class="loading">No titles match these filters.</div>';
}

function storylineCard(item){
  const characters=(item.characters||[])
    .map(id=>state.characters.find(p=>p.id===id))
    .filter(Boolean);

  const links=(item.screenIds||[])
    .map(id=>state.movies.find(m=>m.id===id))
    .filter(Boolean);

  return `<article class="timeline-item">
    <div class="timeline-date">
      <b>${esc(item.year)}</b>
      <span>${esc(item.universe)}</span>
    </div>

    <div class="timeline-card">
      <div class="timeline-top">
        <span>${esc(item.type.toUpperCase())}</span>
        <span>${esc(item.difficulty)}</span>
      </div>

      <h3>${esc(item.title)}</h3>
      <p>${esc(item.description)}</p>

      <div class="timeline-detail">
        <small>READING ORDER</small>
        <ol>${item.readingOrder.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
      </div>

      <div class="chip-row">
        ${characters.map(p=>`<button class="tag chip-button" data-open-person="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
        ${links.map(m=>`<button class="tag chip-button" data-screen-jump="${esc(m.id)}">${esc(m.title)} · ${esc(m.year)}</button>`).join('')}
      </div>
    </div>
  </article>`;
}

function renderStorylines(){
  let rows=state.storylines.filter(x=>
    (state.storylineUniverse==='All'||x.universe===state.storylineUniverse)&&matches(x)
  );

  rows.sort((a,b)=>
    state.storylineSort==='name'
      ?a.title.localeCompare(b.title)
      :a.year-b.year
  );

  $('#storyline-grid').innerHTML=rows.length
    ?rows.map(storylineCard).join('')
    :'<div class="loading">No storylines match these filters.</div>';
}

async function loadConnectedCatalog(){
  try{
    const [m,s]=await Promise.all([
      api('/api/movies'),
      api('/api/storylines')
    ]);

    state.movies=m.data;
    state.storylines=s.data;

    renderScreen();
    renderStorylines();
    renderMediaShelf();
    renderRecommendations();
  }catch(error){
    $('#screen-grid').innerHTML=
      `<div class="error-state">${esc(error.message)} · Restart the server to load the expanded catalog.</div>`;
  }
}

const oldDirectory=renderCharacters;
renderCharacters=renderCharacterDirectory;

const oldOpenCharacter=openCharacter;

openCharacter=function(id){
  oldOpenCharacter(id);
  const p=state.characters.find(x=>x.id===id);

  $('#detail-groups').innerHTML=(p?.groupAffiliations||[])
    .map(x=>`<span class="tag">${esc(x)}</span>`)
    .join('');
};

const oldPage=showPage;

showPage=function(id){
  oldPage(id);

  if(id==='screen')renderScreen();
  if(id==='storylines')renderStorylines();

  const labels={
    screen:'Movies & series',
    storylines:'Storyline explorer'
  };

  if(labels[id]){
    $('#breadcrumb-current').textContent=labels[id];
  }
};

function renderMediaShelf(){
  const wanted=new Set(
    state.shelf.filter(x=>x.itemType==='screen').map(x=>x.itemId)
  );

  const rows=state.movies.filter(x=>wanted.has(x.id));

  $('#shelf-screen').innerHTML=rows.map(screenCard).join('');

  const mode=state.shelfMode;

  if(mode==='screen'){
    $('#shelf-characters').innerHTML='';
    $('#shelf-comics').innerHTML='';
  }else if(mode==='character'){
    $('#shelf-comics').innerHTML='';
    $('#shelf-screen').innerHTML='';
  }else if(mode==='comic'){
    $('#shelf-characters').innerHTML='';
    $('#shelf-screen').innerHTML='';
  }

  $('#shelf-empty').hidden=state.shelf.length>0;
}

const shelfWithMedia=renderShelf;

renderShelf=function(){
  shelfWithMedia();
  renderMediaShelf();
};

const allWithCatalog=renderAll;

renderAll=function(){
  allWithCatalog();
  renderScreen();
  renderStorylines();
  renderMediaShelf();
};

$('#kind-filter').addEventListener('change',e=>{
  state.characterKind=e.target.value;
  renderCharacterDirectory();
});

$('#character-sort').addEventListener('change',e=>{
  state.characterSort=e.target.value;
  renderCharacterDirectory();
});

$('#screen-universe-filter').addEventListener('change',e=>{
  state.screenUniverse=e.target.value;
  renderScreen();
});

$('#screen-medium-filter').addEventListener('change',e=>{
  state.screenMedium=e.target.value;
  renderScreen();
});

$('#screen-sort').addEventListener('change',e=>{
  state.screenSort=e.target.value;
  renderScreen();
});

$('#storyline-universe-filter').addEventListener('change',e=>{
  state.storylineUniverse=e.target.value;
  renderStorylines();
});

$('#storyline-sort').addEventListener('change',e=>{
  state.storylineSort=e.target.value;
  renderStorylines();
});

document.addEventListener('click',async e=>{
  const open=e.target.closest('[data-open-person]');

  if(open){
    openCharacter(open.dataset.openPerson);
    return;
  }

  const jump=e.target.closest('[data-screen-jump]');

  if(jump){
    showPage('screen');

    const m=state.movies.find(x=>x.id===jump.dataset.screenJump);

    $('#global-search').value=m?.title||'';
    state.query=m?.title||'';

    renderScreen();
  }
});

loadConnectedCatalog();

renderAdaptations=function(){};

// ============================================
// PANELVERSE 3.0 — TEAMS, WORLDS & EVENTS
// ============================================

state.teams=[];
state.worlds=[];
state.events=[];

function savedButton(type,id){
  const yes=state.shelf.some(x=>x.itemType===type&&x.itemId===id);

  return `<button class="catalog-save" data-save-type="${type}" data-save-id="${esc(id)}">${yes?'▣ Saved':'＋ Save'}</button>`;
}

function teamCard(t){
  const members=(t.members||[])
    .map(id=>state.characters.find(p=>p.id===id))
    .filter(Boolean);

  return `<article class="atlas-card">
    <div class="atlas-card-top">
      <span>${esc(t.universe.toUpperCase())} · ${esc(t.kind.toUpperCase())}</span>
      ${savedButton('team',t.id)}
    </div>

    <h3>${esc(t.name)}</h3>
    <p>${esc(t.summary)}</p>

    <div class="atlas-fact">
      <small>BASE</small>
      <b>${esc(t.base)}</b>
    </div>

    <div class="chip-row">
      ${members.map(p=>`<button class="tag chip-button" data-open-person="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
    </div>

    <a class="atlas-link" target="_blank" rel="noreferrer" href="${esc(t.publisherUrl)}">Official team info ↗</a>
  </article>`;
}

function worldCard(w){
  const people=(w.featuredCharacters||[])
    .map(id=>state.characters.find(p=>p.id===id))
    .filter(Boolean);

  const teams=(w.featuredTeams||[])
    .map(id=>state.teams.find(t=>t.id===id))
    .filter(Boolean);

  const events=(w.keyEvents||[])
    .map(id=>state.events.find(x=>x.id===id))
    .filter(Boolean);

  return `<article class="world-card" data-u="${esc(w.universe)}">
    <div class="world-card-top">
      <span>${esc(w.universe.toUpperCase())} · ${esc(w.continuity)}</span>
      ${savedButton('world',w.id)}
    </div>

    <h3>${esc(w.name)}</h3>
    <p>${esc(w.summary)}</p>

    <div class="world-links">
      <small>CHARACTERS</small>
      <div class="chip-row">
        ${people.map(p=>`<button class="tag chip-button" data-open-person="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
      </div>
    </div>

    <div class="world-links">
      <small>TEAMS &amp; EVENTS</small>
      <div class="chip-row">
        ${teams.map(t=>`<span class="tag">${esc(t.name)}</span>`).join('')}
        ${events.map(x=>`<button class="tag chip-button" data-event-jump="${esc(x.id)}">${esc(x.title)}</button>`).join('')}
      </div>
    </div>

    <a class="atlas-link" target="_blank" rel="noreferrer" href="${esc(w.publisherUrl)}">Explore publisher universe ↗</a>
  </article>`;
}

function eventCard(x){
  const people=(x.participants||[])
    .map(id=>state.characters.find(p=>p.id===id))
    .filter(Boolean);

  const comics=(x.comicIds||[])
    .map(id=>state.comics.find(c=>c.id===id))
    .filter(Boolean);

  return `<article class="event-card">
    <div class="event-year">
      ${esc(x.year)}
      <span>${esc(x.universe)}</span>
    </div>

    <div class="event-copy">
      <div class="timeline-top">
        <span>${esc(x.type.toUpperCase())}</span>
        <span>EVENT</span>
      </div>

      <h3>${esc(x.title)}</h3>
      <p>${esc(x.summary)}</p>

      <div class="chip-row">
        ${people.map(p=>`<button class="tag chip-button" data-open-person="${esc(p.id)}">${esc(p.name)}</button>`).join('')}
        ${comics.map(c=>`<a class="tag" target="_blank" rel="noreferrer" href="${esc(c.publisherUrl)}">${esc(c.title)} ↗</a>`).join('')}
      </div>

      <div class="event-actions">
        <a target="_blank" rel="noreferrer" href="${esc(x.publisherUrl)}">Publisher reading info ↗</a>
        ${savedButton('event',x.id)}
      </div>
    </div>
  </article>`;
}

function renderEvents(){
  const rows=state.events
    .filter(x=>(state.storylineUniverse==='All'||x.universe===state.storylineUniverse)&&matches(x))
    .sort((a,b)=>a.year-b.year);

  $('#event-grid').innerHTML=rows.length
    ?rows.map(eventCard).join('')
    :'<div class="loading">No events match these filters.</div>';
}

function renderAtlas(){
  const u=$('#atlas-universe-filter').value;

  const teams=state.teams.filter(t=>
    (u==='All'||t.universe===u)&&matches(t)
  );

  const worlds=state.worlds.filter(w=>
    (u==='All'||w.universe===u)&&matches(w)
  );

  $('#team-grid').innerHTML=teams.map(teamCard).join('')
    ||'<div class="loading">No teams match this universe.</div>';

  $('#world-grid').innerHTML=worlds.map(worldCard).join('')
    ||'<div class="loading">No worlds match this universe.</div>';
}

async function loadAtlasCatalog(){
  try{
    const [t,w,e]=await Promise.all([
      api('/api/teams'),
      api('/api/worlds'),
      api('/api/events')
    ]);

    state.teams=t.data;
    state.worlds=w.data;
    state.events=e.data;

    renderAtlas();
    renderEvents();
    renderSavedUniverse();
  }catch(error){
    $('#team-grid').innerHTML=`<div class="error-state">${esc(error.message)}</div>`;
  }
}

function renderSavedUniverse(){
  const types=['team','world','event'];
  const mode=state.shelfMode;
  let entries=[];

  for(const type of types){
    if(mode!=='all'&&mode!==type)continue;

    for(const row of state.shelf.filter(x=>x.itemType===type)){
      const source=type==='team'
        ?state.teams
        :type==='world'
          ?state.worlds
          :state.events;

      const item=source.find(y=>y.id===row.itemId);

      if(item){
        entries.push({type,item});
      }
    }
  }

  $('#shelf-universe-items').innerHTML=entries
    .map(({type,item})=>`<article class="saved-universe-card">
      <small>${esc(type.toUpperCase())} · ${esc(item.universe.toUpperCase())}</small>
      <h3>${esc(item.name||item.title)}</h3>
      <p>${esc(item.summary||item.description)}</p>
      ${savedButton(type,item.id)}
    </article>`)
    .join('');

  if(['team','world','event'].includes(mode)){
    $('#shelf-screen').innerHTML='';
    $('#shelf-characters').innerHTML='';
    $('#shelf-comics').innerHTML='';
  }

  if(mode==='all'||mode==='team'||mode==='world'||mode==='event'){
    $('#shelf-empty').hidden=state.shelf.length>0;
  }
}

const renderAllBeforeAtlas=renderAll;

renderAll=function(){
  renderAllBeforeAtlas();
  renderAtlas();
  renderEvents();
  renderSavedUniverse();
};

const pageBeforeAtlas=showPage;

showPage=function(id){
  pageBeforeAtlas(id);

  if(id==='atlas')renderAtlas();

  if(id==='storylines'){
    renderStorylines();
    renderEvents();
  }

  const titles={
    atlas:'Teams & worlds',
    storylines:'Storylines & events'
  };

  if(titles[id]){
    $('#breadcrumb-current').textContent=titles[id];
  }
};

$('#atlas-universe-filter').addEventListener('change',renderAtlas);

document.querySelectorAll('[data-story-tab]').forEach(button=>{
  button.addEventListener('click',()=>{
    document.querySelectorAll('[data-story-tab]').forEach(x=>x.classList.toggle('active',x===button));

    const events=button.dataset.storyTab==='events';

    $('#storyline-grid').hidden=events;
    $('#event-grid').hidden=!events;

    if(events)renderEvents();
  });
});

document.addEventListener('click',e=>{
  const eventButton=e.target.closest('[data-event-jump]');

  if(eventButton){
    showPage('storylines');
    document.querySelector('[data-story-tab="events"]').click();

    const record=state.events.find(x=>x.id===eventButton.dataset.eventJump);

    $('#global-search').value=record?.title||'';
    state.query=record?.title||'';

    renderEvents();
  }
});

loadAtlasCatalog();

const shelfBeforeUniverse=renderShelf;

renderShelf=function(){
  shelfBeforeUniverse();
  renderSavedUniverse();

  const count=state.shelf.filter(x=>
    state.shelfMode==='all'||x.itemType===state.shelfMode
  ).length;

  $('#shelf-empty').hidden=count>0;
};

// ============================================
// PANELVERSE 3.0 — READER IDENTITY
// ============================================

function updateReaderIdentity(reader){
  const displayName=reader?.name?.trim()||'Guest reader';

  const nameNode=document.querySelector('.profile b');
  const statusNode=document.querySelector('.profile small');
  const avatarNode=document.querySelector('.profile .avatar');
  const signInLink=document.querySelector('.top-actions a[href="/login"]');

  if(nameNode)nameNode.textContent=displayName;
  if(statusNode)statusNode.textContent=reader?'PanelVerse account':'Guest browsing';
  if(avatarNode)avatarNode.textContent=reader?initials(displayName):'G';

  if(signInLink)signInLink.hidden=Boolean(reader);
}

async function loadReaderProfiles(){
  try{
    const r=await api('/api/profiles');
    const select=$('#profile-select');

    if(!Array.isArray(r.data)||!r.data.length){
      select.innerHTML='<option value="guest">Guest browsing</option>';
      select.value='guest';
      currentOwner='guest';

      updateReaderIdentity(null);

      ['#export-library','#import-library','#sign-out'].forEach(selector=>{
        const el=$(selector);
        if(el)el.hidden=true;
      });

      return;
    }

    const reader=r.data[0];

    select.innerHTML=r.data
      .map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join('');

    currentOwner='local';
    select.value=currentOwner;

    updateReaderIdentity(reader);

    ['#export-library','#import-library','#sign-out'].forEach(selector=>{
      const el=$(selector);
      if(el)el.hidden=false;
    });
  }catch(error){
    toast('Reader profiles could not be loaded');
  }
}

async function switchReaderProfile(id){
  currentOwner=id;
  localStorage.setItem('panelverse-profile',id);

  try{
    const [s,p]=await Promise.all([
      api('/api/shelf?owner='+encodeURIComponent(id)),
      api('/api/progress?owner='+encodeURIComponent(id))
    ]);

    state.shelf=s.data;
    state.progress=p.data;

    renderAll();
    toast('Reader profile switched');
  }catch(error){
    toast(error.message);
  }
}

$('#profile-select').addEventListener('change',()=>{
  switchReaderProfile('local');
});

$('#export-library').addEventListener('click',async()=>{
  try{
    const backup=await api('/api/backup?owner='+encodeURIComponent(currentOwner));

    const blob=new Blob(
      [JSON.stringify(backup,null,2)],
      {type:'application/json'}
    );

    const link=document.createElement('a');
    const url=URL.createObjectURL(blob);

    link.href=url;
    link.download=`panelverse-${currentOwner}-backup.json`;
    link.click();

    URL.revokeObjectURL(url);

    toast('Library backup downloaded');
  }catch(error){
    toast(error.message);
  }
});

$('#import-library').addEventListener('click',()=>{
  $('#import-file').click();
});

$('#import-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];
  if(!file)return;

  try{
    const backup=JSON.parse(await file.text());

    const result=await api('/api/backup',{
      method:'POST',
      body:JSON.stringify({...backup,owner:currentOwner})
    });

    await switchReaderProfile(currentOwner);

    toast(`Imported ${result.shelfCount} saved items and ${result.progressCount} reading records`);
  }catch(error){
    toast(error.message||'This backup could not be imported');
  }finally{
    e.target.value='';
  }
});

function setupCharacterCompare(){
  const left=$('#compare-left');
  const right=$('#compare-right');

  if(!left||!right)return;

  const options=state.characters
    .map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.universe)}</option>`)
    .join('');

  left.innerHTML=options;
  right.innerHTML=options;

  left.value=state.characters.some(p=>p.id==='spider-man')
    ?'spider-man'
    :state.characters[0]?.id||'';

  right.value=state.characters.some(p=>p.id==='batman')
    ?'batman'
    :state.characters[1]?.id||'';

  left.addEventListener('change',renderCharacterCompare);
  right.addEventListener('change',renderCharacterCompare);

  renderCharacterCompare();
}

function renderCharacterCompare(){
  const a=state.characters.find(p=>p.id===$('#compare-left').value);
  const b=state.characters.find(p=>p.id===$('#compare-right').value);

  if(!a||!b)return;

  const fields=[
    ['Universe',p=>p.universe],
    ['Role',p=>p.kind],
    ['Identity',p=>p.identity],
    ['First appearance',p=>p.firstAppearance],
    ['Affiliations',p=>(p.groupAffiliations||[]).join(' · ')],
    ['Allies & connections',p=>(p.connections||[]).join(' · ')],
    ['Powers & skills',p=>(p.powers||[]).join(' · ')]
  ];

  const shared=a.powers.filter(x=>b.powers.includes(x));

  $('#compare-result').innerHTML=`
    <div class="compare-shared">
      <small>SHARED ABILITIES</small>
      <span>${shared.length?shared.map(x=>esc(x)).join(' · '):'Different strengths, different approaches'}</span>
    </div>
    <div class="compare-table">
      <div class="compare-header">
        <span>PROFILE</span>
        <b>${esc(a.name)}</b>
        <b>${esc(b.name)}</b>
      </div>
      ${fields.map(([label,get])=>`
        <div class="compare-row">
          <small>${esc(label.toUpperCase())}</small>
          <span>${esc(get(a))}</span>
          <span>${esc(get(b))}</span>
        </div>
      `).join('')}
    </div>`;
}

loadReaderProfiles();

const shelfBeforeFinalFilters=renderShelf;

renderShelf=function(){
  shelfBeforeFinalFilters();

  if(['team','world','event'].includes(state.shelfMode)){
    $('#shelf-screen').innerHTML='';
    $('#shelf-characters').innerHTML='';
    $('#shelf-comics').innerHTML='';
  }

  const visible=state.shelf.filter(x=>
    state.shelfMode==='all'||x.itemType===state.shelfMode
  ).length;

  $('#shelf-empty').hidden=visible>0;
};

const signOutButton=document.querySelector('#sign-out');

if(signOutButton){
  signOutButton.addEventListener('click',async()=>{
    try{
      await api('/api/logout',{method:'POST'});
      localStorage.removeItem('panelverse-profile');
      location.replace('/login');
    }catch(error){
      toast(error.message);
    }
  });
}

// ============================================
// PANELVERSE 3.0 — TMDB MOVIE DISCOVERY
// ============================================

const tmdbForm=document.querySelector('#tmdb-search-form');

if(tmdbForm){
  tmdbForm.addEventListener('submit',async event=>{
    event.preventDefault();

    const query=document.querySelector('#tmdb-search-input').value.trim();
    const status=document.querySelector('#tmdb-search-status');
    const results=document.querySelector('#tmdb-results');

    if(query.length<2){
      status.textContent='Enter at least two characters.';
      return;
    }

    status.textContent='Searching the live movie and TV catalog…';
    results.innerHTML='';

    try{
      const response=await api('/api/discover/tmdb?q='+encodeURIComponent(query));

      if(!response.configured){
        status.textContent='Live movie search is ready to configure. Add TMDB_API_KEY or TMDB_READ_ACCESS_TOKEN to the server environment.';
        return;
      }

      status.textContent=`${response.results.length} results · Metadata provided by TMDB`;

      results.innerHTML=response.results.map(item=>`
        <article class="screen-card">
          <div class="screen-card-art" style="${item.posterUrl?`background-image:linear-gradient(180deg,transparent,#101018),url('${esc(item.posterUrl)}');background-size:cover;background-position:center`:''}">
            <span>${esc(item.mediaType.toUpperCase())}</span>
            <b>${esc(item.year||'')}</b>
          </div>
          <div class="screen-card-body">
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.overview||'No description available.')}</p>
            <a class="publisher-link" href="${esc(item.tmdbUrl)}" target="_blank" rel="noreferrer">View source ↗</a>
          </div>
        </article>
      `).join('')||'<p>No matching titles found.</p>';
    }catch(error){
      status.textContent=error.message||'Live search is unavailable.';
    }
  });
}