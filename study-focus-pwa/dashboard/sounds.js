/* Sounds page: built-in synthesized ambience + optional real recordings from Freesound (free API key).
   The audio itself plays in the offscreen document; this page only edits settings.sound and soundState. */
const FS_ORIGIN = 'https://freesound.org/*', FS_API = 'https://freesound.org/apiv2/search/text/';
let sndBuilt = false, savePend, preview = null, previewId = null, pendFns = [];
const sndCtl = {};   // id -> { card, range }

const snd = () => S.settings.sound;
// Edits are idempotent functions: applied locally at once, written to storage (debounced), and re-applied after any reload
// so a storage event in between can never wipe an unsaved change.
const flush = () => { clearTimeout(savePend); const fns = pendFns; pendFns = []; return fns.length ? SF.patchSettings(s => fns.forEach(f => f(s.sound))) : Promise.resolve(); };
function edit(fn, now) { fn(snd()); pendFns.push(fn); clearTimeout(savePend); if (now) return flush(); savePend = setTimeout(flush, 150); }
const setPlaying = on => chrome.storage.local.set({ soundState: { playing: on } });
const licenseName = l => { const m = /licenses\/([a-z-]+)\//.exec(l || ''); return m ? 'CC ' + m[1].toUpperCase() : /zero|publicdomain/.test(l || '') ? 'CC0' : (l || '').slice(0, 24); };

function buildSounds() {
  sndBuilt = true;
  const grid = $('sgrid'), pr = $('spresets');
  SF.SOUNDS.forEach(s => {
    const card = el('div', 'snd'), top = el('div', 'top'), name = el('span', '', tr(s.name)), ic = el('span', 'ic', s.icon), range = el('input');
    range.type = 'range'; range.min = 0; range.max = 1; range.step = 0.01; range.ariaLabel = tr(s.name);
    range.oninput = () => { card.classList.toggle('on', +range.value > 0); edit(sn => { sn.mix[s.id] = +range.value; }); };
    const l = el('span', '', ''); l.append(ic, ' ', name); top.append(l); card.append(top, range); grid.append(card); sndCtl[s.id] = { card, range };
  });
  SF.PRESETS.forEach(p => { const b = el('button', 'chip2', `${p.icon} ${tr(p.name)}`);
    b.onclick = async () => { await edit(sn => { sn.mix = { ...p.mix }; }, true); await setPlaying(true); }; pr.append(b); });
  $('splay').onclick = async () => {
    if (!S.soundState.playing && !SF.hasMix(snd())) await edit(sn => { sn.mix = { ...SF.PRESETS[0].mix }; }, true);
    await setPlaying(!S.soundState.playing);
  };
  $('smaster').oninput = () => { const v = +$('smaster').value; edit(sn => { sn.master = v; }); };
  $('sauto').onchange = () => { const v = $('sauto').checked; edit(sn => { sn.auto = v; }, true); };
  $('schime').onchange = () => { const v = $('schime').checked; edit(sn => { sn.chime = v; }, true); };
  $('fssave').onclick = () => { const v = $('fskey').value.trim(); edit(sn => { sn.fsKey = v; }, true); $('fsmsg').textContent = '✓'; };
  $('fsgo').onclick = fsSearch; $('fsq').onkeydown = e => { if (e.key === 'Enter') fsSearch(); };
}

function renderSounds() {
  if (!S || $('v-sounds').hidden) return;
  if (!sndBuilt) buildSounds();
  pendFns.forEach(f => f(snd()));
  const sn = snd(), playing = S.soundState.playing && SF.hasMix(sn), act = document.activeElement;
  $('splay').textContent = '🎧 ' + tr(playing ? 'Stop sounds' : 'Play sounds');
  if (act !== $('smaster')) $('smaster').value = sn.master;
  $('sauto').checked = !!sn.auto; $('schime').checked = !!sn.chime;
  if (act !== $('fskey')) $('fskey').value = sn.fsKey || '';
  SF.SOUNDS.forEach(s => { const c = sndCtl[s.id], v = sn.mix[s.id] || 0; if (act !== c.range) c.range.value = v; c.card.classList.toggle('on', v > 0); });
  renderMine();
}

function renderMine() {
  const ul = $('fsmine'), list = snd().custom || []; $('fsmine-h').hidden = !list.length;
  if (ul.contains(document.activeElement)) { list.forEach(c => { const r = ul.querySelector(`[data-id="${c.id}"]`); if (r && r !== document.activeElement) r.value = c.vol; }); if (ul.children.length === list.length) return; }
  ul.innerHTML = '';
  list.forEach(c => {
    const li = el('li', 'fsr'), body = el('div', 'tb'), r = el('input'), x = el('button', 'ib', '✕');
    body.append(el('div', 'tt', c.name), el('div', 'muted', `${tr('by')} ${c.user} · ${c.license}`));
    r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.01; r.value = c.vol; r.dataset.id = c.id; r.oninput = () => { const v = +r.value; edit(sn => { const k = sn.custom.find(z => z.id === c.id); if (k) k.vol = v; }); };
    x.title = x.ariaLabel = tr('Remove'); x.onclick = () => edit(sn => { sn.custom = sn.custom.filter(k => k.id !== c.id); }, true);
    li.append(body, r, x); ul.append(li);
  });
}

function stopPreview() { if (preview) { preview.pause(); preview = null; previewId = null; } document.querySelectorAll('.fsr .pv').forEach(b => b.textContent = '▶'); }

async function fsSearch() {
  const msg = $('fsmsg'), ul = $('fsres'), q = $('fsq').value.trim(), key = ($('fskey').value || snd().fsKey || '').trim();
  if (!q) return; if (!key) { msg.textContent = tr('API key'); $('fskey').focus(); return; }
  if (key !== snd().fsKey) edit(sn => { sn.fsKey = key; }, true);
  stopPreview(); ul.innerHTML = ''; msg.textContent = tr('Searching…');
  try {
    if (!(await chrome.permissions.contains({ origins: [FS_ORIGIN] })) && !(await chrome.permissions.request({ origins: [FS_ORIGIN] }))) { msg.textContent = tr('Permission to contact freesound.org was not granted.'); return; }
    const url = `${FS_API}?query=${encodeURIComponent(q)}&filter=${encodeURIComponent('duration:[15 TO 900]')}&sort=rating_desc&page_size=15&fields=id,name,username,duration,license,previews&token=${encodeURIComponent(key)}`;
    const r = await fetch(url); if (!r.ok) throw new Error(r.status);
    const data = await r.json(), rows = (data.results || []).filter(x => x.previews && (x.previews['preview-hq-mp3'] || x.previews['preview-lq-mp3']));
    msg.textContent = rows.length ? '' : tr('No results');
    rows.forEach(x => {
      const src = x.previews['preview-hq-mp3'] || x.previews['preview-lq-mp3'], have = (snd().custom || []).some(c => c.id === 'fs' + x.id);
      const li = el('li', 'fsr'), body = el('div', 'tb'), pv = el('button', 'ib pv', '▶'), add = el('button', 'btn', have ? '✓' : '+');
      body.append(el('div', 'tt', x.name), el('div', 'muted', `${tr('by')} ${x.username} · ${Math.round(x.duration)}s · ${licenseName(x.license)}`));
      pv.title = pv.ariaLabel = tr('Preview'); add.title = add.ariaLabel = tr('Add to mix'); add.disabled = have;
      pv.onclick = () => { if (previewId === x.id) return stopPreview(); stopPreview(); preview = new Audio(src); preview.volume = 0.7; preview.play().catch(() => {}); previewId = x.id; pv.textContent = '■'; preview.onended = stopPreview; };
      add.onclick = () => { stopPreview(); edit(sn => { if (!sn.custom.some(z => z.id === 'fs' + x.id)) sn.custom = [...sn.custom, { id: 'fs' + x.id, name: x.name, user: x.username, license: licenseName(x.license), url: src, vol: 0.5 }]; }, true); add.textContent = '✓'; add.disabled = true; };
      li.append(body, pv, add); ul.append(li);
    });
  } catch (e) { msg.textContent = tr('Search failed. Check your key and connection.'); }
}
