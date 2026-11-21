/* Statistics page. Relies on the globals from dashboard.js (S, $, tr, poms) at call time. */
let statRange = (() => { try { return [7, 30, 90].includes(+localStorage.getItem('sf_range')) ? +localStorage.getItem('sf_range') : 7; } catch (e) { return 7; } })();
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
const loc = () => S.settings.lang;
const dateOf = k => new Date(k + 'T00:00:00');
const two = n => String(n).padStart(2, '0');

document.querySelectorAll('#range button').forEach(b => b.onclick = () => {
  statRange = +b.dataset.r; try { localStorage.setItem('sf_range', statRange); } catch (e) {} renderStats();
});
$('export').onclick = () => {
  const days = Object.keys(S.stats.days).concat(SF.dayKey()), keys = [...new Set(days)].sort();
  const rows = ['date,minutes,sessions,blocked_attempts', ...keys.map(k => { const d = S.stats.days[k] || {}; return [k, Math.round(SF.dayMs(S, k) / 60000), d.poms || 0, d.attempts || 0].join(','); })];
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'study-focus-stats.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

function statCard(label, value, sub) {
  const d = el('div', 'card'); d.append(el('span', 'muted', label), el('b', '', value)); if (sub) d.append(el('small', 'muted', sub)); return d;
}

function renderStats() {
  if (!S || $('v-stats').hidden) return;
  const R = statRange, ms = k => SF.dayMs(S, k), goal = S.settings.goalMin * 60000, today = SF.dayKey();
  const keys = [...Array(R)].map((_, i) => SF.dayKey(R - 1 - i)), prev = [...Array(R)].map((_, i) => SF.dayKey(2 * R - 1 - i));
  document.querySelectorAll('#range button').forEach(b => b.classList.toggle('on', +b.dataset.r === R));
  const sum = (arr, f) => arr.reduce((a, k) => a + f(k), 0);
  const total = sum(keys, ms), prevTotal = sum(prev, ms), sessions = sum(keys, poms);
  const activeDays = keys.filter(k => ms(k) > 0).length, goalDays = keys.filter(k => ms(k) >= goal).length;
  const allKeys = [...new Set(Object.keys(S.stats.days).concat(today))], best = allKeys.filter(k => ms(k) > 0).sort((a, b) => ms(b) - ms(a))[0];
  const attempts = Object.values(S.stats.days).reduce((a, d) => a + (d.attempts || 0), 0), attToday = (S.stats.days[today] || {}).attempts || 0;
  const pct = prevTotal > 0 ? Math.round((total - prevTotal) / prevTotal * 100) : null;
  const fmtDay = k => dateOf(k).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'short' });
  const rl = tr(R + ' days');

  const cards = $('scards'); cards.innerHTML = '';
  cards.append(
    statCard(tr('Study today'), SF.dur(ms(today))),
    statCard(`${tr('Total')} · ${rl}`, SF.dur(total), pct === null ? '' : `${pct > 0 ? '+' : ''}${pct}% ${tr('vs previous period')}`),
    statCard(tr('Daily average'), activeDays ? SF.dur(total / activeDays) : '—', `${tr('Active days')}: ${activeDays}/${R}`),
    statCard(`${tr('Sessions')} · ${rl}`, sessions, `${tr('Sessions today')}: ${poms(today)}`),
    statCard(tr('Goal days'), `${goalDays}/${R}`, `${tr('Goal')}: ${SF.dur(goal)}`),
    statCard(tr('Best day'), best ? SF.dur(ms(best)) : '—', best ? fmtDay(best) : tr('No data yet')),
    statCard(tr('Streak'), SF.streak(S), `${tr('Best streak')}: ${SF.bestStreak(S)}`),
    statCard(tr('Blocked attempts'), `${attToday} / ${attempts}`));

  // ---- Bar chart with the daily goal line
  const max = Math.max(goal, ...keys.map(ms), 1), chart = $('chart'); chart.innerHTML = '';
  $('goalkey').textContent = `┄ ${tr('Goal')}: ${SF.dur(goal)}`;
  const plot = el('div', 'plot' + (R > 30 ? ' dense' : '')), lbls = el('div', 'lbls' + (R > 30 ? ' dense' : '')), step = R <= 7 ? 1 : Math.ceil(R / 10);
  keys.forEach((k, i) => {
    const bar = el('div', 'bar' + (k === today ? ' today' : '')), fill = el('i'); fill.style.height = Math.max(ms(k) > 0 ? 2 : 0, ms(k) / max * 100) + '%';
    bar.title = `${fmtDay(k)} · ${SF.dur(ms(k))} · ${tr('Pomodoros: {n}', { n: poms(k) })}`; bar.append(fill); plot.append(bar);
    const d = dateOf(k), l = el('span', '', R <= 7 ? d.toLocaleDateString(loc(), { weekday: 'short' }) : ((R - 1 - i) % step === 0 ? d.getDate() : '')); lbls.append(l);
  });
  const line = el('div', 'goalline'); line.style.bottom = goal / max * 100 + '%'; plot.append(line); chart.append(plot, lbls);

  // ---- Peak hours
  const hrs = Array(24).fill(0); keys.forEach(k => { const h = (S.stats.days[k] || {}).hours || {}; for (const x in h) hrs[+x] += h[x]; });
  const hmax = Math.max(...hrs), hw = $('hours'); hw.innerHTML = '';
  const hplot = el('div', 'plot hplot'), hl = el('div', 'lbls hplot');
  hrs.forEach((v, h) => { const bar = el('div', 'bar' + (hmax > 0 && v === hmax ? ' today' : '')), f = el('i'); f.style.height = hmax ? v / hmax * 100 + '%' : '0';
    bar.title = `${two(h)}:00 · ${SF.dur(v)}`; bar.append(f); hplot.append(bar); hl.append(el('span', '', h % 6 === 0 ? two(h) : '')); });
  hw.append(hplot, hl);
  $('hmsg').textContent = hmax > 0 ? tr('Most productive around {h}', { h: two(hrs.indexOf(hmax)) + ':00' }) : tr('Hours data appears after your next session.');

  // ---- Top tasks (all time)
  const ul = $('tstats'); ul.innerHTML = '';
  const ts = S.tasks.filter(t => (t.ms || 0) > 0 || (t.pomodoros || 0) > 0).sort((a, b) => (b.ms || 0) - (a.ms || 0) || (b.pomodoros || 0) - (a.pomodoros || 0)).slice(0, 6), tmax = Math.max(1, ...ts.map(t => t.ms || 0));
  if (!ts.length) ul.append(el('li', 'muted', tr('No tasks tracked yet.')));
  ts.forEach(t => { const li = el('li', 'tstat'), top = el('div', 'row between'); top.append(el('span', 'tt', t.title), el('span', 'muted', `${SF.dur(t.ms || 0)} · ${tr('Pomodoros: {n}', { n: t.pomodoros || 0 })}`));
    const bar = el('div', 'bar'), i = el('i'); i.style.width = (t.ms || 0) / tmax * 100 + '%'; bar.append(i); li.append(top, bar); ul.append(li); });

  // ---- 12-week heatmap (rows = weekday, columns = weeks)
  const heat = $('heat'); heat.innerHTML = '';
  const days = [...Array(84)].map((_, i) => SF.dayKey(83 - i));
  for (let i = 0; i < dateOf(days[0]).getDay(); i++) heat.append(el('i', 'cell gap'));
  days.forEach(k => { const v = ms(k), lv = v <= 0 ? 0 : v < goal * .25 ? 1 : v < goal * .5 ? 2 : v < goal ? 3 : 4, c = el('i', 'cell l' + lv + (k === today ? ' today' : ''));
    c.title = `${fmtDay(k)} · ${v > 0 ? SF.dur(v) : tr('No sessions yet')}`; heat.append(c); });

  // ---- Streak
  const sk = SF.streak(S); $('sk').textContent = sk; $('skmsg').textContent = tr(sk ? "Keep going! You're building a strong habit." : 'Complete a study session to start your streak.');
}
