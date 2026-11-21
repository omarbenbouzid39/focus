/* Study Focus shared core. Plain script: works in pages, content scripts and the service worker. */
var SF = (() => {
  const DEF = {
    settings: {
      lang: 'ar', theme: 'dark', study: 25, brk: 5, focusMin: 25, goalMin: 120,
      autoBlock: true, strict: false, allowOverride: true, bypassMinutes: 1, blockAlways: false,
      blocking: { youtube: true, instagram: true, facebook: true, tiktok: true },
      blockedSites: ['reddit.com', 'x.com', 'twitter.com'], excludedSites: [],
      notif: { end: true, breakEnd: true, reminder: false, comeback: true },
      hideTime: false, keepAwake: true, mini: { auto: true }, blockedChannels: [],
      sound: { auto: true, chime: true, master: 0.6, mix: {}, custom: [], fsKey: '' }
    },
    timer: { phase: 'idle', running: false, endsAt: 0, remainingMs: 0, totalMs: 0, lastTick: 0, focus: false, strict: false, brkMin: 0, taskId: null }
  };
  const STREAK_MS = 5 * 60000;
  let LANG = 'ar';
  const AR = {
    'Dashboard': 'لوحة التحكم', 'Focus Blocking': 'حجب التشتيت', 'Statistics': 'الإحصائيات', 'Settings': 'الإعدادات', 'Privacy': 'الخصوصية',
    'Pomodoro': 'بومودورو', '25 min study / 5 min break': '25 دقيقة دراسة / 5 دقائق راحة', '50 min study / 10 min break': '50 دقيقة دراسة / 10 دقائق راحة',
    'Custom': 'مخصص', 'Study (min)': 'الدراسة (دقيقة)', 'Break (min)': 'الراحة (دقيقة)', 'Start': 'ابدأ', 'Pause': 'إيقاف مؤقت', 'Resume': 'متابعة', 'Reset': 'إعادة',
    'Quick Focus': 'تركيز سريع', 'Current task': 'المهمة الحالية', 'No task selected': 'لم تُحدد مهمة', 'Pomodoros today': 'جلسات اليوم', 'Study today': 'دراسة اليوم',
    'Daily goal': 'الهدف اليومي', 'Tasks': 'المهام', 'Add a task': 'أضف مهمة', 'Add': 'إضافة', 'High': 'عالية', 'Medium': 'متوسطة', 'Low': 'منخفضة',
    'Sessions target': 'عدد الجلسات', 'Quick Notes': 'ملاحظات سريعة', 'Write a quick note…': 'اكتب ملاحظة سريعة…', 'Saved locally': 'تُحفظ محليًا', 'Edit task': 'تعديل المهمة',
    'Short-video blocking': 'حجب الفيديوهات القصيرة', 'Hide short videos on each platform. Long videos are never blocked.': 'أخفِ الفيديوهات القصيرة لكل منصة. الفيديوهات الطويلة لا تُحجب أبدًا.',
    'YouTube Shorts': 'يوتيوب شورتس', 'Instagram Reels': 'ريلز إنستغرام', 'Facebook Reels': 'ريلز فيسبوك', 'TikTok': 'تيك توك',
    'Also hide while not in Focus Mode': 'أخفِها أيضًا خارج وضع التركيز', 'Focus Mode': 'وضع التركيز', 'Focus duration': 'مدة وضع التركيز',
    '25 minutes': '25 دقيقة', '50 minutes': '50 دقيقة', '90 minutes': '90 دقيقة', 'Strict Mode (cannot be stopped)': 'الوضع الصارم (لا يمكن إيقافه)',
    'Start Focus Mode': 'ابدأ وضع التركيز', 'Start Focus': 'ابدأ التركيز', 'Stop': 'إيقاف', 'Website Blocker': 'حاجب المواقع',
    'One domain per line. Blocked only during Focus Mode.': 'نطاق واحد في كل سطر. يُحجب أثناء وضع التركيز فقط.', 'Focus session in progress': 'جلسة تركيز جارية',
    'Strict Mode is on: this session cannot be stopped.': 'الوضع الصارم مفعّل: لا يمكن إيقاف هذه الجلسة.',
    'Today': 'اليوم', 'Last 7 days': 'آخر 7 أيام', 'Sessions today': 'جلسات اليوم', 'Sessions (7 days)': 'جلسات (7 أيام)', 'Blocked attempts': 'محاولات فتح محظور',
    'Best day': 'أفضل يوم', 'Streak': 'السلسلة', 'Daily average': 'المتوسط اليومي', 'Study Streak': 'سلسلة الدراسة', 'days in a row': 'أيام متتالية',
    "Keep going! You're building a strong habit.": 'استمر! أنت تبني عادة قوية.', 'Complete a study session to start your streak.': 'أكمل جلسة دراسة لتبدأ سلسلتك.',
    'Pomodoros': 'الجلسات', 'Blocking': 'الحجب', 'Active': 'مفعّل', 'Off': 'متوقف', 'Study': 'دراسة', 'Break': 'استراحة', 'Ready': 'جاهز',
    'Study Focus collects no personal data and sends nothing to any server.': 'لا تجمع Study Focus أي بيانات شخصية ولا ترسل شيئًا إلى أي خادم.',
    'Everything (settings, tasks, notes, statistics) is stored locally on your device using Chrome Storage.': 'كل شيء (الإعدادات والمهام والملاحظات والإحصائيات) يُحفظ محليًا على جهازك باستخدام Chrome Storage.',
    'The extension only reads page addresses to decide whether to block them, and never stores your browsing history.': 'تقرأ الإضافة عناوين الصفحات فقط لتقرر الحجب، ولا تحفظ سجل تصفحك.',
    'General': 'عام', 'Language': 'اللغة', 'Theme': 'المظهر', 'Dark': 'داكن', 'Light': 'فاتح', 'Block automatically with Pomodoro': 'فعّل الحجب تلقائيًا مع بومودورو',
    'Strict Mode': 'الوضع الصارم', 'Allow temporary override': 'السماح بالتجاوز المؤقت', 'Override duration (min)': 'مدة التجاوز (دقيقة)',
    'Blocked websites (Focus Mode only)': 'المواقع المحظورة (أثناء التركيز فقط)', 'Excluded websites': 'المواقع المستثناة', 'Notifications': 'الإشعارات',
    'Study session finished': 'انتهاء جلسة الدراسة', 'Break finished': 'انتهاء الاستراحة', 'Hourly study reminder': 'تذكير بالدراسة كل ساعة',
    'Reminder to get back if paused': 'تذكير بالعودة إذا توقفت', 'Daily goal (min)': 'الهدف اليومي (دقيقة)', 'Reset all data': 'مسح جميع البيانات',
    'Settings are locked during a Strict focus session.': 'الإعدادات مقفلة أثناء جلسة تركيز صارمة.', 'Delete statistics, tasks and notes?': 'حذف الإحصائيات والمهام والملاحظات؟',
    'Blocked during focus': 'محجوب أثناء التركيز', 'This website is blocked during your focus session.': 'هذا الموقع محجوب أثناء جلسة التركيز.',
    'Back to study': 'العودة للدراسة', 'Great job! You completed a study session.': 'أحسنت! أكملت جلسة دراسة.', 'Break time starts now.': 'تبدأ الاستراحة الآن.',
    'Break is over': 'انتهت الاستراحة', 'Time to get back to studying.': 'حان وقت العودة للدراسة.', 'Time to study': 'حان وقت الدراسة', 'Ready for a focus session?': 'جاهز لجلسة تركيز؟',
    'Come back': 'عد للدراسة', 'Your session is paused. Ready to continue?': 'جلستك متوقفة. هل أنت جاهز للمتابعة؟', 'Open for {n} min': 'فتح لمدة {n} دقيقة',
    'No data yet': 'لا توجد بيانات بعد', 'Sessions': 'الجلسات',
    'Hide time': 'إخفاء الوقت', 'Show time': 'إظهار الوقت', 'Time is hidden. Hold to peek.': 'الوقت مخفي. اضغط مطولًا لإلقاء نظرة.', 'Hide the timer during sessions': 'إخفاء المؤقت أثناء الجلسات',
    'Stay with it. We will let you know when it ends.': 'ابقَ معها. سننبّهك عند الانتهاء.', 'Delete': 'حذف',
    'Sounds': 'الأصوات', 'Ambient sounds': 'أصوات الطبيعة', 'Play sounds': 'تشغيل الأصوات', 'Stop sounds': 'إيقاف الأصوات', 'Master volume': 'مستوى الصوت العام',
    'Presets': 'تهيئات جاهزة', 'Mix your own: raise the volume of any sound.': 'ابنِ مزيجك: ارفع مستوى أي صوت.',
    'Play automatically during study sessions': 'تشغيل تلقائي أثناء جلسات الدراسة', 'Soft chime when a session ends': 'نغمة هادئة عند انتهاء الجلسة',
    'Sounds are generated on your device. No internet or account needed.': 'تُولَّد الأصوات على جهازك. لا حاجة للإنترنت أو لحساب.',
    'Rain': 'مطر', 'Thunderstorm': 'عاصفة رعدية', 'Wind': 'رياح', 'Ocean waves': 'أمواج البحر', 'Stream': 'جدول ماء', 'Fireplace': 'مدفأة', 'Birds': 'طيور',
    'Night crickets': 'ليل وصراصير', 'Pink noise': 'ضوضاء وردية', 'Brown noise': 'ضوضاء بنية',
    'Rainy day': 'يوم ماطر', 'Forest': 'غابة', 'Beach': 'شاطئ', 'Cozy cabin': 'كوخ دافئ', 'Quiet night': 'ليل هادئ', 'Deep focus': 'تركيز عميق',
    'Real recordings (Freesound)': 'تسجيلات حقيقية (Freesound)', 'Optional. Get a free API key at freesound.org/apis, paste it here, then search real nature recordings.': 'اختياري. احصل على مفتاح API مجاني من freesound.org/apis والصقه هنا ثم ابحث عن تسجيلات طبيعة حقيقية.',
    'API key': 'مفتاح API', 'Save key': 'حفظ المفتاح', 'Search': 'بحث', 'Search sounds…': 'ابحث عن أصوات…', 'Add to mix': 'أضف إلى المزيج', 'Preview': 'استماع', 'Remove': 'إزالة',
    'Your recordings': 'تسجيلاتك', 'Permission to contact freesound.org was not granted.': 'لم يتم منح إذن الاتصال بـ freesound.org.',
    'Search failed. Check your key and connection.': 'فشل البحث. تحقق من المفتاح والاتصال.', 'No results': 'لا نتائج', 'by': 'بواسطة', 'Searching…': 'جارٍ البحث…',
    'Only your search words are sent to freesound.org. Credit goes to the recording authors (Creative Commons).': 'لا يُرسل إلى freesound.org إلا كلمات البحث. الفضل لأصحاب التسجيلات (Creative Commons).',
    'Study time': 'وقت الدراسة', 'Peak hours': 'ساعات الذروة', 'Activity (12 weeks)': 'النشاط (12 أسبوعًا)', 'Top tasks': 'أبرز المهام', 'Export CSV': 'تصدير CSV',
    '7 days': '7 أيام', '30 days': '30 يومًا', '90 days': '90 يومًا', 'Total': 'المجموع', 'vs previous period': 'مقارنة بالفترة السابقة', 'Best streak': 'أطول سلسلة',
    'Goal days': 'أيام بلوغ الهدف', 'Goal': 'الهدف', 'Most productive around {h}': 'أكثر ساعاتك إنتاجًا حوالي {h}', 'Hours data appears after your next session.': 'ستظهر بيانات الساعات بعد جلستك القادمة.',
    'No tasks tracked yet.': 'لم تُتتبَّع مهام بعد.', 'Less': 'أقل', 'More': 'أكثر', 'Active days': 'أيام نشطة', 'Pomodoros: {n}': 'الجلسات: {n}', 'No sessions yet': 'لا جلسات بعد',
    'Select a day range': 'اختر المدة', 'Mini window': 'نافذة مصغّرة', 'Open mini window': 'فتح النافذة المصغّرة', 'Open the mini window when a session starts': 'فتح النافذة المصغّرة عند بدء الجلسة', 'No open tasks': 'لا توجد مهام مفتوحة', 'Set as current task': 'تعيين كمهمة حالية', 'Pin on top': 'تثبيت فوق كل النوافذ', 'Unpin': 'إلغاء التثبيت', 'Pinned on top of all windows. Keep this window open.': 'النافذة مثبّتة فوق كل النوافذ. أبقِ هذه النافذة مفتوحة.', 'Pin failed. Click the pin button again.': 'تعذّر التثبيت. اضغط زر التثبيت مرة أخرى.',
    'Blocked YouTube channels': 'قنوات يوتيوب المحظورة', 'Videos from these channels are hidden and their pages are blocked during focus sessions.': 'تُخفى فيديوهات هذه القنوات وتُحجب صفحاتها أثناء جلسات التركيز.',
    'Channel @handle or link': 'قناة @handle أو رابطها', 'Unrecognized channel. Use @handle or a YouTube channel link.': 'قناة غير معروفة. استخدم @handle أو رابط قناة يوتيوب.',
    'Block channel': 'حظر القناة', 'Keep the screen on during sessions': 'إبقاء الشاشة مضاءة أثناء الجلسات', 'Install app': 'تثبيت التطبيق', 'No blocked channels yet.': 'لا قنوات محظورة بعد.', 'Already blocked': 'محظورة مسبقًا', 'Add': 'إضافة'
  };
  const tr = (s, v) => { let r = LANG === 'ar' ? (AR[s] || s) : s; if (v) for (const k in v) r = r.replace('{' + k + '}', v[k]); return r; };
  const merge = (a, b) => { const o = Array.isArray(a) ? [...a] : { ...a }; for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a && a[k] || {}, b[k]) : b[k]; return o; };
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (off = 0) => { const d = new Date(); d.setDate(d.getDate() - off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const get = async () => {
    const d = await chrome.storage.local.get(['settings', 'timer', 'tasks', 'stats', 'notes', 'bypass', 'currentTaskId', 'soundState']);
    return { settings: merge(DEF.settings, d.settings || {}), timer: { ...DEF.timer, ...(d.timer || {}) }, tasks: d.tasks || [], stats: d.stats || { days: {} },
      notes: d.notes || '', bypass: d.bypass || {}, currentTaskId: d.currentTaskId || null, soundState: { playing: false, ...(d.soundState || {}) } };
  };
  const patchSettings = async fn => { const s = (await get()).settings; fn(s); await chrome.storage.local.set({ settings: s }); };
  const focusActive = (t, n = Date.now()) => !!(t.running && t.phase === 'study' && t.focus && n < t.endsAt);
  const locked = S => !!(S.timer.strict && focusActive(S.timer));
  const remaining = (t, n = Date.now()) => t.phase === 'idle' ? 0 : t.running ? Math.max(0, t.endsAt - n) : t.remainingMs;
  const fmt = (ms, full) => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h || full ? pad(h) + ':' : '') + pad(m) + ':' + pad(s % 60); };
  const dur = ms => { const m = Math.floor(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}${LANG === 'ar' ? ' س ' : 'h '}${m % 60}${LANG === 'ar' ? ' د' : 'm'}` : `${m}${LANG === 'ar' ? ' د' : 'm'}`; };
  const dayMs = (S, k, n = Date.now()) => { const t = S.timer; let ms = (S.stats.days[k] && S.stats.days[k].ms) || 0;
    if (k === dayKey() && t.running && t.phase === 'study') ms += Math.max(0, Math.min(n, t.endsAt) - t.lastTick); return ms; };
  const streak = S => { let c = 0; for (let i = 0; ; i++) { if (dayMs(S, dayKey(i)) >= STREAK_MS) c++; else if (i === 0) continue; else break; } return c; };

  const SOUNDS = [
    { id: 'rain', icon: '🌧️', name: 'Rain' }, { id: 'storm', icon: '⛈️', name: 'Thunderstorm' }, { id: 'wind', icon: '🍃', name: 'Wind' },
    { id: 'ocean', icon: '🌊', name: 'Ocean waves' }, { id: 'stream', icon: '🏞️', name: 'Stream' }, { id: 'fire', icon: '🔥', name: 'Fireplace' },
    { id: 'birds', icon: '🐦', name: 'Birds' }, { id: 'night', icon: '🌙', name: 'Night crickets' }, { id: 'pink', icon: '☁️', name: 'Pink noise' }, { id: 'brown', icon: '🟤', name: 'Brown noise' }
  ];
  const PRESETS = [
    { name: 'Rainy day', icon: '🌧️', mix: { rain: 0.7, wind: 0.15 } }, { name: 'Forest', icon: '🌲', mix: { birds: 0.5, stream: 0.4, wind: 0.15 } },
    { name: 'Beach', icon: '🏖️', mix: { ocean: 0.7, wind: 0.2, birds: 0.1 } }, { name: 'Cozy cabin', icon: '🛖', mix: { fire: 0.55, rain: 0.35, storm: 0.1 } },
    { name: 'Quiet night', icon: '🌙', mix: { night: 0.55, wind: 0.2, stream: 0.2 } }, { name: 'Deep focus', icon: '🧠', mix: { brown: 0.5 } }
  ];
  const hasMix = sn => Object.values(sn.mix || {}).some(v => v > 0) || (sn.custom || []).some(c => c.vol > 0);
  const bestStreak = S => {
    const keys = Object.keys(S.stats.days).concat(dayKey()).filter(k => dayMs(S, k) >= STREAK_MS).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of [...new Set(keys)]) { const d = new Date(k + 'T00:00:00'); cur = prev && Math.round((d - prev) / 864e5) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = d; }
    return best;
  };

  // Turns "@name", a youtube.com link, /channel/UC…, /c/name or /user/name into { label, paths } (paths are URL paths without the leading slash).
  const parseChannel = raw => {
    let x = String(raw || '').trim(); if (!x) return null;
    if (/^UC[\w-]{22}$/.test(x)) return { label: x, paths: ['channel/' + x] };
    if (!/[\/.]/.test(x) || x.startsWith('@')) { x = x.replace(/^@/, ''); return /^[^\s\/?#]{3,}$/.test(x) ? { label: '@' + x, paths: ['@' + x] } : null; }
    let u; try { u = new URL(/^https?:\/\//i.test(x) ? x : 'https://' + x); } catch (e) { return null; }
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (seg[0] && seg[0].startsWith('@')) return { label: seg[0], paths: [seg[0]] };
    if (seg[0] === 'channel' && seg[1]) return { label: seg[1], paths: ['channel/' + seg[1]] };
    if ((seg[0] === 'c' || seg[0] === 'user') && seg[1]) return { label: seg[1], paths: [seg[0] + '/' + seg[1]] };
    return null;
  };
  const channelKnown = (S, ch) => (S.settings.blockedChannels || []).some(c => c.paths.some(p => ch.paths.some(q => q.toLowerCase() === p.toLowerCase())));
  const normHost = s => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  const hostMatch = (h, list) => list.find(d => h === d || h.endsWith('.' + d));
  const applyPrefs = s => {
    if (/Android|Mobile/i.test(navigator.userAgent)) document.documentElement.classList.add('mobile');
    LANG = s.lang; const d = document.documentElement; d.lang = s.lang; d.dir = s.lang === 'ar' ? 'rtl' : 'ltr'; d.dataset.theme = s.theme;
    document.querySelectorAll('[data-i18n]').forEach(e => { if (e.dataset.en === undefined) e.dataset.en = e.textContent.trim(); e.textContent = tr(e.dataset.en); });
    document.querySelectorAll('[data-ph]').forEach(e => { e.placeholder = tr(e.dataset.ph); });
  };
  const fill = (root, S) => {
    const lock = locked(S);
    root.querySelectorAll('[data-k]').forEach(el => {
      el.disabled = lock; if (el === document.activeElement) return;
      const v = el.dataset.k.split('.').reduce((o, k) => o && o[k], S.settings);
      if (el.type === 'checkbox') el.checked = !!v; else el.value = el.dataset.list !== undefined ? (v || []).join('\n') : (v === undefined ? '' : v);
    });
  };
  const bind = async root => {
    const S = await get(); fill(root, S);
    root.querySelectorAll('[data-k]').forEach(el => {
      el.onchange = () => patchSettings(cur => {
        const list = el.dataset.list !== undefined, path = el.dataset.k.split('.');
        const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Math.max(1, Math.round(Number(el.value)) || 1)
          : list ? [...new Set(el.value.split(/[\s,]+/).map(normHost).filter(Boolean))] : el.value;
        let o = cur; path.slice(0, -1).forEach(k => o = o[k]); o[path[path.length - 1]] = val;
      });
    });
  };
  return { DEF, STREAK_MS, parseChannel, channelKnown, SOUNDS, PRESETS, hasMix, bestStreak, tr, setLang: l => { LANG = l; }, merge, dayKey, get, patchSettings, focusActive, locked, remaining, fmt, dur, dayMs, streak, normHost, hostMatch, applyPrefs, fill, bind };
})();
