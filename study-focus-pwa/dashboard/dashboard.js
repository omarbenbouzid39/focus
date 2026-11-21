const $ = id => document.getElementById(id), tr = SF.tr;
let S, customP = false, customF = false, settling = 0, peek = false;
const send = async m => { const r = await chrome.runtime.sendMessage(m); if (r && r.error) alert(tr('Strict Mode is on: this session cannot be stopped.')); };
const reload = async () => { S = await SF.get(); };
const poms = k => (S.stats.days[k] || {}).poms || 0;

function nav(v) {
  if (!document.getElementById('v-' + v)) v = 'home';
  document.querySelectorAll('.view').forEach(e => e.hidden = e.id !== 'v-' + v);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  history.replaceState(null, '', '#' + v); renderStats(); renderSounds();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => nav(b.dataset.view));

function renderTimer() {
  const t = S.timer, n = Date.now(), lock = SF.locked(S);
  if (t.running && n >= t.endsAt && n - settling > 3000) { settling = n; chrome.runtime.sendMessage({ type: 'settle' }); }
  const rem = t.phase === 'idle' ? S.settings.study * 60000 : SF.remaining(t, n);
  const hide = S.settings.hideTime && t.phase !== 'idle' && !peek;   // numbers, progress bar and tab title all stay quiet while hidden
  $('time').textContent = hide ? '••:••' : SF.fmt(rem); $('time').classList.toggle('hid', hide);
  document.title = (t.phase === 'idle' || hide ? '' : SF.fmt(rem) + ' · ') + 'Study Focus';
  $('hint').hidden = !(S.settings.hideTime && t.phase !== 'idle'); $('hint').textContent = tr('Time is hidden. Hold to peek.');
  $('mini').hidden = !(chrome.windows && chrome.windows.create);
  $('mini').title = $('mini').ariaLabel = tr('Open mini window');
  $('eye').setAttribute('aria-pressed', S.settings.hideTime); $('eye').title = $('eye').ariaLabel = tr(S.settings.hideTime ? 'Show time' : 'Hide time'); $('eye').textContent = S.settings.hideTime ? '🙈' : '👁';
  $('phase').textContent = tr(t.phase === 'study' ? 'Study' : t.phase === 'break' ? 'Break' : 'Ready') + (SF.focusActive(t, n) ? ' · 🎯' : '');
  $('tbar').parentElement.style.visibility = hide ? 'hidden' : '';
  $('tbar').style.width = (t.phase === 'idle' || !t.totalMs ? 0 : 100 - rem / t.totalMs * 100) + '%';
  $('start').textContent = t.running ? tr('Pause') : t.phase !== 'idle' ? tr('Resume') : tr('Start');
  $('start').disabled = lock; $('reset').disabled = lock; $('quick').disabled = lock;
  const ms = SF.dayMs(S, SF.dayKey()), goal = S.settings.goalMin * 60000;
  $('hp').textContent = poms(SF.dayKey()); $('hs').textContent = SF.dur(ms);
  $('gtxt').textContent = SF.dur(ms) + ' / ' + SF.dur(goal); $('gbar').style.width = Math.min(100, ms / goal * 100) + '%';
  const fa = SF.focusActive(t, n);
  $('fstart').textContent = fa ? tr('Stop') : tr('Start Focus Mode'); $('fstart').disabled = lock;
  $('fstat').textContent = fa ? tr('Focus session in progress') + (hide ? '' : ' · ' + SF.fmt(rem)) : '';
  const sk = SF.streak(S); $('chip').textContent = '🔥 ' + sk;
}
function renderPresets() {
  const { study, brk, focusMin } = S.settings, pv = study === 25 && brk === 5 ? '25' : study === 50 && brk === 10 ? '50' : 'custom';
  if (pv === 'custom') customP = true;
  $('preset').value = customP ? 'custom' : pv; $('custom').hidden = !customP;
  const fv = [25, 50, 90].includes(focusMin) ? String(focusMin) : 'custom';
  if (fv === 'custom') customF = true;
  $('fdur').value = customF ? 'custom' : fv; $('fcustom').hidden = !customF;
}
$('preset').onchange = () => { const v = $('preset').value; customP = v === 'custom';
  if (!customP) SF.patchSettings(s => { s.study = +v; s.brk = v === '25' ? 5 : 10; }); else renderPresets(); };
$('fdur').onchange = () => { const v = $('fdur').value; customF = v === 'custom'; if (!customF) SF.patchSettings(s => { s.focusMin = +v; }); else renderPresets(); };
$('start').onclick = () => { const t = S.timer;
  send(t.running ? { type: 'pause' } : t.phase !== 'idle' ? { type: 'resume' } : { type: 'start', study: S.settings.study, brk: S.settings.brk }); };
$('reset').onclick = () => send({ type: 'reset' });
$('mini').onclick = () => chrome.runtime.sendMessage({ type: 'mini' });
$('eye').onclick = () => SF.patchSettings(s => { s.hideTime = !s.hideTime; });
const peekOn = () => { peek = true; renderTimer(); }, peekOff = () => { if (peek) { peek = false; renderTimer(); } };
$('time').onpointerdown = peekOn; ['pointerup', 'pointerleave', 'pointercancel'].forEach(e => $('time').addEventListener(e, peekOff));
$('quick').onclick = () => send({ type: 'start', study: S.settings.study, brk: S.settings.brk, focus: true });
$('fstart').onclick = () => send(SF.focusActive(S.timer) ? { type: 'reset' } : { type: 'start', study: S.settings.focusMin, brk: 0, focus: true });

// ---- Tasks
const upd = async (id, fn) => { const t = S.tasks.find(x => x.id === id); if (t) { fn(t); await chrome.storage.local.set({ tasks: S.tasks }); } };
function renderTasks() {
  const ul = $('tasks'), ord = { high: 0, med: 1, low: 2 }; ul.innerHTML = '';
  [...S.tasks].sort((a, b) => (a.done - b.done) || (ord[a.pri] - ord[b.pri])).forEach(t => {
    const li = document.createElement('li'); li.className = 'task' + (t.done ? ' done' : '') + (t.id === S.currentTaskId ? ' cur' : '');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = t.done; cb.onchange = () => upd(t.id, x => x.done = cb.checked);
    const body = document.createElement('div'); body.className = 'tb';
    const title = document.createElement('span'); title.className = 'tt'; title.textContent = t.title; body.append(title);
    if (t.target) {
      const m = document.createElement('div'); m.className = 'muted'; m.textContent = `${t.pomodoros || 0}/${t.target} ${tr('Sessions target')}`;
      const bar = document.createElement('div'); bar.className = 'bar'; const i = document.createElement('i'); i.style.width = Math.min(100, (t.pomodoros || 0) / t.target * 100) + '%'; bar.append(i); body.append(m, bar);
    }
    const pri = document.createElement('span'); pri.className = 'pri ' + t.pri; pri.textContent = tr({ high: 'High', med: 'Medium', low: 'Low' }[t.pri]);
    const mk = (txt, label, fn) => { const b = document.createElement('button'); b.className = 'ib'; b.textContent = txt; b.title = b.ariaLabel = label; b.onclick = fn; return b; };
    li.append(cb, body, pri,
      mk('🎯', tr('Current task'), () => chrome.storage.local.set({ currentTaskId: t.id })),
      mk('✎', tr('Edit task'), () => { const v = prompt(tr('Edit task'), t.title); if (v && v.trim()) upd(t.id, x => x.title = v.trim()); }),
      mk('✕', tr('Delete'), async () => { S.tasks = S.tasks.filter(x => x.id !== t.id); await chrome.storage.local.set({ tasks: S.tasks, ...(S.currentTaskId === t.id ? { currentTaskId: null } : {}) }); }));
    ul.append(li);
  });
  const sel = $('cur'); sel.innerHTML = '';
  const o0 = new Option(tr('No task selected'), ''); sel.add(o0);
  S.tasks.filter(t => !t.done).forEach(t => sel.add(new Option(t.title, t.id)));
  sel.value = S.tasks.some(t => t.id === S.currentTaskId && !t.done) ? S.currentTaskId : '';
}
$('cur').onchange = () => chrome.storage.local.set({ currentTaskId: $('cur').value || null });
async function addTask() {
  const v = $('tt').value.trim(); if (!v) return;
  S.tasks.push({ id: 't' + Date.now(), title: v, pri: $('tp').value, target: Math.max(0, +$('tn').value || 0), pomodoros: 0, done: false });
  $('tt').value = ''; await chrome.storage.local.set({ tasks: S.tasks });
}
$('ta').onclick = addTask; $('tt').onkeydown = e => { if (e.key === 'Enter') addTask(); };
let nt; $('notes').oninput = () => { clearTimeout(nt); nt = setTimeout(() => chrome.storage.local.set({ notes: $('notes').value }), 400); };

function renderAll() { renderTimer(); renderPresets(); renderTasks(); renderStats(); renderSounds(); SF.fill(document, S); }
(async () => {
  await reload(); SF.applyPrefs(S.settings); await SF.bind(document); $('notes').value = S.notes;
  nav(location.hash.slice(1) || 'home'); renderAll(); setInterval(renderTimer, 500);
  chrome.storage.onChanged.addListener(async () => { const o = S.settings; await reload(); if (o.lang !== S.settings.lang || o.theme !== S.settings.theme) SF.applyPrefs(S.settings); renderAll(); });
})();
