(async () => {
  let S = await SF.get(); SF.applyPrefs(S.settings); await SF.bind(document);
  const sync = async () => {
    const old = S.settings; S = await SF.get();
    if (old.lang !== S.settings.lang || old.theme !== S.settings.theme) SF.applyPrefs(S.settings);
    SF.fill(document, S); renderChannels(); document.getElementById('lock').hidden = !SF.locked(S); document.getElementById('wipe').disabled = SF.locked(S);
  };
  const $ = id => document.getElementById(id);
  function renderChannels() {
    const ul = $('chlist'), list = S.settings.blockedChannels || [], lock = SF.locked(S); ul.innerHTML = '';
    if (!list.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = SF.tr('No blocked channels yet.'); ul.append(li); }
    list.forEach((c, i) => {
      const li = document.createElement('li'), x = document.createElement('button'); li.className = 'chip2'; li.dir = 'ltr'; li.append(c.label + ' ');
      x.className = 'ib'; x.textContent = '✕'; x.title = x.ariaLabel = SF.tr('Remove'); x.disabled = lock;   // removing is locked during Strict sessions, adding never is
      x.onclick = () => SF.patchSettings(s => { s.blockedChannels = s.blockedChannels.filter((_, k) => k !== i); }); li.append(x); ul.append(li);
    });
    $('chin').placeholder = SF.tr('Channel @handle or link');
  }
  async function addChannel() {
    const ch = SF.parseChannel($('chin').value); $('chmsg').textContent = '';
    if (!ch) { $('chmsg').textContent = SF.tr('Unrecognized channel. Use @handle or a YouTube channel link.'); return; }
    if (SF.channelKnown(S, ch)) { $('chmsg').textContent = SF.tr('Already blocked'); return; }
    $('chin').value = ''; await SF.patchSettings(s => { s.blockedChannels = [...(s.blockedChannels || []), ch]; });
  }
  $('chadd').onclick = addChannel; $('chin').onkeydown = e => { if (e.key === 'Enter') addChannel(); };
  chrome.storage.onChanged.addListener(sync); sync();
  document.getElementById('wipe').onclick = async () => {
    if (!confirm(SF.tr('Delete statistics, tasks and notes?'))) return;
    await chrome.storage.local.set({ stats: { days: {} }, tasks: [], notes: '', currentTaskId: null });
  };
})();
