/* Study Focus PWA runtime. The extension code (background/service-worker.js, dashboard, settings…) is reused unchanged:
   this file provides the few chrome.* APIs it needs, backed by localStorage, timers, the Notification API and the Wake Lock API. */
(() => {
  window.SF_PWA = true; document.documentElement.classList.add('pwa');
  const PFX = 'sf:', listeners = { changed: [], message: [], alarm: [], startup: [] };
  const read = k => { try { const v = localStorage.getItem(PFX + k); return v === null ? undefined : JSON.parse(v); } catch (e) { return undefined; } };
  const emit = (area, ch) => { if (Object.keys(ch).length) listeners.changed.forEach(f => { try { f(ch, area); } catch (e) { console.error(e); } }); };
  // The extension's async storage never answers before the page's scripts have all run; keep that guarantee.
  const ready = new Promise(r => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', () => r(), { once: true }) : r());
  const area = (store, name) => ({
    async get(keys) {
      await ready; const all = store.all(), out = {};
      if (keys == null) return { ...all };
      if (typeof keys === 'string') keys = [keys];
      if (Array.isArray(keys)) keys.forEach(k => { if (k in all) out[k] = all[k]; });
      else Object.keys(keys).forEach(k => { out[k] = k in all ? all[k] : keys[k]; });
      return JSON.parse(JSON.stringify(out));
    },
    async set(o) { await ready; const ch = {}; for (const k in o) { const old = store.all()[k], nv = JSON.parse(JSON.stringify(o[k])); store.put(k, nv); ch[k] = { oldValue: old, newValue: nv }; } emit(name, ch); },
    async remove(keys) { await ready; const ch = {}; [].concat(keys).forEach(k => { const old = store.all()[k]; if (old !== undefined) { store.del(k); ch[k] = { oldValue: old }; } }); emit(name, ch); }
  });
  const local = { all() { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(PFX)) o[k.slice(PFX.length)] = read(k.slice(PFX.length)); } return o; },
    put: (k, v) => localStorage.setItem(PFX + k, JSON.stringify(v)), del: k => localStorage.removeItem(PFX + k) };
  const mem = {}, session = { all: () => ({ ...mem }), put: (k, v) => { mem[k] = v; }, del: k => { delete mem[k]; } };
  // other tabs / the installed app window writing to the same storage
  addEventListener('storage', e => { if (e.key && e.key.startsWith(PFX)) { const k = e.key.slice(PFX.length); emit('local', { [k]: { oldValue: e.oldValue ? JSON.parse(e.oldValue) : undefined, newValue: e.newValue ? JSON.parse(e.newValue) : undefined } }); } });

  // ---- alarms: timers while the page is alive, plus a due-check when the page wakes up (phones freeze background pages)
  const alarms = {};
  const arm = (name, a) => { alarms[name] = a; };
  const fire = name => { const a = alarms[name]; if (!a) return; if (a.period) a.when += a.period; else delete alarms[name]; listeners.alarm.forEach(f => f({ name })); };
  const due = () => Object.keys(alarms).forEach(n => { if (alarms[n] && alarms[n].when <= Date.now()) fire(n); });
  setInterval(due, 1000); document.addEventListener('visibilitychange', due); addEventListener('focus', due); addEventListener('pageshow', due);

  // ---- notifications (through the PWA service worker on Android, where `new Notification` is not allowed)
  const showNote = async o => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body: o.message, icon: new URL('../assets/icons/icon-192.png', location.href).href, tag: 'study-focus', renotify: true };
    try { const r = await navigator.serviceWorker.ready; await r.showNotification(o.title, opts); } catch (e) { try { new Notification(o.title, opts); } catch (e2) {} }
  };
  addEventListener('pointerdown', () => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }, { once: true });

  const ok = () => Promise.resolve();
  window.chrome = {
    storage: { local: { ...area(local, 'local') }, session: { ...area(session, 'session') }, onChanged: { addListener: f => listeners.changed.push(f) } },
    runtime: {
      id: 'pwa', getURL: p => new URL('../' + p, location.href).href, openOptionsPage: () => { location.href = new URL('../settings/settings.html', location.href).href; },
      onMessage: { addListener: f => listeners.message.push(f) }, onInstalled: { addListener: () => {} }, onStartup: { addListener: f => listeners.startup.push(f) },
      sendMessage(msg, cb) {
        const p = new Promise(res => {
          let done = false; const reply = v => { if (!done) { done = true; res(v); } };
          const keep = listeners.message.map(f => { try { return f(msg, { id: 'pwa' }, reply); } catch (e) { return false; } });
          if (!keep.some(Boolean)) reply(undefined);
        }); if (cb) p.then(cb); return p;
      }
    },
    alarms: {
      create(name, i) { const now = Date.now(); const when = i.when || now + (i.delayInMinutes != null ? i.delayInMinutes : i.periodInMinutes) * 60000; arm(name, { when, period: i.periodInMinutes ? i.periodInMinutes * 60000 : 0 }); },
      clear(name) { delete alarms[name]; return Promise.resolve(true); }, onAlarm: { addListener: f => listeners.alarm.push(f) }
    },
    notifications: { create: showNote },
    action: { setBadgeText: ok, setBadgeBackgroundColor: ok },
    webNavigation: { onBeforeNavigate: { addListener: () => {} } },   // websites can't be blocked from a web app
    tabs: { create: o => { location.href = o.url; return ok(); }, update: (_id, o) => { location.href = o.url; return ok(); } },
    permissions: { contains: () => Promise.resolve(true), request: () => Promise.resolve(true) }
  };

  // ---- Screen Wake Lock: keeps the screen on while a session runs, so the end-of-session chime and the timer stay reliable
  let lock = null;
  const wantLock = () => { const t = read('timer'), s = read('settings') || {}; return !!(t && t.running) && s.keepAwake !== false; };
  async function syncLock() {
    try {
      if (wantLock() && !lock && document.visibilityState === 'visible' && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
      else if (!wantLock() && lock) { await lock.release(); lock = null; }
    } catch (e) { lock = null; }
  }
  listeners.changed.push(c => { if (c.timer || c.settings) syncLock(); }); document.addEventListener('visibilitychange', syncLock);

  // ---- Media Session: lock-screen controls for the ambient sounds
  if ('mediaSession' in navigator) {
    listeners.changed.push(c => { if (c.soundState) { const p = c.soundState.newValue && c.soundState.newValue.playing; navigator.mediaSession.playbackState = p ? 'playing' : 'paused';
      if (p) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Study Focus', artist: document.documentElement.lang === 'ar' ? 'أصوات الطبيعة' : 'Ambient sounds', artwork: [{ src: new URL('../assets/icons/icon-192.png', location.href).href, sizes: '192x192', type: 'image/png' }] }); } });
    try { navigator.mediaSession.setActionHandler('pause', () => chrome.storage.local.set({ soundState: { playing: false } })); navigator.mediaSession.setActionHandler('play', () => chrome.storage.local.set({ soundState: { playing: true } })); } catch (e) {}
  }

  // ---- install button + offline cache
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; const b = document.getElementById('pwa-install'); if (b) b.hidden = false; });
  document.addEventListener('DOMContentLoaded', () => {
    const h = document.querySelector('header');
    if (h) { const b = document.createElement('button'); b.id = 'pwa-install'; b.className = 'btn'; b.hidden = !deferred; b.textContent = '⬇ ' + (document.documentElement.lang === 'ar' ? 'تثبيت التطبيق' : 'Install app');
      b.onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; b.hidden = true; } }; h.append(b); }
    listeners.startup.forEach(f => f()); syncLock();
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('../sw.js', location.href)).catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
