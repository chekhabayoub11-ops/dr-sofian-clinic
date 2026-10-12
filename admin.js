/* =========================================================
   Clinic Dashboard — Dr. Sofiane Zerrouki
   Supabase Auth + Realtime · native <dialog> · View Transitions
   ========================================================= */

// `supabaseClient` is a global lexical binding from supabase-config.js (not a window property)
const db = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

/* ---------- Constants ---------- */
const PAGE = 60;
const REASONS = { consult: 'استشارة عامة', gastroscopy: 'تنظير معدة', colonoscopy: 'تنظير قولون', followup: 'متابعة دورية' };
const SHIFTS = { morning: 'صباحية', evening: 'مسائية' };
const STATUS = {
  pending:   { label: 'بانتظار التأكيد', icon: 'i-hourglass' },
  confirmed: { label: 'مؤكد', icon: 'i-check' },
  completed: { label: 'تم الفحص', icon: 'i-done' },
  cancelled: { label: 'ملغى', icon: 'i-x' },
  no_show:   { label: 'لم يحضر', icon: 'i-x' },
};
const URGENCY = {
  urgent:   { label: 'عاجل', icon: 'i-alert', rank: 0 },
  priority: { label: 'أولوية', icon: 'i-bolt', rank: 1 },
  routine:  { label: 'روتيني', icon: 'i-leaf', rank: 2 },
};
// Staff allowed into the dashboard. This is a UX gate only: the real protection is
// the RLS policy in Supabase, which refuses every read/write from any other account.
// Add the assistant's email here AND in supabase/policies.sql.
const STAFF_EMAILS = [];
const TAB_TITLES = { today: 'مواعيد اليوم', upcoming: 'المواعيد القادمة', archive: 'أرشيف المواعيد وسجل المرضى' };
const AV_COLORS = ['#BFE3DC', '#F2C9A8', '#F7E0B5', '#D6D9F5', '#CDE8F6', '#F4D3DC'];
// Patients added at the front desk get this prefix instead of DZ-GASTRO- (no schema change needed)
const WALKIN_PREFIX = 'DZ-WALK-';
const isWalkin = (r) => String(r?.reference_code || '').startsWith(WALKIN_PREFIX);
// List queries skip nothing heavy except photos are small (≤140 KB, compressed at booking)
const COLS = 'id,created_at,full_name,email,phone,age,avatar_url,visit_reason,appointment_date,shift,symptoms,urgency,status,reference_code';

/* ---------- State ---------- */
const state = {
  tab: 'today',
  status: 'all',
  query: '',
  from: '',
  to: '',
  page: 0,
  rows: [],
  todayRows: [],
  today: localISO(),
  channel: null,
  current: null,
};

/* ---------- Date helpers (local clinic time) ---------- */
function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return localISO(d); };
const fmt = (iso, opts) => new Intl.DateTimeFormat('ar-DZ', opts).format(new Date(`${iso}T12:00:00`));
const fmtLong = (iso) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = (iso) => fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
const hhmm = (ts) => new Intl.DateTimeFormat('fr-DZ', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
// Queue time = moment of registration (online booking or front-desk arrival)
const queueTime = (r) => (localISO(new Date(r.created_at)) === state.today ? hhmm(r.created_at) : `${fmt(localISO(new Date(r.created_at)), { day: 'numeric', month: 'short' })} ${hhmm(r.created_at)}`);
const relDay = (iso) => {
  if (iso === state.today) return 'اليوم';
  if (iso === addDays(state.today, 1)) return 'غداً';
  if (iso === addDays(state.today, -1)) return 'أمس';
  return fmtLong(iso);
};

/* ---------- Small utils ---------- */
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg><use href="#${id}"/></svg>`;
const initials = (n = '') => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
const colorFor = (s = '') => AV_COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];
const safeImg = (url) => (typeof url === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(url)) || /^https:\/\//.test(url || '') ? url : null;
const avatarHTML = (r) => {
  const src = safeImg(r.avatar_url);
  return `<span class="avatar" style="--av:${colorFor(r.full_name)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : esc(initials(r.full_name))}</span>`;
};
const urgencyTag = (u = 'routine') => `<span class="tag u-${u}">${icon(URGENCY[u]?.icon || 'i-leaf')}${URGENCY[u]?.label || u}</span>`;
const statusTag = (s = 'pending') => `<span class="tag s-${s}">${STATUS[s]?.label || s}</span>`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const withTransition = (fn) => (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(fn) : fn());

function waLink(r) {
  const intl = `213${String(r.phone || '').replace(/\D/g, '').replace(/^0/, '')}`;
  const msg = `السلام عليكم ${r.full_name}،\nعيادة الدكتور سفيان زروقي تؤكد موعدكم يوم ${fmtLong(r.appointment_date)} (الفترة ${SHIFTS[r.shift] || ''}).\nالرمز المرجعي: ${r.reference_code}\nللتعديل أو الإلغاء يرجى الرد على هذه الرسالة.`;
  return `https://wa.me/${intl}?text=${encodeURIComponent(msg)}`;
}

/* ---------- Toasts ---------- */
function toast(text, { type = 'info', action, onAction, ms = 4200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-ico">${icon(type === 'error' ? 'i-alert' : 'i-check')}</span><span>${esc(text)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  $('#toasts').append(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 350); };
  el.querySelector('button')?.addEventListener('click', () => { onAction?.(); close(); });
  setTimeout(close, ms);
}

/* ---------- Count-up ---------- */
function countUp(el, to) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min((t - t0) / 700, 1);
    el.textContent = Math.round(from + (to - from) * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* =========================================================
   AUTH
   ========================================================= */
async function boot() {
  if (!db) {
    $('#authView').hidden = false;
    $('#appView').hidden = true;
    $('#loginForm').hidden = true;
    const notice = document.createElement('p');
    notice.className = 'auth-error';
    notice.setAttribute('role', 'status');
    notice.textContent = 'لوحة الإدارة جزء من العرض التصميمي فقط. لا توجد قاعدة بيانات أو سجلات مرضى في نسخة البورتفوليو.';
    $('#loginForm').before(notice);
    return;
  }
  const { data: { session } } = await db.auth.getSession();
  session ? enterApp(session) : showAuth();
  db.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_OUT') showAuth(pendingDenial);
    if (event === 'SIGNED_IN' && $('#appView').hidden) enterApp(s);
  });
}

let pendingDenial = '';

function showAuth(message = '') {
  state.channel && db.removeChannel(state.channel);
  state.channel = null;
  $('#appView').hidden = true;
  $('#authView').hidden = false;
  const err = $('#loginError');
  err.textContent = message;
  err.hidden = !message;
  setTimeout(() => $('#loginEmail').focus(), 50);
}

$('#pwToggle').addEventListener('click', () => {
  const i = $('#loginPassword');
  i.type = i.type === 'password' ? 'text' : 'password';
});

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginBtn');
  const err = $('#loginError');
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  err.hidden = true;
  pendingDenial = '';
  if (!email || !password) { err.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور.'; err.hidden = false; return; }
  btn.classList.add('is-loading');
  const { error } = await db.auth.signInWithPassword({ email, password });
  btn.classList.remove('is-loading');
  if (error) {
    err.textContent = error.message.includes('Invalid login') ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : `تعذّر تسجيل الدخول: ${error.message}`;
    err.hidden = false;
  }
});

$('#logoutBtn').addEventListener('click', () => db.auth.signOut());

/* =========================================================
   APP
   ========================================================= */
async function enterApp(session) {
  // Never load patient data before the account is confirmed as clinic staff
  if (!(await verifyStaff(session))) return;
  $('#authView').hidden = true;
  $('#appView').hidden = false;
  updateHeader();
  subscribeRealtime();
  scheduleMidnight();
  await refreshAll();
}

function greetingFor(h) {
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'مساء الخير';
  return 'مساء النور';
}
function updateHeader() {
  const now = new Date();
  $('#greeting').textContent = `${greetingFor(now.getHours())}، د. سفيان`;
  $('#todayLabel').textContent = fmtLong(state.today);
  $('#heroDate').textContent = fmtLong(state.today);
}

/* Only a signed-in staff account may read patient data.
   Anyone else is signed out and sent back to the login screen. */
async function verifyStaff(session) {
  const email = session?.user?.email?.toLowerCase();
  if (!email) { showAuth(); return false; }
  if (STAFF_EMAILS.includes(email)) return true;
  pendingDenial = 'هذا الحساب غير مخوّل بالوصول إلى سجلات المرضى.';
  await db.auth.signOut();
  showAuth(pendingDenial); // also shown by the SIGNED_OUT listener; idempotent
  return false;
}

/* ---------- Queries ---------- */
function sanitizeQuery(q) {
  return q.replace(/[,()*%\\:]/g, ' ').trim();
}

function buildQuery() {
  let q = db.from('appointments').select(COLS);
  const term = sanitizeQuery(state.query);

  if (state.tab === 'today') {
    q = q.eq('appointment_date', state.today);
  } else if (state.tab === 'upcoming') {
    q = q.gt('appointment_date', state.today).order('appointment_date', { ascending: true });
  } else {
    // Archive: past by default; a search spans the patient's whole history
    if (!term) q = q.lt('appointment_date', state.today);
    if (state.from) q = q.gte('appointment_date', state.from);
    if (state.to) q = q.lte('appointment_date', state.to);
    q = q.order('appointment_date', { ascending: false });
  }

  if (term) {
    const digits = term.replace(/\D/g, '');
    const ors = [`full_name.ilike.*${term}*`, `reference_code.ilike.*${term}*`, `email.ilike.*${term}*`];
    if (digits.length >= 3) ors.push(`phone.ilike.*${digits}*`);
    q = q.or(ors.join(','));
  }
  if (state.status !== 'all') q = q.eq('status', state.status);
  return q.order('created_at', { ascending: true }).range(state.page * PAGE, state.page * PAGE + PAGE - 1);
}

const sortToday = (rows) => [...rows].sort((a, b) =>
  (a.shift === b.shift ? 0 : a.shift === 'morning' ? -1 : 1)
  || (URGENCY[a.urgency]?.rank ?? 2) - (URGENCY[b.urgency]?.rank ?? 2)
  || a.created_at.localeCompare(b.created_at));

async function loadList({ append = false } = {}) {
  if (!append) { state.page = 0; renderSkeleton(); }
  const { data, error } = await buildQuery();
  if (error) { toast(`خطأ في تحميل البيانات: ${error.message}`, { type: 'error' }); renderList(); return; }
  state.rows = append ? [...state.rows, ...data] : data;
  $('#loadMore').hidden = data.length < PAGE;
  renderList();
}

async function loadToday() {
  const { data, error } = await db.from('appointments').select(COLS).eq('appointment_date', state.today);
  if (error) return;
  state.todayRows = sortToday(data);
  renderKpis();
  renderHero();
  renderMix();
}

async function loadWeek() {
  const end = addDays(state.today, 6);
  const [{ data: week }, { count: upcoming }] = await Promise.all([
    db.from('appointments').select('appointment_date,status').gte('appointment_date', state.today).lte('appointment_date', end),
    db.from('appointments').select('id', { count: 'exact', head: true }).gt('appointment_date', state.today).neq('status', 'cancelled'),
  ]);
  $('#countUpcoming').textContent = upcoming ?? 0;
  renderChart((week || []).filter((r) => r.status !== 'cancelled'));
}

async function refreshAll() {
  const btn = $('#refreshBtn');
  btn.classList.add('spin');
  await Promise.all([loadToday(), loadWeek(), loadList()]);
  btn.classList.remove('spin');
}

/* ---------- Rendering ---------- */
function renderSkeleton() {
  $('#list').innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton"></div>').join('');
}

function rowHTML(r, i) {
  const waReady = r.status === 'pending' || r.status === 'confirmed';
  return `
    <div class="row" role="button" tabindex="0" data-id="${r.id}" data-urgency="${esc(r.urgency)}" data-status="${esc(r.status)}" style="--i:${i}">
      ${avatarHTML(r)}
      <div class="row-main">
        <b>${esc(r.full_name)}</b>
        <div class="row-meta">
          ${state.tab === 'today' ? `<span class="q-time" dir="ltr" title="وقت التسجيل">${icon('i-clock')} ${esc(queueTime(r))}</span>` : ''}
          <span class="code">${esc(r.reference_code)}</span>
          <span>${r.age ? `${r.age} سنة` : ''}</span>
          <span>${REASONS[r.visit_reason] || esc(r.visit_reason)}</span>
          ${state.tab !== 'today' ? `<span>${esc(fmtShort(r.appointment_date))} · ${SHIFTS[r.shift] || ''}</span>` : ''}
        </div>
      </div>
      <div class="row-tags">${isWalkin(r) ? '<span class="tag walkin">حضوري</span>' : ''}${urgencyTag(r.urgency)}${statusTag(r.status)}</div>
      <div class="row-actions">
        ${waReady ? `<a class="wa-btn" href="${waLink(r)}" target="_blank" rel="noopener" data-wa="${r.id}" aria-label="تأكيد عبر واتساب" title="تأكيد عبر واتساب">${icon('i-wa')}</a>` : ''}
        ${state.tab === 'today' && r.status !== 'completed' && r.status !== 'cancelled' ? `<button class="act-btn" data-done="${r.id}" type="button" aria-label="تم الفحص" title="تم الفحص">${icon('i-check')}</button>` : ''}
      </div>
    </div>`;
}

function emptyHTML() {
  const msg = state.query ? ['لا توجد نتائج', 'جرّب اسماً أو رقماً أو رمزاً آخر.']
    : state.tab === 'today' ? ['لا مواعيد اليوم', 'يوم هادئ — ستظهر الحجوزات الجديدة هنا مباشرة.']
    : state.tab === 'upcoming' ? ['لا مواعيد قادمة', 'لم يتم تسجيل حجوزات للأيام القادمة بعد.']
    : ['الأرشيف فارغ', 'ستُحفظ هنا كل المواعيد السابقة بشكل دائم.'];
  return `<div class="empty"><span class="empty-ico">${icon(state.tab === 'archive' ? 'i-archive' : 'i-today')}</span><b>${msg[0]}</b><span>${msg[1]}</span></div>`;
}

function renderList() {
  const list = $('#list');
  const rows = state.tab === 'today' ? sortToday(state.rows) : state.rows;
  $('#listTitle').textContent = state.query ? `نتائج البحث عن «${state.query}»` : TAB_TITLES[state.tab];
  $('#listMeta').textContent = `${rows.length}${$('#loadMore').hidden ? '' : '+'} موعد`;
  if (!rows.length) { list.innerHTML = emptyHTML(); return; }

  // Group: by shift for today, by date otherwise
  const keyOf = (r) => (state.tab === 'today' ? r.shift : r.appointment_date);
  const groups = new Map();
  rows.forEach((r) => { const k = keyOf(r); groups.has(k) || groups.set(k, []); groups.get(k).push(r); });

  let i = 0;
  list.innerHTML = [...groups].map(([k, items]) => {
    const title = state.tab === 'today'
      ? `${icon(k === 'morning' ? 'i-sunrise' : 'i-moon')} الفترة ${SHIFTS[k] || k}`
      : `${icon('i-today')} ${esc(relDay(k))}`;
    return `<div class="group-title">${title} <em>${items.length}</em></div>${items.map((r) => rowHTML(r, i++)).join('')}`;
  }).join('');
}

function renderKpis() {
  const rows = state.todayRows.filter((r) => r.status !== 'cancelled');
  const total = rows.length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const urgent = rows.filter((r) => r.urgency === 'urgent').length;
  const priority = rows.filter((r) => r.urgency === 'priority').length;
  const done = rows.filter((r) => r.status === 'completed').length;
  countUp($('[data-kpi="total"]'), total);
  countUp($('[data-kpi="pending"]'), pending);
  countUp($('[data-kpi="flagged"]'), urgent + priority);
  countUp($('[data-kpi="done"]'), done);
  $('[data-kpi-sub="total"]').textContent = `${rows.filter((r) => r.shift === 'morning').length} صباحاً · ${rows.filter((r) => r.shift === 'evening').length} مساءً`;
  $('[data-kpi-sub="flagged"]').textContent = `${urgent} عاجلة · ${priority} أولوية`;
  $('[data-kpi-bar]').style.width = total ? `${(done / total) * 100}%` : '0';
  $('#countToday').textContent = total;
  $('#shiftMorning').textContent = rows.filter((r) => r.shift === 'morning').length;
  $('#shiftEvening').textContent = rows.filter((r) => r.shift === 'evening').length;
}

function renderHero() {
  const active = state.todayRows.filter((r) => r.status !== 'cancelled');
  const remaining = active.filter((r) => r.status !== 'completed');
  const urgent = active.filter((r) => r.urgency === 'urgent').length;
  const isFriday = new Date(`${state.today}T12:00:00`).getDay() === 5;
  $('#heroTitle').textContent = !active.length
    ? (isFriday ? 'العيادة مغلقة اليوم — يوم راحة سعيد' : 'لا مواعيد مسجلة اليوم حتى الآن')
    : remaining.length ? `لديك ${remaining.length} ${remaining.length === 1 ? 'مريض' : 'مرضى'} في انتظارك اليوم` : 'أنهيت جميع مواعيد اليوم، عمل رائع';
  $('#heroSub').textContent = active.length
    ? `${active.length} موعد إجمالاً${urgent ? ` · ${urgent} حالة عاجلة تحتاج اهتماماً أولاً` : ''}`
    : 'يتم تحديث القائمة تلقائياً مع كل حجز جديد، وعند منتصف الليل تنتقل إلى اليوم الجديد.';

  const next = remaining[0];
  $('#nextPatient').hidden = !next;
  if (next) {
    $('#nextCard').innerHTML = `${avatarHTML(next)}<span>${esc(next.full_name)}</span>${urgencyTag(next.urgency)}`;
    $('#nextCard').onclick = () => openDrawer(next);
  }
}

function renderMix() {
  const rows = state.todayRows.filter((r) => r.status !== 'cancelled');
  const ul = $('#reasonMix');
  if (!rows.length) { ul.innerHTML = '<li class="none">لا توجد فحوصات اليوم.</li>'; return; }
  const max = Math.max(...Object.keys(REASONS).map((k) => rows.filter((r) => r.visit_reason === k).length), 1);
  ul.innerHTML = Object.entries(REASONS).map(([k, label]) => {
    const n = rows.filter((r) => r.visit_reason === k).length;
    return `<li><span>${label}</span><b>${n}</b><span class="track"><i style="width:${(n / max) * 100}%"></i></span></li>`;
  }).join('');
}

/* ---------- Weekly chart (single series, hover tooltip) ---------- */
function renderChart(rows) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.today, i));
  const counts = days.map((d) => rows.filter((r) => r.appointment_date === d).length);
  const max = Math.max(...counts, 4);
  const W = 300, H = 190, top = 22, bottom = 34, gap = 14;
  const bw = (W - gap * 6) / 7;
  const y = (v) => H - bottom - (v / max) * (H - top - bottom);
  // RTL: today on the right
  const x = (i) => W - (i + 1) * bw - i * gap;

  const bars = days.map((d, i) => {
    const isFri = new Date(`${d}T12:00:00`).getDay() === 5;
    const v = counts[i];
    const h = Math.max(H - bottom - y(v), v ? 4 : 0);
    const bx = x(i);
    const r = Math.min(4, bw / 2, h);
    // 4px rounded top, square base anchored to baseline
    const path = h ? `M${bx},${H - bottom} V${H - bottom - h + r} Q${bx},${H - bottom - h} ${bx + r},${H - bottom - h} H${bx + bw - r} Q${bx + bw},${H - bottom - h} ${bx + bw},${H - bottom - h + r} V${H - bottom} Z` : '';
    const label = fmt(d, { weekday: 'short' });
    return `
      <rect class="bar-hit" x="${bx - gap / 2}" y="${top - 10}" width="${bw + gap}" height="${H - top - bottom + 10}" data-i="${i}"></rect>
      ${isFri && !v ? `<rect class="closed" x="${bx}" y="${H - bottom - 24}" width="${bw}" height="24" rx="4"></rect>` : `<path class="bar ${i === 0 ? 'today' : ''}" d="${path}"></path>`}
      ${v ? `<text class="val" x="${bx + bw / 2}" y="${H - bottom - h - 6}" text-anchor="middle">${v}</text>` : ''}
      <text x="${bx + bw / 2}" y="${H - 14}" text-anchor="middle">${i === 0 ? 'اليوم' : label}</text>`;
  }).join('');

  const total = counts.reduce((a, b) => a + b, 0);
  $('#weekChart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="الحجوزات خلال الأيام السبعة القادمة: ${total} موعد">
      <line class="grid" x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}"></line>
      ${bars}
    </svg>
    <table class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)"><tr><th>اليوم</th><th>المواعيد</th></tr>${days.map((d, i) => `<tr><td>${fmtLong(d)}</td><td>${counts[i]}</td></tr>`).join('')}</table>`;

  const tip = $('#chartTip');
  const panel = $('.chart-panel');
  $$('.bar-hit', $('#weekChart')).forEach((hit) => {
    const i = Number(hit.dataset.i);
    const show = () => {
      const isFri = new Date(`${days[i]}T12:00:00`).getDay() === 5;
      tip.textContent = `${fmtLong(days[i])} — ${isFri && !counts[i] ? 'العيادة مغلقة' : `${counts[i]} موعد`}`;
      const hb = hit.getBoundingClientRect();
      const pb = panel.getBoundingClientRect();
      tip.style.right = `${pb.right - (hb.left + hb.width / 2)}px`;
      tip.style.top = `${hb.top - pb.top + 6}px`;
      tip.hidden = false;
    };
    hit.addEventListener('pointerenter', show);
    hit.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
}

/* =========================================================
   DRAWER — patient file
   ========================================================= */
const drawer = $('#drawer');

async function openDrawer(r) {
  state.current = r;
  $('#dAvatar').innerHTML = avatarHTML(r);
  $('#dName').textContent = r.full_name;
  $('#dCode').textContent = r.reference_code;
  $('#dBadges').innerHTML = urgencyTag(r.urgency) + statusTag(r.status);
  $('#dContact').innerHTML = `
    <a class="wa" href="${waLink(r)}" target="_blank" rel="noopener" data-wa="${r.id}">${icon('i-wa')} واتساب</a>
    <a href="tel:${esc(r.phone)}">${icon('i-phone')} <span dir="ltr">${esc(r.phone)}</span></a>
    <a href="mailto:${esc(r.email || '')}">${icon('i-mail')} البريد</a>`;
  $('#dInfo').innerHTML = [
    ['التاريخ', fmtLong(r.appointment_date)],
    ['الفترة', SHIFTS[r.shift] || r.shift],
    ['سبب الزيارة', REASONS[r.visit_reason] || r.visit_reason],
    ['السن', r.age ? `${r.age} سنة` : '—'],
    ['البريد', r.email || '—'],
    [isWalkin(r) ? 'وقت الوصول' : 'تاريخ الحجز', new Intl.DateTimeFormat('ar-DZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(r.created_at))],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('#dSymptoms').textContent = r.symptoms || 'لم يذكر المريض أعراضاً.';
  $('#dStatus').innerHTML = Object.entries(STATUS).map(([k, v]) =>
    `<button type="button" data-set-status="${k}" class="${r.status === k ? 'is-active' : ''}">${icon(v.icon)}${v.label}</button>`).join('');
  $('#dUrgency').innerHTML = Object.entries(URGENCY).map(([k, v]) =>
    `<button type="button" data-set-urgency="${k}" class="${r.urgency === k ? 'is-active' : ''}">${icon(v.icon)}${v.label}</button>`).join('');
  $('#dHistory').innerHTML = '<li>جارٍ التحميل…</li>';
  if (!drawer.open) drawer.showModal();

  // Lifetime record: all visits with the same phone number
  const { data } = await db.from('appointments')
    .select('id,appointment_date,visit_reason,status,reference_code')
    .eq('phone', r.phone).order('appointment_date', { ascending: false }).limit(30);
  if (state.current?.id !== r.id) return;
  $('#dHistory').innerHTML = (data || []).map((h) => `
    <li class="${h.id === r.id ? 'current' : ''}"><span>${esc(fmtShort(h.appointment_date))} · ${REASONS[h.visit_reason] || ''}</span>${statusTag(h.status)}</li>`).join('')
    || '<li>لا توجد زيارات أخرى.</li>';
}

$('#drawerClose').addEventListener('click', () => drawer.close());
drawer.addEventListener('click', (e) => { if (e.target === drawer) drawer.close(); }); // backdrop click

/* ---------- Mutations (optimistic) ---------- */
function patchLocal(id, patch) {
  for (const list of [state.rows, state.todayRows]) {
    const r = list.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
  }
  if (state.current?.id === id) Object.assign(state.current, patch);
}

async function updateAppointment(id, patch, okMsg) {
  const before = { ...(state.rows.find((x) => x.id === id) || state.todayRows.find((x) => x.id === id) || {}) };
  patchLocal(id, patch);
  renderList(); renderKpis(); renderHero(); renderMix();
  if (drawer.open && state.current?.id === id) openDrawer(state.current);

  const { error } = await db.from('appointments').update(patch).eq('id', id);
  if (error) {
    patchLocal(id, Object.fromEntries(Object.keys(patch).map((k) => [k, before[k]])));
    renderList(); renderKpis(); renderHero();
    toast(`تعذّر الحفظ: ${error.message}`, { type: 'error' });
    return false;
  }
  if (okMsg) toast(okMsg);
  return true;
}

drawer.addEventListener('click', async (e) => {
  const s = e.target.closest('[data-set-status]');
  const u = e.target.closest('[data-set-urgency]');
  if (s && state.current) updateAppointment(state.current.id, { status: s.dataset.setStatus }, `تم تحديث الحالة: ${STATUS[s.dataset.setStatus].label}`);
  if (u && state.current) updateAppointment(state.current.id, { urgency: u.dataset.setUrgency }, `درجة الأولوية: ${URGENCY[u.dataset.setUrgency].label}`);
});

$('#dDelete').addEventListener('click', async () => {
  const r = state.current;
  if (!r || !confirm(`حذف موعد ${r.full_name} (${r.reference_code}) نهائياً؟ لا يمكن التراجع.`)) return;
  const { error } = await db.from('appointments').delete().eq('id', r.id);
  if (error) { toast(`تعذّر الحذف: ${error.message}`, { type: 'error' }); return; }
  drawer.close();
  state.rows = state.rows.filter((x) => x.id !== r.id);
  state.todayRows = state.todayRows.filter((x) => x.id !== r.id);
  renderList(); renderKpis(); renderHero(); renderMix(); loadWeek();
  toast('تم حذف الموعد');
});

/* ---------- List interactions (event delegation) ---------- */
const findRow = (id) => state.rows.find((x) => String(x.id) === String(id)) || state.todayRows.find((x) => String(x.id) === String(id));

$('#list').addEventListener('click', (e) => {
  const wa = e.target.closest('[data-wa]');
  if (wa) { afterWhatsApp(findRow(wa.dataset.wa)); return; }
  const done = e.target.closest('[data-done]');
  if (done) { updateAppointment(findRow(done.dataset.done).id, { status: 'completed' }, 'تم تسجيل الفحص ✓'); return; }
  const row = e.target.closest('.row');
  if (row) openDrawer(findRow(row.dataset.id));
});
$('#list').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('row')) { e.preventDefault(); openDrawer(findRow(e.target.dataset.id)); }
});
$('#dContact').addEventListener('click', (e) => { if (e.target.closest('[data-wa]')) afterWhatsApp(state.current); });

function afterWhatsApp(r) {
  if (!r || r.status !== 'pending') return;
  toast(`هل أكّد ${r.full_name} الموعد؟`, {
    action: 'تحديد كمؤكد', ms: 9000,
    onAction: () => updateAppointment(r.id, { status: 'confirmed' }, 'تم تأكيد الموعد'),
  });
}

/* =========================================================
   WALK-IN — the doctor or the assistant adds a patient who is
   at the clinic. created_at = arrival time, so the patient takes
   their place among online bookings by time (see sortToday).
   ========================================================= */
const walkin = $('#walkin');
const wForm = $('#walkinForm');
const normalizePhone = (v) => v.replace(/[\s.\-()]/g, '').replace(/^(\+|00)213/, '0');
const shiftFor = (time) => (time < '13:00' ? 'morning' : 'evening');

function pick(name, value) {
  $$(`[data-pick="${name}"] button`, wForm).forEach((b) => b.classList.toggle('is-active', b.dataset.v === value));
}
const picked = (name) => $(`[data-pick="${name}"] .is-active`, wForm)?.dataset.v;

function openWalkin() {
  wForm.reset();
  const now = hhmm(Date.now());
  wForm.arrival.value = now;
  pick('visit_reason', 'consult');
  pick('urgency', 'routine');
  pick('shift', shiftFor(now));
  $('#walkinError').hidden = true;
  walkin.showModal();
  setTimeout(() => wForm.full_name.focus(), 50);
}

$('#addWalkinBtn').addEventListener('click', openWalkin);
$('#walkinClose').addEventListener('click', () => walkin.close());
walkin.addEventListener('click', (e) => {
  if (e.target === walkin) { walkin.close(); return; }
  const b = e.target.closest('[data-pick] button');
  if (b) pick(b.parentElement.dataset.pick, b.dataset.v);
});
wForm.arrival.addEventListener('change', () => { if (wForm.arrival.value) pick('shift', shiftFor(wForm.arrival.value)); });

wForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#walkinError');
  const fail = (msg) => { err.textContent = msg; err.hidden = false; };
  const name = wForm.full_name.value.trim().replace(/\s+/g, ' ');
  const phone = normalizePhone(wForm.phone.value);
  const age = parseInt(wForm.age.value, 10);
  const arrival = wForm.arrival.value;
  err.hidden = true;
  if (name.length < 3) return fail('يرجى إدخال الاسم الكامل.');
  if (!/^0\d{8,9}$/.test(phone)) return fail('رقم الهاتف غير صالح.');
  if (!(age >= 1 && age <= 110)) return fail('يرجى إدخال سن صحيح.');
  if (!arrival) return fail('يرجى تحديد وقت الوصول.');

  const row = {
    full_name: name,
    email: '',
    phone,
    age,
    avatar_url: null,
    visit_reason: picked('visit_reason'),
    appointment_date: state.today,
    shift: picked('shift'),
    symptoms: wForm.symptoms.value.trim() || null,
    urgency: picked('urgency'),
    status: 'confirmed', // the patient is already at the clinic
    created_at: new Date(`${state.today}T${arrival}:00`).toISOString(),
    reference_code: '',
  };

  const btn = $('#walkinSubmit');
  btn.classList.add('is-loading');
  let error;
  for (let attempt = 0; attempt < 4; attempt++) {
    row.reference_code = `${WALKIN_PREFIX}${Math.floor(1000 + Math.random() * 9000)}`;
    ({ error } = await db.from('appointments').insert(row));
    if (error?.code !== '23505') break; // duplicate code → retry with a new one
  }
  btn.classList.remove('is-loading');
  if (error) return fail(`تعذّر الحفظ: ${error.message}`);

  walkin.close();
  toast(`تمت إضافة ${name} — ${hhmm(row.created_at)} · الفترة ${SHIFTS[row.shift]}`);
  if (state.tab !== 'today' && !state.query) setTab('today');
  await Promise.all([loadToday(), loadWeek(), loadList()]);
});

/* ---------- Tabs, filters, search ---------- */
function setTab(tab) {
  if (state.tab === tab && !state.query) return;
  withTransition(() => {
    state.tab = tab;
    $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    $('#dateRange').hidden = tab !== 'archive';
    loadList();
  });
  closeSidebar();
}
$$('.nav-item').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

$('#statusFilter').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#statusFilter button').forEach((x) => x.classList.toggle('is-active', x === b));
  state.status = b.dataset.status;
  loadList();
});

const onSearch = debounce(() => {
  state.query = $('#searchInput').value.trim();
  if (state.query && state.tab !== 'archive') {
    // Searching = looking through the lifetime record
    state.tab = 'archive';
    $$('.nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === 'archive'));
    $('#dateRange').hidden = false;
  }
  loadList();
}, 280);
$('#searchInput').addEventListener('input', onSearch);

$('#fromDate').addEventListener('change', (e) => { state.from = e.target.value; loadList(); });
$('#toDate').addEventListener('change', (e) => { state.to = e.target.value; loadList(); });
$('#clearRange').addEventListener('click', () => { state.from = state.to = ''; $('#fromDate').value = $('#toDate').value = ''; loadList(); });
$('#loadMore').addEventListener('click', () => { state.page += 1; loadList({ append: true }); });
$('#refreshBtn').addEventListener('click', refreshAll);

/* ---------- Keyboard shortcuts ---------- */
document.addEventListener('keydown', (e) => {
  if ($('#appView').hidden) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.key === '/' && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault(); $('#searchInput').focus(); $('#searchInput').select();
  }
  if (!typing && !drawer.open && !walkin.open && e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openWalkin(); }
  if (!typing && !drawer.open && !walkin.open && ['1', '2', '3'].includes(e.key)) setTab(['today', 'upcoming', 'archive'][Number(e.key) - 1]);
  if (e.key === 'Escape' && document.activeElement === $('#searchInput') && $('#searchInput').value) {
    $('#searchInput').value = ''; onSearch();
  }
});

/* ---------- Sidebar (mobile) ---------- */
const closeSidebar = () => $('#sidebar').classList.remove('open');
$('#menuBtn').addEventListener('click', () => $('#sidebar').classList.add('open'));
$('#scrim').addEventListener('click', closeSidebar);

/* ---------- Theme ---------- */
function applyThemeIcon() {
  const t = document.documentElement.dataset.theme;
  const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.dark = dark ? '1' : '0';
  $('#themeToggle span').textContent = dark ? 'الوضع النهاري' : 'الوضع الليلي';
}
$('#themeToggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.dark === '1' ? 'light' : 'dark';
  withTransition(() => {
    document.documentElement.dataset.theme = next;
    applyThemeIcon();
  });
  try { localStorage.setItem('clinic-theme', next); } catch {}
});
applyThemeIcon();

/* =========================================================
   LIVE: realtime inserts/updates + midnight rollover
   ========================================================= */
function subscribeRealtime() {
  if (state.channel) return;
  const rt = $('#rtStatus');
  state.channel = db.channel('appointments-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
      const r = payload.new;
      if (payload.eventType === 'INSERT' && !isWalkin(r)) {
        toast(`حجز جديد: ${r.full_name} — ${relDay(r.appointment_date)}`, {
          action: 'عرض', ms: 8000, onAction: () => openDrawer(r),
        });
      }
      Promise.all([loadToday(), loadWeek(), loadList()]).then(() => {
        if (r?.id) $(`.row[data-id="${r.id}"]`)?.classList.add('flash');
      });
    })
    .subscribe((status) => {
      const live = status === 'SUBSCRIBED';
      rt.dataset.state = live ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'off' : 'connecting';
      rt.querySelector('span').textContent = live ? 'متصل مباشرة' : rt.dataset.state === 'off' ? 'التحديث المباشر غير مفعّل' : 'جارٍ الاتصال…';
    });
}

let midnightTimer;
function scheduleMidnight() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  midnightTimer = setTimeout(rollDay, next - now);
}
function rollDay() {
  const today = localISO();
  if (today !== state.today) {
    state.today = today;
    updateHeader();
    refreshAll();
    toast(`يوم جديد — تم تحميل مواعيد ${fmtLong(today)}`);
  }
  scheduleMidnight();
}
// Timers drift when the laptop sleeps: re-check whenever the tab comes back
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#appView').hidden) rollDay(); });

/* ---------- Live clock ---------- */
function tick() {
  $('#clock').textContent = new Intl.DateTimeFormat('fr-DZ', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  if (localISO() !== state.today && !$('#appView').hidden) rollDay();
}
tick();
setInterval(tick, 15_000);

boot();
