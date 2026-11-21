// Chrome loads this as a service worker; Firefox (incl. Android) loads it as a background script with core.js + sounds.js listed in its manifest.
if (typeof importScripts === 'function') importScripts('../shared/core.js');
const HAS_WIN = !!(chrome.windows && chrome.windows.create), HAS_OFF = !!chrome.offscreen;   // no pop-up windows / offscreen documents on Firefox

let q = Promise.resolve();
const run = fn => { const p = q.then(fn); q = p.catch(() => {}); return p; };
const save = o => chrome.storage.local.set(o);

async function _addDay(delta) {
  const S = await SF.get(), k = SF.dayKey(), d = S.stats.days[k] || { ms: 0, poms: 0, attempts: 0 };
  for (const x in delta) d[x] = (d[x] || 0) + delta[x];
  S.stats.days[k] = d; await save({ stats: S.stats });
}
const p2 = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
// Adds a study span to the day totals, split per hour (for the "peak hours" chart) and credited to the current task.
async function _addSpan(from, to, taskId) {
  if (!(to > from)) return;
  const S = await SF.get(); let a = from, guard = 0;
  while (a < to && guard++ < 200) {
    const d = new Date(a), b = Math.min(to, new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()), k = keyOf(d);
    const day = S.stats.days[k] || { ms: 0, poms: 0, attempts: 0 }; day.hours = day.hours || {};
    day.ms = (day.ms || 0) + (b - a); day.hours[d.getHours()] = (day.hours[d.getHours()] || 0) + (b - a); S.stats.days[k] = day; a = b;
  }
  const tk = taskId && S.tasks.find(x => x.id === taskId); if (tk) tk.ms = (tk.ms || 0) + (to - from);
  await save(tk ? { stats: S.stats, tasks: S.tasks } : { stats: S.stats });
}
async function bank(t) {
  if (t.phase === 'study' && t.running) {
    const n = Math.min(Date.now(), t.endsAt);
    if (n > t.lastTick) await _addSpan(t.lastTick, n, t.taskId);
    t.lastTick = n;
  }
}
const badge = on => { try { if (chrome.action) { chrome.action.setBadgeBackgroundColor({ color: '#8c2347' }); chrome.action.setBadgeText({ text: on ? 'ON' : '' }); } } catch (e) {} };
async function setTimer(t) {
  const prev = (await SF.get()).timer;
  await save({ timer: t });
  chrome.alarms.clear('comeback');
  if (t.running) chrome.alarms.create('end', { when: t.endsAt }); else chrome.alarms.clear('end');
  badge(SF.focusActive(t));
  // Mini window: opens with a new session, and closes again when the session ends (only if it was opened automatically).
  if (prev.phase === 'idle' && t.phase === 'study' && (await SF.get()).settings.mini.auto) await openMini(false, true);
  else if (prev.phase !== 'idle' && t.phase === 'idle') await closeMini(true);
  // Ambient sounds follow the study phase (only when the user enabled it and has a mix chosen).
  const was = prev.running && prev.phase === 'study', is = t.running && t.phase === 'study';
  if (was !== is) {
    const sn = (await SF.get()).settings.sound;
    if (sn.auto && (!is || SF.hasMix(sn))) { await save({ soundState: { playing: is } }); await applySound(); }
  }
}

// ---- Mini window (timer + tasks), a small popup window placed near the top-right corner of the current browser window.
async function openMini(focus, auto) {
  if (!HAS_WIN) return;
  const { miniWin } = await chrome.storage.session.get('miniWin');
  if (miniWin) { try { await chrome.windows.get(miniWin); if (focus) await chrome.windows.update(miniWin, { focused: true }); return; } catch (e) {} }
  const W = 320, H = 500; let left, top;
  try { const l = await chrome.windows.getLastFocused(); if (l.width) { left = Math.max(0, (l.left || 0) + l.width - W - 24); top = (l.top || 0) + 90; } } catch (e) {}
  const opts = { url: chrome.runtime.getURL('widget/widget.html'), type: 'popup', width: W, height: H, focused: !!focus };
  let w; try { w = await chrome.windows.create({ ...opts, left, top }); } catch (e) { w = await chrome.windows.create(opts); }   // saved position may be off-screen (multi-monitor): fall back to the default spot
  await chrome.storage.session.set({ miniWin: w.id, miniAuto: !!auto });
}
async function closeMini(onlyAuto) {
  if (!HAS_WIN) return;
  const { miniWin, miniAuto } = await chrome.storage.session.get(['miniWin', 'miniAuto']);
  if (!miniWin || (onlyAuto && !miniAuto)) return;
  await chrome.storage.session.remove(['miniWin', 'miniAuto']); chrome.windows.remove(miniWin).catch(() => {});
}
if (HAS_WIN) chrome.windows.onRemoved.addListener(id => run(async () => { if ((await chrome.storage.session.get('miniWin')).miniWin === id) await chrome.storage.session.remove(['miniWin', 'miniAuto']); }));

// ---- Ambient sounds: the audio lives in an offscreen document; this worker owns the state and pushes it there.
let chimeUntil = 0;
const hasOffscreen = async () => (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length > 0;
async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({ url: 'offscreen/offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Play ambient study sounds while the popup is closed.' });
}
const toOffscreen = m => chrome.runtime.sendMessage({ target: 'offscreen', ...m }).catch(() => {});
async function applySound() {
  const S = await SF.get(), sn = S.settings.sound, playing = !!S.soundState.playing && SF.hasMix(sn);
  const state = { playing, master: sn.master, mix: sn.mix, custom: sn.custom };
  if (!HAS_OFF) { await SFAudio.apply(state); return; }   // Firefox: the background page plays the audio itself
  if (playing) { await ensureOffscreen(); await toOffscreen({ type: 'state', state }); }
  else if (await hasOffscreen()) { await toOffscreen({ type: 'state', state }); if (Date.now() > chimeUntil) await chrome.offscreen.closeDocument().catch(() => {}); }
}
async function chime() {
  const S = await SF.get(); if (!S.settings.sound.chime) return;
  if (!HAS_OFF) { await SFAudio.chime(); return; }
  chimeUntil = Date.now() + 5000; await ensureOffscreen(); await toOffscreen({ type: 'chime' });
  setTimeout(() => run(async () => { const S2 = await SF.get(); if (!S2.soundState.playing && await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {}); }), 31000);
}
async function notify(titleKey, msgKey, kind) {
  const S = await SF.get(); SF.setLang(S.settings.lang);
  if (!S.settings.notif[kind]) return;
  if (!chrome.notifications) return;   // not available in Firefox for Android: the soft chime and the badge are the cues there
  chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'), title: SF.tr(titleKey), message: SF.tr(msgKey) });
}
async function start(o) {
  const S = await SF.get();
  if (SF.locked(S)) return { error: 'strict' };
  await bank(S.timer);
  const now = Date.now(), ms = Math.round(o.study * 60000), focus = o.focus === undefined ? S.settings.autoBlock : !!o.focus;
  await setTimer({ ...SF.DEF.timer, phase: 'study', running: true, totalMs: ms, remainingMs: ms, endsAt: now + ms, lastTick: now,
    focus, strict: focus && S.settings.strict, brkMin: o.brk || 0, taskId: S.currentTaskId });
  return { ok: true };
}
async function pause() {
  const S = await SF.get(), t = S.timer;
  if (SF.locked(S)) return { error: 'strict' };
  if (!t.running) return {};
  await bank(t); t.remainingMs = Math.max(0, t.endsAt - Date.now()); t.running = false;
  await setTimer(t);
  if (t.phase === 'study' && S.settings.notif.comeback) chrome.alarms.create('comeback', { delayInMinutes: 10 });
  return { ok: true };
}
async function resume() {
  const t = (await SF.get()).timer;
  if (t.running || t.phase === 'idle') return {};
  const now = Date.now(); t.running = true; t.endsAt = now + t.remainingMs; t.lastTick = now;
  await setTimer(t); return { ok: true };
}
async function reset() {
  const S = await SF.get();
  if (SF.locked(S)) return { error: 'strict' };
  await bank(S.timer); await setTimer({ ...SF.DEF.timer }); return { ok: true };
}
async function settle() {
  const S = await SF.get(), t = S.timer;
  if (!t.running || Date.now() < t.endsAt) return;
  const now = Date.now();
  if (t.phase === 'study') {
    await bank(t); await _addDay({ poms: 1 });
    if (t.taskId) { const tk = S.tasks.find(x => x.id === t.taskId); if (tk) { tk.pomodoros = (tk.pomodoros || 0) + 1; await save({ tasks: S.tasks }); } }
    notify('Great job! You completed a study session.', 'Break time starts now.', 'end'); await chime();
    if (t.brkMin > 0) { const b = t.brkMin * 60000;
      await setTimer({ ...SF.DEF.timer, phase: 'break', running: true, totalMs: b, remainingMs: b, endsAt: now + b, lastTick: now });
    } else await setTimer({ ...SF.DEF.timer });
  } else {
    notify('Break is over', 'Time to get back to studying.', 'breakEnd'); await chime();
    await setTimer({ ...SF.DEF.timer });
  }
}
async function syncAlarms() {
  const S = await SF.get();
  if (S.settings.notif.reminder) chrome.alarms.create('reminder', { periodInMinutes: 60 }); else chrome.alarms.clear('reminder');
  badge(SF.focusActive(S.timer));
}

chrome.runtime.onMessage.addListener((m, sender, send) => {
  run(async () => {
    switch (m.type) {
      case 'start': return start(m);
      case 'pause': return pause();
      case 'resume': return resume();
      case 'reset': return reset();
      case 'settle': return settle();
      case 'attempt': return _addDay({ attempts: 1 });
      case 'offscreen-ready': return applySound();
      case 'mini': return openMini(true, false);
      case 'back': if (sender.tab) chrome.tabs.update(sender.tab.id, { url: chrome.runtime.getURL('dashboard/dashboard.html') }); return {};
    }
  }).then(r => send(r || {}), () => send({}));
  return true;
});
chrome.alarms.onAlarm.addListener(a => run(async () => {
  if (a.name === 'end') return settle();
  const t = (await SF.get()).timer;
  if (a.name === 'comeback' && !t.running && t.phase === 'study') return notify('Come back', 'Your session is paused. Ready to continue?', 'comeback');
  if (a.name === 'reminder' && !t.running) return notify('Time to study', 'Ready for a focus session?', 'reminder');
}));
chrome.storage.onChanged.addListener(c => { if (c.settings) run(syncAlarms); if (c.settings || c.soundState) run(applySound); });
// The offscreen document does not survive a browser restart or an extension reload, so sounds always start stopped.
const boot = () => run(async () => { await save({ soundState: { playing: false } }); await syncAlarms(); await settle(); });
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);

// Website Blocker: only while a Focus Mode session is running.
chrome.webNavigation.onBeforeNavigate.addListener(d => run(async () => {
  if (d.frameId !== 0) return;
  let u; try { u = new URL(d.url); } catch { return; }
  if (!/^https?:$/.test(u.protocol)) return;
  const S = await SF.get();
  if (!SF.focusActive(S.timer)) return;
  const host = u.hostname.replace(/^www\./, '');
  const dom = SF.hostMatch(host, S.settings.blockedSites);
  if (!dom || SF.hostMatch(host, S.settings.excludedSites)) return;
  if ((S.bypass['site:' + dom] || 0) > Date.now()) return;
  await _addDay({ attempts: 1 });
  chrome.tabs.update(d.tabId, { url: chrome.runtime.getURL('blocked/blocked.html') + '?u=' + encodeURIComponent(d.url) });
}), { url: [{ schemes: ['http', 'https'] }] });
