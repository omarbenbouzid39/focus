/* Study Focus ambient sound engine. Everything is synthesised with the Web Audio API: no files, no network, no account.
   Runs inside the offscreen document so audio keeps playing when the popup or dashboard is closed. */
var SFAudio = (() => {
  let ctx, master, el, bufs = {};
  const live = {};   // id -> { gain, stop }
  const media = {};  // custom id -> HTMLAudioElement
  let masterVol = 0.6, playing = false;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const level = v => Math.max(0, Math.min(1, v)) ** 2; // perceptual curve for the volume sliders

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = level(masterVol);
    master.connect(comp);
    if (window.SF_PWA && ctx.createMediaStreamDestination) {   // phones keep <audio> playing in the background / on the lock screen, but not bare Web Audio
      const d = ctx.createMediaStreamDestination(); comp.connect(d); el = new Audio(); el.srcObject = d.stream; el.setAttribute('playsinline', '');
    } else comp.connect(ctx.destination);
  }

  // Seamless looping noise buffer (the tail is cross-faded into the head so there is no click at the loop point).
  function noise(kind) {
    if (bufs[kind]) return bufs[kind];
    const sr = ctx.sampleRate, N = sr * 8, X = Math.floor(sr * 0.25), buf = ctx.createBuffer(2, N, sr);
    for (let c = 0; c < 2; c++) {
      const raw = new Float32Array(N + X); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < raw.length; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'pink') { b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
          raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926; }
        else if (kind === 'brown') { last = (last + .02 * w) / 1.02; raw[i] = last * 3.5; }
        else raw[i] = w * .6;
      }
      const out = buf.getChannelData(c);
      for (let i = 0; i < N; i++) out[i] = i < X ? raw[i] * (i / X) + raw[N + i] * (1 - i / X) : raw[i];
    }
    return (bufs[kind] = buf);
  }
  const loopNoise = (kind, dest) => { const s = ctx.createBufferSource(); s.buffer = noise(kind); s.loop = true; s.loopStart = 0; s.start(0, Math.random() * 6); return s; };
  const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
  const gainN = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const lfo = (rate, depth, target) => { const o = ctx.createOscillator(), g = gainN(depth); o.frequency.value = rate; o.connect(g); g.connect(target); o.start(); return o; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  // Poisson event scheduler with a 2s look-ahead (robust even if timers are throttled).
  function scheduler(rate, fn) {
    let next = ctx.currentTime + rnd(0, 1 / rate);
    const tick = () => { while (next < ctx.currentTime + 2) { fn(Math.max(next, ctx.currentTime)); next += -Math.log(1 - Math.random()) / rate; } };
    tick(); const id = setInterval(tick, 500); return () => clearInterval(id);
  }
  function burst(t, dest, { f = 2500, q = 1.2, v = 0.2, dur = 0.04, kind = 'white', type = 'bandpass' } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noise(kind); const flt = filt(type, f, q), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(flt); flt.connect(g); g.connect(dest); s.start(t, rnd(0, 6)); s.stop(t + dur + 0.05);
  }
  function tone(t, dest, f0, f1, dur, v, pan) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = g; if (pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  const GEN = {
    rain(out, heavy = 1) {
      const a = chain(loopNoise('pink'), filt('highpass', 500), filt('lowpass', 9000), gainN(0.55 * heavy), out);
      const b = chain(loopNoise('white'), filt('bandpass', 3200, 0.6), gainN(0.12 * heavy), out);
      const drops = scheduler(28 * heavy, t => burst(t, out, { f: rnd(1800, 6500), q: 2, v: rnd(0.03, 0.12) * heavy, dur: rnd(0.015, 0.04) }));
      return () => drops();
    },
    storm(out) {
      const stopRain = GEN.rain(out, 1.5);
      const thunder = scheduler(1 / 28, t => {
        const g = ctx.createGain(), s = ctx.createBufferSource(), f = filt('lowpass', rnd(120, 260));
        s.buffer = noise('brown'); s.connect(f); f.connect(g); g.connect(out);
        const len = rnd(4, 7); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(rnd(0.8, 1.3), t + rnd(0.15, 0.5));
        for (let k = 1; k < 4; k++) g.gain.linearRampToValueAtTime(rnd(0.3, 0.9), t + len * k / 5);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len); s.start(t, rnd(0, 5)); s.stop(t + len + 0.1);
      });
      return () => { stopRain(); thunder(); };
    },
    wind(out) {
      const f = filt('bandpass', 420, 1.1), g = gainN(0.55);
      chain(loopNoise('pink'), f, g, out);
      lfo(0.07, 260, f.frequency); lfo(0.11, 0.25, g.gain); lfo(0.19, 120, f.frequency);
      chain(loopNoise('brown'), filt('lowpass', 180), gainN(0.35), out);
      return () => {};
    },
    ocean(out) {
      const f = filt('lowpass', 900, 0.5), g = gainN(0.35);
      chain(loopNoise('brown'), f, g, out);
      lfo(0.085, 650, f.frequency); lfo(0.085, 0.3, g.gain);
      const h = filt('highpass', 1800), hg = gainN(0.06); chain(loopNoise('pink'), h, hg, out); lfo(0.085, 0.07, hg.gain);
      lfo(0.047, 0.1, g.gain);
      return () => {};
    },
    stream(out) {
      chain(loopNoise('pink'), filt('bandpass', 1300, 0.7), gainN(0.55), out);
      chain(loopNoise('white'), filt('highpass', 4500), gainN(0.05), out);
      const bubbles = scheduler(22, t => { const f = rnd(450, 1500); tone(t, out, f, f * rnd(1.3, 1.9), rnd(0.04, 0.09), rnd(0.02, 0.06), rnd(-0.6, 0.6)); });
      return () => bubbles();
    },
    fire(out) {
      chain(loopNoise('brown'), filt('lowpass', 520), gainN(0.75), out);
      chain(loopNoise('pink'), filt('bandpass', 900, 0.5), gainN(0.05), out);
      const crack = scheduler(9, t => burst(t, out, { f: rnd(800, 4200), q: 1.5, v: rnd(0.08, 0.45), dur: rnd(0.006, 0.03) }));
      const pop = scheduler(0.7, t => burst(t, out, { f: rnd(300, 900), q: 0.8, v: rnd(0.4, 0.8), dur: rnd(0.04, 0.09) }));
      return () => { crack(); pop(); };
    },
    birds(out) {
      chain(loopNoise('pink'), filt('bandpass', 2500, 0.4), gainN(0.025), out);
      const sing = scheduler(0.7, t => {
        const base = rnd(2200, 5200), n = Math.floor(rnd(2, 6)), pan = rnd(-0.8, 0.8), up = Math.random() < 0.5; let at = t;
        for (let i = 0; i < n; i++) { const d = rnd(0.06, 0.13); tone(at, out, base * rnd(0.9, 1.1), base * (up ? rnd(1.15, 1.5) : rnd(0.7, 0.9)), d, rnd(0.14, 0.26), pan); at += d + rnd(0.04, 0.12); }
      });
      return () => sing();
    },
    night(out) {
      chain(loopNoise('pink'), filt('lowpass', 380), gainN(0.14), out);
      const voices = [4300, 4650, 5000].map(f => scheduler(rnd(2.2, 3.2), t => {
        const pan = rnd(-0.7, 0.7); for (let i = 0; i < 3; i++) tone(t + i * 0.045, out, f * rnd(0.99, 1.01), f * 0.995, 0.022, 0.05, pan);
      }));
      return () => voices.forEach(v => v());
    },
    pink(out) { chain(loopNoise('pink'), gainN(0.55), out); return () => {}; },
    brown(out) { chain(loopNoise('brown'), gainN(0.7), out); return () => {}; }
  };

  function start(id) {
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(master);
    const stop = GEN[id](gain), now = ctx.currentTime;
    return { gain, stop, born: now };
  }
  function setLevel(entry, v) { entry.gain.gain.setTargetAtTime(level(v), ctx.currentTime, 0.4); }
  function drop(id) {
    const e = live[id]; if (!e) return; delete live[id];
    e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    setTimeout(() => { try { e.stop(); e.gain.disconnect(); } catch (err) {} }, 1500); // sources keep running silently until here
  }
  function dropMedia(id) { const a = media[id]; if (!a) return; delete media[id]; a.pause(); a.removeAttribute('src'); a.load(); }

  // state: { playing, master, mix: {id: 0..1}, custom: [{id, url, vol}] }
  async function apply(st) {
    masterVol = st.master === undefined ? 0.6 : st.master; playing = !!st.playing;
    if (!playing) { Object.keys(live).forEach(drop); Object.keys(media).forEach(dropMedia); if (ctx && ctx.state === 'running') setTimeout(() => { if (!playing) { ctx.suspend(); if (el) el.pause(); } }, 1800); return; }
    init(); if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
    if (el && el.paused) el.play().catch(() => {});
    master.gain.setTargetAtTime(level(masterVol), ctx.currentTime, 0.1);
    for (const id of Object.keys(GEN)) {
      const v = (st.mix && st.mix[id]) || 0;
      if (v > 0.001) { if (!live[id]) live[id] = start(id); setLevel(live[id], v); } else drop(id);
    }
    const want = new Set();
    for (const c of st.custom || []) {
      if (!(c.vol > 0.001) || !c.url) continue; want.add(c.id);
      let a = media[c.id];
      if (!a) { a = media[c.id] = new Audio(); a.loop = true; a.src = c.url; a.play().catch(() => {}); }
      a.volume = Math.min(1, level(c.vol) * level(masterVol) * 1.4);
    }
    Object.keys(media).forEach(id => { if (!want.has(id)) dropMedia(id); });
  }

  // A soft three-note chime for the end of a session (independent from the ambient mix).
  async function chime() {
    init(); if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) {} }
    if (el && el.paused) el.play().catch(() => {});
    const t0 = ctx.currentTime + 0.05;
    [523.25, 659.25, 783.99].forEach((f, i) => [1, 2.01, 3].forEach((m, j) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + i * 0.4; o.type = 'sine'; o.frequency.value = f * m;
      const v = [0.22, 0.07, 0.02][j] * Math.max(0.35, level(masterVol) * 1.6); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(g); g.connect(master || ctx.destination); o.start(t); o.stop(t + 2.5);
    }));
    if (!playing) setTimeout(() => { if (!playing && ctx.state === 'running') { ctx.suspend(); if (el) el.pause(); } }, 4500);
  }
  return { apply, chime, _ctx: () => ctx };
})();
