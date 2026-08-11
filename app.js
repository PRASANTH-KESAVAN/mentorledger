/* =========================================================
   MentorLedger — app.js
   Fully offline. All data lives in localStorage on this device.

   Data model:
   state.students = [{ id, name, photo, phone, notes, createdAt }]
   state.classes  = [{ id, date, hours, topic, notes,
                        students: [{ studentId, questionsPassed }] }]
                    -- one "class" = one slot/hour, up to 15 students
   state.coupons  = { amazon:[...], flipkart:[...], meesho:[...], grocery:[...] }

   Editing (add/edit/delete students, classes, coupons) only happens
   from the Admin page, reached via the "Admin mode" switch in Profile.
   The Students / Rewards tabs are read-only views.
   ========================================================= */

const STORAGE_KEY = 'mentorledger_v2';
const BRANDS = [
  { id: 'amazon',   label: 'Amazon'   },
  { id: 'flipkart', label: 'Flipkart' },
  { id: 'meesho',   label: 'Meesho'   },
  { id: 'grocery',  label: 'Grocery'  },
];
const MAX_CLASS_STUDENTS = 15;
// 4 auto-generated daily slots, evenly spread across the 5pm–10pm window
const DAILY_SLOT_TIMES = ['17:00', '18:15', '19:30', '20:45'];

let state = null;

/* ---------------- utils ---------------- */
function uid(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
function todayStr(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function fmtDate(iso){
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtMonthKey(iso){ return iso.slice(0,7); }
function fmtMonthLabel(key){
  const [y,m] = key.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleDateString('en-IN', { month:'long', year:'numeric' });
}
function fmtTime(hhmm){
  if (!hhmm) return '';
  const [h,m] = hhmm.split(':').map(Number);
  const d = new Date(); d.setHours(h,m,0,0);
  return d.toLocaleTimeString('en-IN', { hour:'numeric', minute:'2-digit', hour12:true });
}
function nowTimeStr(){
  const d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
function initials(name){
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
}
function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function num(v, fallback=0){ const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; }
function trimNum(n){
  n = num(n);
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/,'');
}

/* ---------------- persistence ---------------- */
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(e){ console.error('load failed', e); return null; }
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.error('save failed', e); toast('Could not save — storage may be full'); }
}

/* ---------------- sample data ---------------- */
const SAMPLE_STUDENT_NAMES = [
  'Aravind Kumar', 'Bhuvaneshwari Raj', 'Charan Prakash', 'Deepika Elango',
  'Elavarasan Muthu', 'Gayathri Subramaniam', 'Hariharan Balaji', 'Ilakkiya Ravi',
  'Jeyakumar Palani', 'Kavya Sridhar', 'Lakshmi Narayanan', 'Manikandan Selvam',
  'Nandhini Balasubramaniam', 'Pradeep Rajendran', 'Ramya Krishnan'
];
const SAMPLE_CLASSES_SPEC = [
  { offset:32, time:'17:30', hours:1.5, topic:'Arrays basics',                 count:15 },
  { offset:26, time:'18:00', hours:1,   topic:'Loops & control flow',           count:13 },
  { offset:20, time:'19:15', hours:1,   topic:'Recursion intro',                count:12 },
  { offset:14, time:'20:00', hours:1.5, topic:'Hashmaps & sets',                count:14 },
  { offset:7,  time:'18:45', hours:1,   topic:'Two pointers & sliding window',  count:15 },
  { offset:2,  time:'21:00', hours:2,   topic:'Graphs & DP basics',             count:10 },
];

function seedSampleData(name, photo){
  const day = (offset) => {
    const d = new Date(); d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0,10);
  };
  const students = SAMPLE_STUDENT_NAMES.map((n, i) => ({
    id: uid(), name: n, photo: null, phone: '', notes: '', createdAt: day(40 - i)
  }));

  const classes = SAMPLE_CLASSES_SPEC.map((spec, ci) => {
    const attendees = students.slice(0, spec.count).map((s, si) => ({
      studentId: s.id,
      // deterministic but varied-looking result per student per class
      questionsPassed: (si + ci * 2) % 4
    }));
    return {
      id: uid(),
      date: day(spec.offset),
      time: spec.time,
      hours: spec.hours,
      topic: spec.topic,
      notes: '',
      students: attendees,
    };
  });

  state = {
    profile: {
      name: name || 'Prasanth',
      photo: photo || null,
      role: 'Coding Trainer',
      since: todayStr(),
    },
    settings: { stipendRate: 100, theme: 'auto', adminMode: false, autoSlotDates: [] },
    students,
    classes,
    coupons: {
      amazon:   [ { id:uid(), code:'AMZN200', value:200, redeemed:false, note:'Festive reward', addedDate:todayStr() } ],
      flipkart: [ { id:uid(), code:'FLIP150', value:150, redeemed:true,  note:'Used last month', addedDate:todayStr() } ],
      meesho:   [ { id:uid(), code:'MSH100',  value:100, redeemed:false, note:'', addedDate:todayStr() } ],
      grocery:  [ { id:uid(), code:'GROC300', value:300, redeemed:false, note:'Monthly grocery credit', addedDate:todayStr() },
                  { id:uid(), code:'GROC100', value:100, redeemed:true,  note:'', addedDate:todayStr() } ],
    }
  };
  save();
}

/* ---------------- derived data ---------------- */
function studentsById(){
  const map = {};
  state.students.forEach(s => map[s.id] = s);
  return map;
}
// classes a given student attended, each paired with that student's own result, newest first
function classesForStudent(id){
  return state.classes
    .filter(c => c.students.some(x => x.studentId === id))
    .map(c => ({ cls: c, result: c.students.find(x => x.studentId === id) }))
    .sort((a,b)=> (b.cls.date+(b.cls.time||'')).localeCompare(a.cls.date+(a.cls.time||'')));
}
function bestPassForStudent(id){
  const list = classesForStudent(id);
  if (!list.length) return null;
  return Math.max(...list.map(x => x.result.questionsPassed || 0));
}
function totalHours(){
  return state.classes.reduce((sum,c)=> sum + num(c.hours), 0);
}
function stipendTotal(){ return totalHours() * state.settings.stipendRate; }

// Auto-create 4 empty slots (5pm–10pm window) for today, once per day.
// Admin can freely delete or add to them afterwards — this never re-runs
// for a date that's already been auto-filled once.
function ensureDailySlots(){
  if (!state.settings.autoSlotDates) state.settings.autoSlotDates = [];
  const today = todayStr();
  if (state.settings.autoSlotDates.includes(today)) return;
  DAILY_SLOT_TIMES.forEach(time => {
    state.classes.push({
      id: uid(), date: today, time, hours: 1, topic: '', notes: '', students: []
    });
  });
  state.settings.autoSlotDates.push(today);
  save();
}

/* ---------------- theme ---------------- */
function applyTheme(){
  const t = state?.settings?.theme || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme){
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) metaTheme.setAttribute('content', bg);
  }
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), 2200);
}

/* ---------------- sheets ---------------- */
function openSheet(id){
  document.getElementById('overlay').hidden = false;
  requestAnimationFrame(()=> document.getElementById('overlay').classList.add('show'));
  const sheet = document.getElementById(id);
  sheet.hidden = false;
  requestAnimationFrame(()=> sheet.classList.add('open'));
  sheet.setAttribute('aria-hidden','false');
}
function closeAllSheets(){
  document.querySelectorAll('.sheet.open').forEach(s => {
    s.classList.remove('open');
    s.setAttribute('aria-hidden','true');
  });
  document.getElementById('overlay').classList.remove('show');
  setTimeout(()=> document.getElementById('overlay').hidden = true, 220);
}
document.getElementById('overlay').addEventListener('click', closeAllSheets);
document.querySelectorAll('.close-sheet').forEach(btn => btn.addEventListener('click', closeAllSheets));

let confirmResolver = null;
function confirmAction(title, message){
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  openSheet('confirmDialog');
  return new Promise(resolve => { confirmResolver = resolve; });
}
document.getElementById('confirmCancel').addEventListener('click', ()=>{
  closeAllSheets(); if (confirmResolver) confirmResolver(false);
});
document.getElementById('confirmOk').addEventListener('click', ()=>{
  closeAllSheets(); if (confirmResolver) confirmResolver(true);
});

/* ---------------- navigation ---------------- */
function goToPage(name){
  if (name === 'admin' && !state.settings.adminMode) name = 'dashboard';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  document.getElementById('content').scrollTop = 0;
  renderPage(name);
}
document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', ()=> goToPage(btn.dataset.page)));
document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', ()=> goToPage(btn.dataset.nav)));

function renderPage(name){
  if (name === 'dashboard') renderDashboard();
  else if (name === 'students') renderStudents('studentList', false, studentSearchTerm);
  else if (name === 'stipend') renderStipend();
  else if (name === 'rewards') renderRewards('brandGrid', 'couponListsWrap', false);
  else if (name === 'admin') renderAdminPage();
}

/* ---------------- topbar / profile ---------------- */
function renderTopbar(){
  document.getElementById('topDate').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  const initEl = document.getElementById('avatarInitial');
  const imgEl = document.getElementById('avatarImg');
  if (state.profile.photo){
    imgEl.src = state.profile.photo; imgEl.hidden = false; initEl.style.opacity = 0;
  } else {
    imgEl.hidden = true; initEl.style.opacity = 1; initEl.textContent = initials(state.profile.name);
  }
  document.getElementById('navAdminBtn').hidden = !state.settings.adminMode;
}
function openProfileSheet(){
  document.getElementById('profileNameDisplay').textContent = state.profile.name;
  document.getElementById('profileSince').textContent = 'Member since ' + fmtDate(state.profile.since);
  document.getElementById('themeSelect').value = state.settings.theme;
  document.getElementById('adminModeToggle').checked = !!state.settings.adminMode;
  const img = document.getElementById('profilePhotoImg');
  const initial = document.getElementById('profilePhotoInitial');
  if (state.profile.photo){ img.src = state.profile.photo; img.hidden = false; initial.style.opacity = 0; }
  else { img.hidden = true; initial.style.opacity = 1; initial.textContent = initials(state.profile.name); }
  openSheet('profileSheet');
}
document.getElementById('avatarBtn').addEventListener('click', openProfileSheet);

document.getElementById('profilePhotoBtn').addEventListener('click', ()=> document.getElementById('profilePhotoInput').click());
document.getElementById('profilePhotoInput').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if (!file) return;
  readFileAsDataURL(file, (dataUrl)=>{
    const img = document.getElementById('profilePhotoImg');
    img.src = dataUrl; img.hidden = false;
    document.getElementById('profilePhotoInitial').style.opacity = 0;
    state.profile.photo = dataUrl;
    save(); renderTopbar();
  });
});
document.getElementById('themeSelect').addEventListener('change', (e)=>{
  state.settings.theme = e.target.value;
  save(); applyTheme();
});
document.getElementById('adminModeToggle').addEventListener('change', (e)=>{
  state.settings.adminMode = e.target.checked;
  save();
  renderTopbar();
  if (state.settings.adminMode){
    closeAllSheets();
    goToPage('admin');
    toast('Admin mode on');
  } else {
    toast('Admin mode off');
    if (currentPage() === 'admin') goToPage('dashboard');
  }
});

function currentPage(){
  const active = document.querySelector('.page.active');
  return active ? active.id.replace('page-','') : 'dashboard';
}

/* export / import / reset */
document.getElementById('exportDataBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `mentorledger-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Backup downloaded');
});
document.getElementById('importDataBtn').addEventListener('click', ()=> document.getElementById('importDataInput').click());
document.getElementById('importDataInput').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if (!parsed.profile || !parsed.students || !parsed.classes || !parsed.coupons) throw new Error('bad shape');
      state = parsed;
      if (!state.settings) state.settings = { stipendRate:100, theme:'auto', adminMode:false, autoSlotDates:[] };
      if (typeof state.settings.adminMode !== 'boolean') state.settings.adminMode = false;
      if (!Array.isArray(state.settings.autoSlotDates)) state.settings.autoSlotDates = [];
      ensureDailySlots();
      save(); applyTheme(); renderTopbar(); renderPage(currentPage()); closeAllSheets();
      toast('Backup restored');
    }catch(err){ toast('That file could not be read'); }
  };
  reader.readAsText(file);
  e.target.value = '';
});
document.getElementById('resetSampleBtn').addEventListener('click', async ()=>{
  const ok = await confirmAction('Reload sample data?', 'This replaces your students, classes and coupons with the sample set. Your name/photo stays.');
  if (!ok) return;
  const keepName = state.profile.name, keepPhoto = state.profile.photo;
  const keepAdmin = state.settings.adminMode, keepTheme = state.settings.theme;
  seedSampleData(keepName, keepPhoto);
  state.settings.adminMode = keepAdmin; state.settings.theme = keepTheme;
  ensureDailySlots();
  save(); applyTheme(); renderTopbar(); renderPage(currentPage()); closeAllSheets();
  toast('Sample data loaded');
});
document.getElementById('clearAllBtn').addEventListener('click', async ()=>{
  const ok = await confirmAction('Erase everything?', 'This permanently deletes all students, classes and coupons on this device. This cannot be undone.');
  if (!ok) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

/* ---------------- file -> dataURL (with downscale) ---------------- */
function readFileAsDataURL(file, cb){
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const MAX = 320;
      let { width, height } = img;
      if (width > height && width > MAX){ height = height * (MAX/width); width = MAX; }
      else if (height > MAX){ width = width * (MAX/height); height = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      cb(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* =========================================================
   DASHBOARD
   ========================================================= */
function renderDashboard(){
  document.getElementById('statStudents').textContent = state.students.length;
  document.getElementById('statHours').textContent = trimNum(totalHours());
  document.getElementById('statSessions').textContent = state.classes.length;

  const counts = { 3:0, 2:0, 1:0 };
  state.students.forEach(s => {
    const best = bestPassForStudent(s.id);
    if (best === 3) counts[3]++;
    else if (best === 2) counts[2]++;
    else if (best === 1) counts[1]++;
  });
  const total = state.students.length || 1;
  const ringsWrap = document.getElementById('passRings');
  const specs = [
    { n:3, color:'var(--accent-primary)', label:'passed all 3' },
    { n:2, color:'var(--accent-money)',   label:'passed 2' },
    { n:1, color:'var(--ink-muted)',      label:'passed 1' },
  ];
  ringsWrap.innerHTML = specs.map(sp => {
    const c = counts[sp.n];
    const frac = c / total;
    const r = 26, circ = 2*Math.PI*r;
    const dash = Math.max(0, frac*circ - (frac>0? 2:0));
    return `<div class="ring-item">
      <svg viewBox="0 0 64 64">
        <circle class="ring-track" cx="32" cy="32" r="${r}"></circle>
        <circle class="ring-fill" cx="32" cy="32" r="${r}" stroke="${sp.color}" stroke-dasharray="${dash} ${circ}"></circle>
        <text x="32" y="37" text-anchor="middle" class="ring-num" fill="${sp.color}" style="font-family:var(--font-mono)">${c}</text>
      </svg>
      <span class="ring-cap">student${c===1?'':'s'}<br>${sp.label}</span>
    </div>`;
  }).join('');

  const recent = [...state.classes].sort((a,b)=> (b.date+(b.time||'')).localeCompare(a.date+(a.time||''))).slice(0,6);
  const listEl = document.getElementById('recentSessions');
  if (!recent.length){
    listEl.innerHTML = `<li class="ledger-empty">No classes logged yet. Turn on Admin mode from Profile to log your first class.</li>`;
  } else {
    listEl.innerHTML = recent.map(c => `
      <li class="ledger-row">
        <div class="ledger-left">
          <div>
            <div class="ledger-title">${escapeHtml(c.topic || 'Class')}</div>
            <div class="ledger-sub">${fmtDate(c.date)} · ${fmtTime(c.time)} · ${trimNum(c.hours)}h</div>
          </div>
        </div>
        <span class="pass-chip">${c.students.length} student${c.students.length===1?'':'s'}</span>
      </li>`).join('');
  }
}

/* =========================================================
   STUDENTS  (renderStudents is shared by the read-only
   Students tab and the Admin page's Students section)
   ========================================================= */
let studentSearchTerm = '';
let adminStudentSearchTerm = '';
document.getElementById('studentSearch').addEventListener('input', (e)=>{
  studentSearchTerm = e.target.value.trim().toLowerCase();
  renderStudents('studentList', false, studentSearchTerm);
});
document.getElementById('adminStudentSearch').addEventListener('input', (e)=>{
  adminStudentSearchTerm = e.target.value.trim().toLowerCase();
  renderStudents('adminStudentList', true, adminStudentSearchTerm);
});

function renderStudents(listElId, admin, searchTerm){
  const listEl = document.getElementById(listElId);
  let list = [...state.students].sort((a,b)=> a.name.localeCompare(b.name));
  if (searchTerm) list = list.filter(s => s.name.toLowerCase().includes(searchTerm));
  if (!list.length){
    listEl.innerHTML = `<div class="empty-state"><h3>No students yet</h3><p>${admin ? 'Tap the + button to add your first student.' : 'Nothing to show yet.'}</p></div>`;
    return;
  }
  listEl.innerHTML = list.map(s => {
    const classes = classesForStudent(s.id);
    const hrs = classes.reduce((sum,x)=> sum + num(x.cls.hours), 0);
    const avatar = s.photo
      ? `<div class="student-avatar"><img src="${s.photo}" alt=""></div>`
      : `<div class="student-avatar">${initials(s.name)}</div>`;
    return `<li class="student-row" onclick="openStudentSheet('${s.id}', ${admin})">
      ${avatar}
      <div class="student-info">
        <div class="student-name">${escapeHtml(s.name)}</div>
        <div class="student-meta">${classes.length} class${classes.length===1?'':'es'} · ${trimNum(hrs)}h</div>
      </div>
      <span class="student-chev">›</span>
    </li>`;
  }).join('');
}

document.getElementById('adminAddStudentBtn').addEventListener('click', ()=> openStudentForm());

function openStudentForm(studentId){
  const form = document.getElementById('studentForm');
  form.reset();
  document.getElementById('studentFormPhotoImg').hidden = true;
  document.getElementById('studentFormPhotoImg').removeAttribute('src');
  document.getElementById('studentFormPhotoImg').dataset.pending = '';
  document.getElementById('studentFormPhotoInitial').style.opacity = 1;
  document.getElementById('studentFormPhotoInitial').textContent = '+';

  if (studentId){
    const s = state.students.find(x=>x.id===studentId);
    document.getElementById('studentFormTitle').textContent = 'Edit student';
    document.getElementById('studentFormId').value = s.id;
    document.getElementById('studentFormName').value = s.name;
    document.getElementById('studentFormPhone').value = s.phone || '';
    document.getElementById('studentFormNotes').value = s.notes || '';
    if (s.photo){
      document.getElementById('studentFormPhotoImg').src = s.photo;
      document.getElementById('studentFormPhotoImg').hidden = false;
      document.getElementById('studentFormPhotoInitial').style.opacity = 0;
    } else {
      document.getElementById('studentFormPhotoInitial').textContent = initials(s.name);
    }
  } else {
    document.getElementById('studentFormTitle').textContent = 'Add student';
    document.getElementById('studentFormId').value = '';
  }
  openSheet('studentFormSheet');
}
document.getElementById('studentFormPhotoBtn').addEventListener('click', ()=> document.getElementById('studentFormPhotoInput').click());
document.getElementById('studentFormPhotoInput').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if (!file) return;
  readFileAsDataURL(file, (dataUrl)=>{
    const img = document.getElementById('studentFormPhotoImg');
    img.src = dataUrl; img.hidden = false; img.dataset.pending = dataUrl;
    document.getElementById('studentFormPhotoInitial').style.opacity = 0;
  });
});
document.getElementById('studentForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = document.getElementById('studentFormId').value;
  const name = document.getElementById('studentFormName').value.trim();
  if (!name) return;
  const phone = document.getElementById('studentFormPhone').value.trim();
  const notes = document.getElementById('studentFormNotes').value.trim();
  const pendingPhoto = document.getElementById('studentFormPhotoImg').dataset.pending;
  if (id){
    const s = state.students.find(x=>x.id===id);
    s.name = name; s.phone = phone; s.notes = notes;
    if (pendingPhoto) s.photo = pendingPhoto;
  } else {
    state.students.push({ id:uid(), name, phone, notes, photo: pendingPhoto || null, createdAt: todayStr() });
  }
  save(); closeAllSheets();
  renderDashboard();
  renderStudents('adminStudentList', true, adminStudentSearchTerm);
  if (currentPage()==='students') renderStudents('studentList', false, studentSearchTerm);
  toast(id ? 'Student updated' : 'Student added');
});

let activeStudentId = null;
let activeStudentIsAdmin = false;
function openStudentSheet(id, admin){
  activeStudentId = id;
  activeStudentIsAdmin = !!admin;
  const s = state.students.find(x=>x.id===id);
  if (!s) return;
  document.getElementById('studentSheetName').textContent = s.name;
  const wrap = document.getElementById('studentSheetAvatarWrap');
  wrap.innerHTML = s.photo ? `<img src="${s.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : `<span>${initials(s.name)}</span>`;
  const classes = classesForStudent(id);
  const hrs = classes.reduce((sum,x)=> sum + num(x.cls.hours), 0);
  document.getElementById('studentSheetHours').textContent = trimNum(hrs);
  document.getElementById('studentSheetSessions').textContent = classes.length;
  const best = bestPassForStudent(id);
  document.getElementById('studentSheetBest').textContent = (best===null ? '—' : best + '/3');

  const actionsEl = document.querySelector('#studentSheet .student-detail-actions');
  actionsEl.style.display = activeStudentIsAdmin ? 'flex' : 'none';

  const listEl = document.getElementById('studentSessionList');
  if (!classes.length){
    listEl.innerHTML = `<li class="ledger-empty">No classes logged for ${escapeHtml(s.name)} yet.</li>`;
  } else {
    listEl.innerHTML = classes.map(({cls, result}) => `
      <li class="ledger-row">
        <div class="ledger-left">
          <div>
            <div class="ledger-title">${fmtDate(cls.date)} · ${fmtTime(cls.time)} · ${trimNum(cls.hours)}h</div>
            <div class="ledger-sub">${cls.topic ? escapeHtml(cls.topic) : 'No topic noted'}</div>
          </div>
        </div>
        <span class="pass-chip p${result.questionsPassed}">${result.questionsPassed}/3</span>
      </li>`).join('');
  }
  openSheet('studentSheet');
}
window.openStudentSheet = openStudentSheet;

document.getElementById('editStudentBtn').addEventListener('click', ()=> { closeAllSheets(); setTimeout(()=>openStudentForm(activeStudentId), 240); });
document.getElementById('deleteStudentBtn').addEventListener('click', async ()=>{
  const s = state.students.find(x=>x.id===activeStudentId);
  const ok = await confirmAction('Delete student?', `This removes ${s.name} and their results from every logged class. This cannot be undone.`);
  if (!ok) return;
  state.students = state.students.filter(x=>x.id!==activeStudentId);
  state.classes.forEach(c => { c.students = c.students.filter(x=>x.studentId!==activeStudentId); });
  save(); closeAllSheets();
  renderDashboard();
  renderStudents('adminStudentList', true, adminStudentSearchTerm);
  renderAdminClasses();
  if (currentPage()==='students') renderStudents('studentList', false, studentSearchTerm);
  toast('Student deleted');
});

/* =========================================================
   CLASSES  (batch — up to 15 students per class, Admin only)
   ========================================================= */
document.getElementById('adminLogClassBtn').addEventListener('click', ()=> openClassForm());

function renderClassStudentChecklist(preset){
  // preset: Map(studentId -> questionsPassed) for students already in the class being edited
  const wrap = document.getElementById('classStudentsList');
  const sorted = [...state.students].sort((a,b)=> a.name.localeCompare(b.name));
  wrap.innerHTML = sorted.map(s => {
    const has = preset && preset.has(s.id);
    const val = has ? preset.get(s.id) : 0;
    const segs = [0,1,2,3].map(v => `<button type="button" data-val="${v}" class="${v===val?'active':''}">${v}</button>`).join('');
    return `<div class="class-student-row" data-student-id="${s.id}">
      <label class="cs-check">
        <input type="checkbox" class="csCheckbox" ${has?'checked':''}>
        <span>${escapeHtml(s.name)}</span>
      </label>
      <div class="mini-segmented cs-segmented ${has?'':'disabled'}">${segs}</div>
    </div>`;
  }).join('');
}
document.getElementById('classStudentsList').addEventListener('change', (e)=>{
  if (!e.target.classList.contains('csCheckbox')) return;
  const row = e.target.closest('.class-student-row');
  const seg = row.querySelector('.cs-segmented');
  const checkedCount = document.querySelectorAll('.csCheckbox:checked').length;
  if (e.target.checked && checkedCount > MAX_CLASS_STUDENTS){
    e.target.checked = false;
    toast(`A class can have at most ${MAX_CLASS_STUDENTS} students`);
    return;
  }
  seg.classList.toggle('disabled', !e.target.checked);
});
document.getElementById('classStudentsList').addEventListener('click', (e)=>{
  const btn = e.target.closest('.cs-segmented button'); if (!btn) return;
  const seg = btn.closest('.cs-segmented');
  seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b===btn));
});

function openClassForm(classId){
  const form = document.getElementById('sessionForm');
  form.reset();
  document.getElementById('sessionFormId').value = classId || '';
  document.getElementById('sessionDate').value = todayStr();
  document.getElementById('sessionTime').value = nowTimeStr();
  document.getElementById('sessionHours').value = 1;
  document.getElementById('sessionTopic').value = '';
  document.getElementById('sessionNotes').value = '';
  document.getElementById('sessionFormTitle').textContent = classId ? 'Edit class' : 'Log a class';
  document.getElementById('deleteClassInFormBtn').hidden = !classId;

  let preset = null;
  if (classId){
    const c = state.classes.find(x=>x.id===classId);
    document.getElementById('sessionDate').value = c.date;
    document.getElementById('sessionTime').value = c.time || nowTimeStr();
    document.getElementById('sessionHours').value = c.hours;
    document.getElementById('sessionTopic').value = c.topic || '';
    document.getElementById('sessionNotes').value = c.notes || '';
    preset = new Map(c.students.map(x=>[x.studentId, x.questionsPassed]));
  }
  renderClassStudentChecklist(preset);
  openSheet('sessionFormSheet');
}
window.openClassForm = openClassForm;

document.getElementById('sessionForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = document.getElementById('sessionFormId').value;
  const date = document.getElementById('sessionDate').value || todayStr();
  const time = document.getElementById('sessionTime').value || nowTimeStr();
  const hours = Math.max(0.5, num(document.getElementById('sessionHours').value, 1));
  const topic = document.getElementById('sessionTopic').value.trim();
  const notes = document.getElementById('sessionNotes').value.trim();

  const studentsInClass = [];
  document.querySelectorAll('.class-student-row').forEach(row => {
    const checkbox = row.querySelector('.csCheckbox');
    if (!checkbox.checked) return;
    const activeBtn = row.querySelector('.cs-segmented button.active');
    studentsInClass.push({
      studentId: row.dataset.studentId,
      questionsPassed: Number(activeBtn?.dataset.val || 0)
    });
  });
  if (!studentsInClass.length){
    toast('Select at least one student');
    return;
  }

  if (id){
    const c = state.classes.find(x=>x.id===id);
    Object.assign(c, { date, time, hours, topic, notes, students: studentsInClass });
  } else {
    state.classes.push({ id:uid(), date, time, hours, topic, notes, students: studentsInClass });
  }
  save(); closeAllSheets();
  renderDashboard();
  renderAdminClasses();
  renderStipend();
  toast(id ? 'Class updated' : 'Class logged');
});
document.getElementById('deleteClassInFormBtn').addEventListener('click', async ()=>{
  const id = document.getElementById('sessionFormId').value;
  if (!id) return;
  const ok = await confirmAction('Delete this class?', 'This removes it and every student\u2019s result for it. This cannot be undone.');
  if (!ok) return;
  state.classes = state.classes.filter(x=>x.id!==id);
  save(); closeAllSheets();
  renderDashboard();
  renderAdminClasses();
  renderStipend();
  toast('Class deleted');
});
function deleteClass(id){
  confirmAction('Delete this class?', 'This removes it and every student\u2019s result for it. This cannot be undone.').then(ok=>{
    if (!ok) return;
    state.classes = state.classes.filter(x=>x.id!==id);
    save();
    renderDashboard();
    renderAdminClasses();
    renderStipend();
    toast('Class deleted');
  });
}
window.deleteClass = deleteClass;

function renderAdminClasses(){
  const listEl = document.getElementById('adminClassList');
  if (!listEl) return;
  const sorted = [...state.classes].sort((a,b)=> (b.date+ (b.time||'')).localeCompare(a.date + (a.time||'')));
  if (!sorted.length){
    listEl.innerHTML = `<li class="ledger-empty">No classes logged yet. Tap + to log your first class.</li>`;
    return;
  }
  listEl.innerHTML = sorted.map(c => {
    const title = c.topic || (c.students.length ? 'Class' : 'Empty slot — tap to fill');
    return `
    <li class="ledger-row" onclick="openClassForm('${c.id}')">
      <div class="ledger-left"><div>
        <div class="ledger-title">${escapeHtml(title)}</div>
        <div class="ledger-sub">${fmtDate(c.date)} · ${fmtTime(c.time)} · ${trimNum(c.hours)}h · ${c.students.length} student${c.students.length===1?'':'s'}</div>
      </div></div>
      <div class="coupon-actions">
        <button class="mini-btn" onclick="event.stopPropagation(); deleteClass('${c.id}')">✕</button>
      </div>
    </li>`;
  }).join('');
}

/* =========================================================
   STIPEND
   ========================================================= */
function renderStipend(){
  const rate = state.settings.stipendRate;
  const hrs = totalHours();
  document.getElementById('stipendTotal').textContent = Math.round(hrs*rate).toLocaleString('en-IN');
  document.getElementById('stipendFormula').textContent = `${trimNum(hrs)} slots × ₹${rate} / slot`;

  const byMonth = {};
  state.classes.forEach(c => {
    const key = fmtMonthKey(c.date);
    byMonth[key] = byMonth[key] || { hours:0, count:0 };
    byMonth[key].hours += num(c.hours);
    byMonth[key].count += 1;
  });
  const months = Object.keys(byMonth).sort().reverse();
  const monthEl = document.getElementById('monthlyBreakdown');
  if (!months.length){
    monthEl.innerHTML = `<li class="ledger-empty">No classes logged yet.</li>`;
  } else {
    monthEl.innerHTML = months.map(k => {
      const m = byMonth[k];
      return `<li class="ledger-row month-row">
        <div class="ledger-left"><div>
          <div class="ledger-title">${fmtMonthLabel(k)}</div>
          <div class="ledger-sub">${m.count} class${m.count===1?'':'es'} · ${trimNum(m.hours)}h</div>
        </div></div>
        <div class="ledger-right"><span class="ledger-amount mono">₹${Math.round(m.hours*rate).toLocaleString('en-IN')}</span></div>
      </li>`;
    }).join('');
  }

  const ledgerEl = document.getElementById('stipendLedger');
  const sorted = [...state.classes].sort((a,b)=> (b.date+(b.time||'')).localeCompare(a.date+(a.time||'')));
  if (!sorted.length){
    ledgerEl.innerHTML = `<li class="ledger-empty">Nothing to show yet.</li>`;
  } else {
    ledgerEl.innerHTML = sorted.map(c => `
      <li class="ledger-row">
        <div class="ledger-left"><div>
          <div class="ledger-title">${escapeHtml(c.topic || 'Class')}</div>
          <div class="ledger-sub">${fmtDate(c.date)} · ${fmtTime(c.time)} · ${trimNum(c.hours)}h · ${c.students.length} student${c.students.length===1?'':'s'}</div>
        </div></div>
        <div class="ledger-right"><span class="ledger-amount mono">₹${Math.round(c.hours*rate).toLocaleString('en-IN')}</span></div>
      </li>`).join('');
  }
}

/* =========================================================
   REWARDS  (renderRewards shared by read-only Rewards tab
   and the Admin page's Coupons section)
   ========================================================= */
function couponStats(brandId){
  const list = state.coupons[brandId] || [];
  const active = list.filter(c=>!c.redeemed);
  return {
    count: list.length,
    activeCount: active.length,
    activeValue: active.reduce((sum,c)=> sum + num(c.value), 0),
  };
}
function renderRewards(gridElId, listsElId, admin){
  const grid = document.getElementById(gridElId);
  grid.innerHTML = BRANDS.map(b => {
    const st = couponStats(b.id);
    const onclick = admin ? ` onclick="openCouponForm('${b.id}')"` : '';
    return `<button class="brand-card ${b.id} ${admin?'':'readonly'}"${onclick}${admin?'':' tabindex="-1"'}>
      <div class="brand-card-name">${b.label}</div>
      <div class="brand-card-count">${st.activeCount} active · ${st.count} total</div>
      <div class="brand-card-value">₹${st.activeValue.toLocaleString('en-IN')}</div>
    </button>`;
  }).join('');

  const wrap = document.getElementById(listsElId);
  wrap.innerHTML = BRANDS.map(b => {
    const list = [...(state.coupons[b.id]||[])].sort((a,b2)=> (a.redeemed - b2.redeemed) || b2.addedDate?.localeCompare(a.addedDate||''));
    const items = list.length
      ? list.map(c => `
        <div class="coupon-item ${c.redeemed?'redeemed':''}">
          <div>
            <div class="coupon-code">${escapeHtml(c.code || 'No code')}</div>
            <div class="coupon-note">${c.note ? escapeHtml(c.note) : (c.redeemed?'Redeemed':'Available')}</div>
          </div>
          <div class="coupon-actions">
            <span class="coupon-value">₹${num(c.value).toLocaleString('en-IN')}</span>
            ${admin ? `<button class="mini-btn ${c.redeemed?'':'on'}" onclick="toggleCoupon('${b.id}','${c.id}')">${c.redeemed?'Unmark':'Mark used'}</button>
            <button class="mini-btn" onclick="deleteCoupon('${b.id}','${c.id}')">✕</button>` : ''}
          </div>
        </div>`).join('')
      : `<div class="ledger-empty" style="border-radius:var(--radius-md);border:1px solid var(--line);">No ${b.label} coupons yet.</div>`;
    return `<div class="coupon-brand-block">
      <div class="section-head tight"><h2>${b.label}</h2></div>
      ${items}
      ${admin ? `<button class="ghost-btn full add-coupon-btn" onclick="openCouponForm('${b.id}')">+ Add ${b.label} coupon</button>` : ''}
    </div>`;
  }).join('');
}
function openCouponForm(brandId, couponId){
  const form = document.getElementById('couponForm');
  form.reset();
  document.getElementById('couponBrand').value = brandId;
  document.getElementById('couponFormId').value = couponId || '';
  document.getElementById('couponFormTitle').textContent = couponId ? 'Edit coupon' : 'Add coupon';
  if (couponId){
    const c = (state.coupons[brandId]||[]).find(x=>x.id===couponId);
    if (c){
      document.getElementById('couponCode').value = c.code || '';
      document.getElementById('couponValue').value = c.value;
      document.getElementById('couponNote').value = c.note || '';
    }
  }
  openSheet('couponFormSheet');
}
window.openCouponForm = openCouponForm;
document.getElementById('couponForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const brand = document.getElementById('couponBrand').value;
  const id = document.getElementById('couponFormId').value;
  const code = document.getElementById('couponCode').value.trim().toUpperCase();
  const value = Math.max(0, num(document.getElementById('couponValue').value));
  const note = document.getElementById('couponNote').value.trim();
  state.coupons[brand] = state.coupons[brand] || [];
  if (id){
    const c = state.coupons[brand].find(x=>x.id===id);
    Object.assign(c, { code, value, note });
  } else {
    state.coupons[brand].push({ id:uid(), code, value, note, redeemed:false, addedDate: todayStr() });
  }
  save(); closeAllSheets();
  renderRewards('adminBrandGrid', 'adminCouponListsWrap', true);
  if (currentPage()==='rewards') renderRewards('brandGrid', 'couponListsWrap', false);
  toast(id ? 'Coupon updated' : 'Coupon added');
});
function toggleCoupon(brand, id){
  const c = (state.coupons[brand]||[]).find(x=>x.id===id);
  if (!c) return;
  c.redeemed = !c.redeemed;
  save();
  renderRewards('adminBrandGrid', 'adminCouponListsWrap', true);
  if (currentPage()==='rewards') renderRewards('brandGrid', 'couponListsWrap', false);
}
function deleteCoupon(brand, id){
  confirmAction('Delete coupon?', 'This removes it permanently.').then(ok=>{
    if (!ok) return;
    state.coupons[brand] = (state.coupons[brand]||[]).filter(x=>x.id!==id);
    save();
    renderRewards('adminBrandGrid', 'adminCouponListsWrap', true);
    if (currentPage()==='rewards') renderRewards('brandGrid', 'couponListsWrap', false);
  });
}
window.toggleCoupon = toggleCoupon;
window.deleteCoupon = deleteCoupon;

/* =========================================================
   ADMIN PAGE
   ========================================================= */
document.getElementById('adminSaveSettingsBtn').addEventListener('click', ()=>{
  const name = document.getElementById('adminNameInput').value.trim() || 'Trainer';
  const rate = num(document.getElementById('adminRateInput').value, state.settings.stipendRate);
  state.profile.name = name;
  state.settings.stipendRate = Math.max(0, rate);
  save(); renderTopbar(); renderStipend();
  toast('Settings saved');
});
function renderAdminPage(){
  document.getElementById('adminNameInput').value = state.profile.name;
  document.getElementById('adminRateInput').value = state.settings.stipendRate;
  renderStudents('adminStudentList', true, adminStudentSearchTerm);
  renderAdminClasses();
  renderRewards('adminBrandGrid', 'adminCouponListsWrap', true);
}

/* =========================================================
   ONBOARDING
   ========================================================= */
document.getElementById('onboardPhotoBtn').addEventListener('click', ()=> document.getElementById('onboardPhotoInput').click());
document.getElementById('onboardPhotoInput').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if (!file) return;
  readFileAsDataURL(file, (dataUrl)=>{
    const preview = document.getElementById('onboardPhotoPreview');
    preview.src = dataUrl; preview.hidden = false; preview.dataset.pending = dataUrl;
    document.getElementById('onboardPhotoBtn').textContent = 'Photo added ✓';
  });
});
document.getElementById('onboardForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const name = document.getElementById('onboardName').value.trim() || 'Prasanth';
  const photo = document.getElementById('onboardPhotoPreview').dataset.pending || null;
  seedSampleData(name, photo);
  boot();
});

/* =========================================================
   BOOT
   ========================================================= */
function boot(){
  state = load();
  if (!state){
    document.getElementById('onboarding').hidden = false;
    document.getElementById('app').hidden = true;
    return;
  }
  if (!state.settings) state.settings = { stipendRate:100, theme:'auto', adminMode:false, autoSlotDates:[] };
  if (typeof state.settings.adminMode !== 'boolean') state.settings.adminMode = false;
  if (!Array.isArray(state.settings.autoSlotDates)) state.settings.autoSlotDates = [];
  ensureDailySlots();
  document.getElementById('onboarding').hidden = true;
  document.getElementById('app').hidden = false;
  applyTheme();
  renderTopbar();
  goToPage('dashboard');
}
boot();

/* react to system theme changes when in auto mode */
if (window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', ()=>{
    if (!state || (state.settings && state.settings.theme === 'auto')) applyTheme();
  });
}

/* =========================================================
   PWA — service worker registration
   ========================================================= */
if ('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  });
}