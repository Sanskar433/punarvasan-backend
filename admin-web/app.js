/* ============================================================
   Punarvasan Tracker — Web Portal JavaScript
   Roles: Resident | Contractor | Government/SRA
   Backend: http://localhost:3001
   ============================================================ */

const API = 'http://localhost:3001/api';

// ── State ────────────────────────────────────────────────────
let authToken = localStorage.getItem('pun_token') || null;
let currentUser = JSON.parse(localStorage.getItem('pun_user') || 'null');
let otpMobile = null;
let currentPage = null;

// ── Localization (i18n) ──────────────────────────────────────
const i18n = {
  en: {
    dashboard: 'Dashboard',
    my_project: 'My Project',
    all_projects: 'All Projects',
    timeline: 'Progress Timeline',
    complaints: 'Complaints',
    my_complaints: 'My Complaints',
    notices: 'Government Notices',
    notifications: 'Notifications',
    daily_report: 'Daily Report',
    submit_progress: 'Submit Progress',
    my_updates: 'My Updates',
    review_queue: 'Review Queue',
    verification_queue: 'Verification Queue',
    reports: 'Reports & Analytics',
    resident: 'Resident',
    contractor: 'Contractor',
    government: 'Government / SRA Officer',
    avg_progress: 'Avg Progress',
    pending_reviews: 'Pending Reviews',
    total_families: 'Total Families',
    on_track: 'On Track',
    delayed: 'Delayed (30+ days inactive)',
    export_csv: 'Export CSV',
    map_view: 'Map View',
    list_view: 'List View',
  },
  mr: {
    dashboard: 'डॅशबोर्ड (Dashboard)',
    my_project: 'माझा प्रकल्प (My Project)',
    all_projects: 'सर्व प्रकल्प (All Projects)',
    timeline: 'काम प्रगती टाइमलाइन (Timeline)',
    complaints: 'तक्रारी (Complaints)',
    my_complaints: 'माझ्या तक्रारी (My Complaints)',
    notices: 'शासकीय सूचना (Notices)',
    notifications: 'सूचना (Notifications)',
    daily_report: 'दैनिक अहवाल (Daily Report)',
    submit_progress: 'प्रगती सादर करा (Submit Progress)',
    my_updates: 'माझे अपडेट्स (My Updates)',
    review_queue: 'तपासणी रांग (Review Queue)',
    verification_queue: 'पडताळणी रांग (Verification Queue)',
    reports: 'अहवाल आणि विश्लेषण (Reports)',
    resident: 'रहिवासी / लाभार्थी (Resident)',
    contractor: 'कंत्राटदार (Contractor)',
    government: 'शासकीय / एसआरए अधिकारी (SRA Officer)',
    avg_progress: 'सरासरी प्रगती',
    pending_reviews: 'प्रलंबित तपासण्या',
    total_families: 'एकूण कुटुंबे',
    on_track: 'वेळेवर (On Track)',
    delayed: 'विलंबित (३०+ दिवस निष्क्रिय)',
    export_csv: 'CSV निर्यात करा',
    map_view: 'नकाशा दृश्य (Map)',
    list_view: 'यादी दृश्य (List)',
  },
  hi: {
    dashboard: 'डैशबोर्ड (Dashboard)',
    my_project: 'मेरी परियोजना (My Project)',
    all_projects: 'सभी परियोजनाएं (All Projects)',
    timeline: 'प्रगति समयरेखा (Timeline)',
    complaints: 'शिकायतें (Complaints)',
    my_complaints: 'मेरी शिकायतें (My Complaints)',
    notices: 'सरकारी सूचनाएं (Notices)',
    notifications: 'अधिसूचनाएं (Notifications)',
    daily_report: 'दैनिक रिपोर्ट (Daily Report)',
    submit_progress: 'प्रगति दर्ज करें (Submit Progress)',
    my_updates: 'मेरे अपडेट (My Updates)',
    review_queue: 'समीक्षा कतार (Review Queue)',
    verification_queue: 'सत्यापन कतार (Verification Queue)',
    reports: 'रिपोर्ट एवं विश्लेषण (Reports)',
    resident: 'निवासी / लाभार्थी (Resident)',
    contractor: 'ठेकेदार (Contractor)',
    government: 'सरकारी / एसआरए अधिकारी (Govt Officer)',
    avg_progress: 'औसत प्रगति',
    pending_reviews: 'लंबित समीक्षाएं',
    total_families: 'कुल परिवार',
    on_track: 'समय पर (On Track)',
    delayed: 'विलंबित (30+ दिन से निष्क्रिय)',
    export_csv: 'CSV डाउनलोड करें',
    map_view: 'मानचित्र देखें (Map)',
    list_view: 'सूची देखें (List)',
  }
};

let currentLang = localStorage.getItem('pun_lang') || 'en';
function t(key) {
  return (i18n[currentLang] && i18n[currentLang][key]) || (i18n.en && i18n.en[key]) || key;
}
function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('pun_lang', lang);
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  if (currentUser) {
    buildNav();
    if (currentPage) showPage(currentPage);
  }
}

// ── Toast ────────────────────────────────────────────────────
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

function toast(msg, type = 'info', duration = 4000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || icons.info}</span><span>${msg}</span>`;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.classList.add('fadeout');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ── API Helper ───────────────────────────────────────────────
async function api(method, path, body = null, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  try {
    const resp = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...opts,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  } catch (e) {
    if (e.message.includes('Failed to fetch')) {
      throw new Error('Cannot reach the server. Make sure the backend is running on port 3001.');
    }
    throw e;
  }
}

// ── Auth ─────────────────────────────────────────────────────
let selectedRole = 'resident';
let selectedRegRole = 'resident';
let publicProjectsCached = null;

// Login role selector
document.querySelectorAll('#role-selector .role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#role-selector .role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRole = btn.dataset.role;
  });
});

function switchAuthMode(mode) {
  const signinTab = document.getElementById('auth-tab-signin');
  const registerTab = document.getElementById('auth-tab-register');
  const signinView = document.getElementById('signin-view');
  const registerView = document.getElementById('register-view');
  const err = document.getElementById('login-error');
  const succ = document.getElementById('login-success');

  if (err) err.classList.add('hidden');
  if (succ) succ.classList.add('hidden');

  if (mode === 'register') {
    if (signinTab) signinTab.classList.remove('active');
    if (registerTab) registerTab.classList.add('active');
    if (signinView) signinView.classList.add('hidden');
    if (registerView) registerView.classList.remove('hidden');
    loadPublicProjectsForRegistration();
  } else {
    if (registerTab) registerTab.classList.remove('active');
    if (signinTab) signinTab.classList.add('active');
    if (registerView) registerView.classList.add('hidden');
    if (signinView) signinView.classList.remove('hidden');
  }
}

function selectRegRole(role) {
  selectedRegRole = role;
  document.querySelectorAll('#reg-role-selector .role-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.role === role);
  });

  const resFields = document.getElementById('reg-fields-resident');
  const contFields = document.getElementById('reg-fields-contractor');
  const govFields = document.getElementById('reg-fields-government');

  if (resFields) resFields.classList.toggle('hidden', role !== 'resident');
  if (contFields) contFields.classList.toggle('hidden', role !== 'contractor');
  if (govFields) govFields.classList.toggle('hidden', role !== 'government');

  const nameLabel = document.getElementById('reg-name-label');
  if (nameLabel) {
    if (role === 'contractor') {
      nameLabel.textContent = 'Authorized Representative / Name *';
    } else if (role === 'government') {
      nameLabel.textContent = 'Officer Full Name *';
    } else {
      nameLabel.textContent = 'Full Name *';
    }
  }

  // Adjust required attributes
  const resProj = document.getElementById('reg-resident-project');
  const resUnit = document.getElementById('reg-unit');
  const contComp = document.getElementById('reg-company-name');
  const contProj = document.getElementById('reg-contractor-project');
  const contLic = document.getElementById('reg-license');
  const govDesig = document.getElementById('reg-designation');

  if (resProj) resProj.required = (role === 'resident');
  if (resUnit) resUnit.required = (role === 'resident');
  if (contComp) contComp.required = (role === 'contractor');
  if (contProj) contProj.required = (role === 'contractor');
  if (contLic) contLic.required = (role === 'contractor');
  if (govDesig) govDesig.required = (role === 'government');
}

async function loadPublicProjectsForRegistration() {
  const resSelect = document.getElementById('reg-resident-project');
  const contSelect = document.getElementById('reg-contractor-project');
  if (!resSelect || !contSelect) return;

  if (publicProjectsCached && publicProjectsCached.length > 0) {
    populateProjectDropdowns(publicProjectsCached);
    return;
  }

  try {
    const res = await fetch(`${API}/public-projects`);
    const data = await res.json();
    if (data.projects && data.projects.length > 0) {
      publicProjectsCached = data.projects;
      populateProjectDropdowns(data.projects);
    }
  } catch (err) {
    console.warn('Could not fetch public projects:', err);
  }
}

function populateProjectDropdowns(projects) {
  const resSelect = document.getElementById('reg-resident-project');
  const contSelect = document.getElementById('reg-contractor-project');

  const optionsHtml = projects.map(p => 
    `<option value="${p.id}">${p.name} (${p.ward} · ${p.scheme_type || 'SRA'})</option>`
  ).join('');

  if (resSelect) resSelect.innerHTML = `<option value="">-- Choose Allotted Scheme --</option>` + optionsHtml;
  if (contSelect) contSelect.innerHTML = `<option value="">-- Choose Assigned Project --</option>` + optionsHtml;
}

async function handleRegistration(e) {
  e.preventDefault();
  const btn = document.getElementById('reg-submit-btn');
  const name = document.getElementById('reg-name').value.trim();
  const mobile = document.getElementById('reg-mobile').value.trim();

  if (!name) {
    showLoginError('Please enter your full name.');
    return;
  }
  if (!mobile || !/^\+?\d{10,13}$/.test(mobile.replace(/[\s-]/g, ''))) {
    showLoginError('Please enter a valid 10-digit mobile number.');
    return;
  }

  const password = document.getElementById('reg-password') ? document.getElementById('reg-password').value : '';

  if (!password || password.length < 4) {
    showLoginError('Please create a password of at least 4 characters.');
    return;
  }

  const payload = {
    role: selectedRegRole,
    name,
    mobile,
    password,
  };

  if (selectedRegRole === 'resident') {
    payload.projectId = document.getElementById('reg-resident-project').value;
    payload.unit = document.getElementById('reg-unit').value.trim();
    payload.aadhaarNumber = document.getElementById('reg-aadhaar').value.trim();
    payload.householdNumber = document.getElementById('reg-household').value.trim();
    payload.wardNumber = document.getElementById('reg-ward').value.trim();

    if (!payload.projectId) {
      showLoginError('Please select your rehabilitation scheme / project.');
      return;
    }
    if (!payload.unit) {
      showLoginError('Please specify your allotted flat or unit number.');
      return;
    }
  } else if (selectedRegRole === 'contractor') {
    payload.companyName = document.getElementById('reg-company-name').value.trim();
    payload.projectId = document.getElementById('reg-contractor-project').value;
    payload.licenseNumber = document.getElementById('reg-license').value.trim();
    payload.gstNumber = document.getElementById('reg-gst').value.trim();

    if (!payload.companyName) {
      showLoginError('Please enter your company or agency name.');
      return;
    }
    if (!payload.projectId) {
      showLoginError('Please select your assigned project.');
      return;
    }
    if (!payload.licenseNumber) {
      showLoginError('Please provide your contractor license number.');
      return;
    }
  } else if (selectedRegRole === 'government') {
    payload.department = document.getElementById('reg-dept').value;
    payload.designation = document.getElementById('reg-designation').value.trim();
    payload.wardNumber = document.getElementById('reg-officer-ward').value.trim();

    if (!payload.designation) {
      showLoginError('Please enter your official designation.');
      return;
    }
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Creating Account...</span>';

  try {
    const data = await api('POST', '/auth/register', payload);
    showLoginSuccess(data.message || 'Account created successfully! Logging in...');
    toast(`Welcome, ${data.user.name}! Account registered.`, 'success');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('pun_token', authToken);
    localStorage.setItem('pun_user', JSON.stringify(currentUser));

    setTimeout(() => {
      initApp();
    }, 700);
  } catch (err) {
    showLoginError(err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Complete Registration & Sign In</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

// ── Password-Based Sign In (No OTP/SMS required!) ───────────
async function handlePasswordLogin(e) {
  if (e) e.preventDefault();
  const mobileInput = document.getElementById('mobile-input');
  const passwordInput = document.getElementById('password-input');
  const btn = document.getElementById('signin-submit-btn');
  const err = document.getElementById('login-error');
  if (err) err.classList.add('hidden');

  const mobile = mobileInput ? mobileInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value : '';

  if (!mobile) {
    showLoginError('Please enter your mobile number.');
    return;
  }
  if (!password) {
    showLoginError('Please enter your password.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div><span>Signing In...</span>';

  try {
    const data = await api('POST', '/auth/login', {
      role: selectedRole,
      mobile,
      password,
    });

    toast(`Welcome back, ${data.user.name}!`, 'success');
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('pun_token', authToken);
    localStorage.setItem('pun_user', JSON.stringify(currentUser));
    initApp();
  } catch (error) {
    showLoginError(error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Sign In</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function resetLogin() {
  const err = document.getElementById('login-error');
  if (err) err.classList.add('hidden');
  const pwInput = document.getElementById('password-input');
  if (pwInput) pwInput.value = '';
}


function showLoginError(msg) {
  const err = document.getElementById('login-error');
  const succ = document.getElementById('login-success');
  if (succ) succ.classList.add('hidden');
  if (err) {
    err.textContent = msg;
    err.classList.remove('hidden');
  }
}

function showLoginSuccess(msg) {
  const err = document.getElementById('login-error');
  const succ = document.getElementById('login-success');
  if (err) err.classList.add('hidden');
  if (succ) {
    succ.textContent = msg;
    succ.classList.remove('hidden');
  }
}


async function logout() {
  try { await api('POST', '/auth/logout'); } catch (_) {}
  authToken = null; currentUser = null;
  localStorage.removeItem('pun_token');
  localStorage.removeItem('pun_user');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-screen').classList.add('active');
  document.getElementById('app-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('active');
  resetLogin();
  document.getElementById('mobile-input').value = '';
}

// ── App Init ─────────────────────────────────────────────────
function initApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('active');

  // Set user info
  document.getElementById('user-name-display').textContent = currentUser.name;
  const roleEl = document.getElementById('user-role-display');
  roleEl.textContent = currentUser.role === 'government' ? 'Govt / SRA Officer' : currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  roleEl.className = `user-role ${currentUser.role}`;
  document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

  buildNav();
  loadNotifications();
  showPage('dashboard');
}

// ── Navigation ───────────────────────────────────────────────
const navByRole = {
  resident: [
    { id: 'dashboard', key: 'dashboard', icon: iconDashboard() },
    { id: 'my-project', key: 'my_project', icon: iconBuilding() },
    { id: 'timeline', key: 'timeline', icon: iconTimeline() },
    { id: 'complaints', key: 'my_complaints', icon: iconComplaint() },
    { id: 'notices', key: 'notices', icon: iconNotice() },
    { id: 'notifications', key: 'notifications', icon: iconBell() },
  ],
  contractor: [
    { id: 'dashboard', key: 'dashboard', icon: iconDashboard() },
    { id: 'projects', key: 'my_project', icon: iconBuilding() },
    { id: 'daily-report', key: 'daily_report', icon: iconReport() },
    { id: 'submit-progress', key: 'submit_progress', icon: iconUpload() },
    { id: 'my-updates', key: 'my_updates', icon: iconTimeline() },
    { id: 'notifications', key: 'notifications', icon: iconBell() },
  ],
  government: [
    { id: 'dashboard', key: 'dashboard', icon: iconDashboard() },
    { id: 'projects', key: 'all_projects', icon: iconBuilding() },
    { id: 'progress-queue', key: 'review_queue', icon: iconQueue() },
    { id: 'verification-queue', key: 'verification_queue', icon: iconCheck() },
    { id: 'complaints-gov', key: 'complaints', icon: iconComplaint() },
    { id: 'reports', key: 'reports', icon: iconReport() },
    { id: 'notifications', key: 'notifications', icon: iconBell() },
  ],
};

function buildNav() {
  const nav = document.getElementById('sidebar-nav');
  const items = navByRole[currentUser.role] || [];
  nav.innerHTML = items.map(item => `
    <div class="nav-item" id="nav-${item.id}" onclick="showPage('${item.id}')">
      ${item.icon}<span>${t(item.key)}</span>
    </div>
  `).join('');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

function showPage(pageId) {
  currentPage = pageId;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${pageId}`);
  if (activeNav) activeNav.classList.add('active');

  // Update title
  const titles = {
    dashboard: t('dashboard'),
    'my-project': t('my_project'),
    timeline: t('timeline'),
    complaints: t('my_complaints'),
    notices: t('notices'),
    notifications: t('notifications'),
    projects: currentUser?.role === 'contractor' ? t('my_project') : t('all_projects'),
    'daily-report': t('daily_report'),
    'submit-progress': t('submit_progress'),
    'my-updates': t('my_updates'),
    'progress-queue': t('review_queue'),
    'verification-queue': t('verification_queue'),
    'complaints-gov': t('complaints'),
    reports: t('reports'),
  };
  document.getElementById('topbar-title').textContent = titles[pageId] || pageId;

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');

  // Render page
  const container = document.getElementById('page-container');
  container.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading...</span></div>';

  const renderers = {
    dashboard: renderDashboard,
    'my-project': renderMyProject,
    timeline: renderTimeline,
    complaints: renderComplaints,
    notices: renderNotices,
    notifications: renderNotifications,
    projects: renderProjects,
    'daily-report': renderDailyReport,
    'submit-progress': renderSubmitProgress,
    'my-updates': renderMyUpdates,
    'progress-queue': renderProgressQueue,
    'verification-queue': renderVerificationQueue,
    'complaints-gov': renderGovComplaints,
    reports: renderReports,
  };

  const renderer = renderers[pageId];
  if (renderer) {
    renderer(container).catch(e => {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load</h3><p>${e.message}</p></div>`;
    });
  }
}

// ── Notifications ────────────────────────────────────────────
async function loadNotifications() {
  try {
    const data = await api('GET', '/notifications');
    const count = (data.notifications || []).length;
    const badge = document.getElementById('notif-badge');
    if (count > 0) {
      badge.textContent = count > 9 ? '9+' : count;
      badge.classList.remove('hidden');
    }
  } catch (_) {}
}

// ============================================================
// PAGE RENDERERS
// ============================================================

// ── DASHBOARD ────────────────────────────────────────────────
async function renderDashboard(container) {
  if (currentUser.role === 'resident') return renderResidentDashboard(container);
  if (currentUser.role === 'contractor') return renderContractorDashboard(container);
  return renderGovDashboard(container);
}

async function renderResidentDashboard(container) {
  const [projectsData, notifData] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/notifications'),
  ]);
  const projects = projectsData.projects || [];
  const project = projects[0];
  const notifs = notifData.notifications || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Welcome back, ${currentUser.name.split(' ')[0]}</h1>
        <p>Track your building's construction progress</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon purple">🏗️</div>
          <div class="stat-info">
            <div class="stat-value">${project?.progress ?? '—'}%</div>
            <div class="stat-label">Construction Progress</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">🏠</div>
          <div class="stat-info">
            <div class="stat-value">${project?.unit || '—'}</div>
            <div class="stat-label">Your Unit</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">🔔</div>
          <div class="stat-info">
            <div class="stat-value">${notifs.length}</div>
            <div class="stat-label">Notifications</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">📋</div>
          <div class="stat-info">
            <div class="stat-value">${project?.stage?.split('—')[0].trim().split(',')[0].trim() || '—'}</div>
            <div class="stat-label">Current Stage</div>
          </div>
        </div>
      </div>

      ${project ? `
      <div class="card mb-4">
        <div class="card-header">
          <span class="card-title">📍 ${project.name}</span>
          <span class="badge badge-${statusBadge(project.status)}">${project.status}</span>
        </div>
        <div class="card-body">
          <div class="project-stage">${project.stage}</div>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill ${project.progress >= 70 ? 'green' : project.progress >= 40 ? '' : 'amber'}"
                   style="width:${project.progress}%"></div>
            </div>
            <span class="progress-pct">${project.progress}%</span>
          </div>
          <div class="project-meta mt-3">
            <div class="project-meta-item">📌 ${project.ward}</div>
            <div class="project-meta-item">👪 ${project.families} families</div>
            <div class="project-meta-item">🏢 Contractor: ${project.contractor}</div>
            ${project.registered_residents ? `<div class="project-meta-item">👤 Resident: ${project.registered_residents}</div>` : ''}
          </div>
          ${project.next_milestone ? `<p class="text-sm text-muted mt-2">Next milestone: ${project.next_milestone}</p>` : ''}
          ${project.alert && project.alert !== 'No critical issue' ? `<div class="project-alert">⚠️ ${project.alert}</div>` : ''}
          <div class="mt-3 flex gap-2 flex-wrap">
            <button class="btn-secondary" onclick="showPage('timeline')">📊 View Timeline</button>
            <button class="btn-secondary" onclick="showPage('complaints')">📝 Submit Complaint</button>
          </div>
        </div>
      </div>

      <div class="map-card mb-4">
        <div class="map-header">
          <div>
            <span class="card-title">🗺️ Geographic Project Map (Site Location)</span>
            <p class="text-xs text-muted">Real-time GPS pin for your rehabilitation building in ${escHtml(project.ward || 'Mumbai')}</p>
          </div>
          <div style="display:flex;gap:6px">
            <span class="badge badge-${project.is_delayed ? 'red' : 'green'}">
              ● ${project.is_delayed ? 'Delayed (>30d inactive)' : 'On Track'}
            </span>
            <span class="badge badge-purple">${escHtml(project.scheme_type || 'SRA')}</span>
          </div>
        </div>
        <div id="resident-mumbai-map" style="width:100%;height:350px"></div>
      </div>` : '<div class="empty-state"><div class="empty-state-icon">🏠</div><h3>No project linked</h3><p>Contact admin to link your account to a project.</p></div>'}

      ${notifs.length > 0 ? `
      <div class="card">
        <div class="card-header"><span class="card-title">Recent Notifications</span></div>
        <div class="card-body">
          <div class="notification-list">
            ${notifs.slice(0,3).map(n => `
            <div class="notification-item">
              <div class="notification-dot"></div>
              <div>
                <div class="notification-title">${escHtml(n.title)}</div>
                <div class="notification-msg">${escHtml(n.message)}</div>
                <div class="notification-time">${formatDate(n.created_at)}</div>
              </div>
            </div>`).join('')}
          </div>
        </div>
      </div>` : ''}
    </div>
  `;

  if (project) {
    setTimeout(() => {
      initMumbaiMap([project], 'resident-mumbai-map');
    }, 120);
  }
}

async function renderContractorDashboard(container) {
  const [projectsData, updatesData, reportsData] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/government/progress').catch(() => ({ updates: [] })),
    api('GET', '/daily-reports'),
  ]);
  const projects = projectsData.projects || [];
  const reports = reportsData.reports || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Contractor Dashboard</h1>
        <p>${currentUser.name} — Construction Progress Management</p>
      </div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon purple">🏗️</div>
          <div class="stat-info">
            <div class="stat-value">${projects.length}</div>
            <div class="stat-label">Assigned Projects</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">📄</div>
          <div class="stat-info">
            <div class="stat-value">${reports.length}</div>
            <div class="stat-label">Daily Reports</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">📈</div>
          <div class="stat-info">
            <div class="stat-value">${projects.length > 0 ? Math.round(projects.reduce((s,p)=>s+p.progress,0)/projects.length) : 0}%</div>
            <div class="stat-label">Avg Progress</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">📋</div>
          <div class="stat-info">
            <div class="stat-value">${reports.filter(r=>r.created_at?.slice(0,10)===new Date().toISOString().slice(0,10)).length}</div>
            <div class="stat-label">Reports Today</div>
          </div>
        </div>
      </div>
      <div class="map-card mb-4">
        <div class="map-header">
          <div>
            <span class="card-title">🗺️ Geographic Project Map (Assigned Construction Sites)</span>
            <p class="text-xs text-muted">Real-time GPS status pins for your contracted sites across Mumbai</p>
          </div>
          <div style="display:flex;gap:6px">
            <span class="badge badge-green">● On Track</span>
            <span class="badge badge-yellow">● Review Pending</span>
            <span class="badge badge-red">● Inactive (>30d)</span>
          </div>
        </div>
        <div id="contractor-mumbai-map" style="width:100%;height:380px"></div>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <span class="card-title">Assigned Projects</span>
          <button class="btn-secondary" onclick="showPage('daily-report')">+ Daily Report</button>
        </div>
        <div class="card-body">
          ${projects.length === 0 ? emptyState('📋', 'No projects assigned') : `
          <div class="projects-grid">
            ${projects.map(p => projectCard(p, () => `showPage('submit-progress')`)).join('')}
          </div>`}
        </div>
      </div>
    </div>
  `;

  if (projects.length > 0) {
    setTimeout(() => {
      initMumbaiMap(projects, 'contractor-mumbai-map');
    }, 120);
  }
}

async function renderGovDashboard(container) {
  const [projectsData, updatesData, complaintsData] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/government/progress'),
    api('GET', '/complaints'),
  ]);
  const projects = projectsData.projects || [];
  const updates = updatesData.updates || [];
  const complaints = complaintsData.complaints || [];
  const pending = updates.filter(u => u.status === 'Pending review');
  const openComplaints = complaints.filter(c => c.status !== 'Resolved' && c.status !== 'Closed');

  const delayedProjects = projects.filter(p => p.is_delayed || p.days_inactive >= 30);
  const delayBannerHtml = delayedProjects.length > 0 ? `
    <div class="alert-banner-delayed">
      <div class="alert-banner-content">
        <span class="alert-banner-icon">⚠️</span>
        <div>
          <div class="alert-banner-title">${delayedProjects.length} Project(s) Inactive for 30+ Days</div>
          <div class="alert-banner-desc">${delayedProjects.map(p => `<strong>${escHtml(p.name)}</strong> (${p.days_inactive} days without milestone update)`).join(' · ')}</div>
        </div>
      </div>
      <button class="btn-primary" style="background:#ef4444;border:none;padding:6px 14px;font-size:12px;width:auto" onclick="filterProjectsDelayed()">
        Filter Delayed Projects
      </button>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>${t('government')} Dashboard</h1>
        <p>Ward-level pilot proposal by MLA Varun Sardesai (Bandra East) — scalable to SRA/MHADA/DRP city-wide</p>
      </div>

      ${delayBannerHtml}

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon purple">🏗️</div>
          <div class="stat-info">
            <div class="stat-value">${projects.length}</div>
            <div class="stat-label">Total Projects</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">📈</div>
          <div class="stat-info">
            <div class="stat-value">${projects.length > 0 ? Math.round(projects.reduce((s,p)=>s+p.progress,0)/projects.length) : 0}%</div>
            <div class="stat-label">Avg Progress</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon amber">⏳</div>
          <div class="stat-info">
            <div class="stat-value">${pending.length}</div>
            <div class="stat-label">Pending Reviews</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">👪</div>
          <div class="stat-info">
            <div class="stat-value">${projects.reduce((s,p)=>s+p.families,0)}</div>
            <div class="stat-label">Total Families</div>
          </div>
        </div>
      </div>

      <div class="map-card mb-4">
        <div class="map-header">
          <div>
            <span class="card-title">🗺️ Geographic Project Map (Mumbai Metropolitan Region)</span>
            <p class="text-xs text-muted">Real-time GPS status pins across Bandra East, Kurla & Dharavi</p>
          </div>
          <div style="display:flex;gap:6px">
            <span class="badge badge-green">● On Track</span>
            <span class="badge badge-yellow">● Review Pending</span>
            <span class="badge badge-red">● Inactive (>30d)</span>
          </div>
        </div>
        <div id="gov-mumbai-map" style="width:100%;height:380px"></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Project Status</span>
            <button class="btn-secondary" onclick="showPage('projects')">View All</button>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Project</th><th>Progress</th><th>Status</th></tr></thead>
                <tbody>
                ${projects.map(p => `
                  <tr>
                    <td><div class="font-semibold truncate" style="max-width:160px">${escHtml(p.name)}</div>
                        <div class="text-xs text-muted">${escHtml(p.ward)} · ${p.scheme_type || 'SRA'}</div></td>
                    <td><div class="progress-container">
                      <div class="progress-bar"><div class="progress-fill" style="width:${p.progress}%"></div></div>
                      <span class="progress-pct">${p.progress}%</span>
                    </div></td>
                    <td><span class="badge badge-${statusBadge(p.status)}">${p.status}</span></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Pending Reviews</span>
            <button class="btn-secondary" onclick="showPage('progress-queue')">Review All</button>
          </div>
          <div class="card-body">
            ${pending.length === 0 ? emptyState('✅', 'All reviews complete') :
              pending.slice(0,5).map(u => `
              <div class="notification-item mb-2">
                <div class="notification-dot"></div>
                <div>
                  <div class="notification-title">${escHtml(u.project_id)} — ${escHtml(u.stage)}</div>
                  <div class="notification-msg">Progress: ${u.progress}% · ${formatDate(u.created_at)}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Open Complaints (${openComplaints.length})</span>
            <button class="btn-secondary" onclick="showPage('complaints-gov')">View All</button>
          </div>
          <div class="card-body">
            ${openComplaints.length === 0 ? emptyState('✅', 'No open complaints') :
              openComplaints.slice(0,5).map(c => `
              <div class="notification-item mb-2">
                <div class="notification-dot" style="background:var(--color-red)"></div>
                <div>
                  <div class="notification-title">${escHtml(c.project_id)}</div>
                  <div class="notification-msg">${escHtml(c.issue?.slice(0,80))}...</div>
                  <div class="notification-time"><span class="badge badge-${complaintBadge(c.status)}">${c.status}</span></div>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  setTimeout(() => {
    initMumbaiMap(projects, 'gov-mumbai-map');
  }, 100);
}

// ── MY PROJECT (Resident) ─────────────────────────────────────
async function renderMyProject(container) {
  const data = await api('GET', '/projects');
  const project = (data.projects || [])[0];
  if (!project) {
    container.innerHTML = `<div class="page active">${emptyState('🏠', 'No project linked', 'Contact your administrator to link your account to a project.')}</div>`;
    return;
  }
  const uploadsData = await api('GET', `/projects/${project.id}/uploads`).catch(() => ({ uploads: [] }));
  const uploads = uploadsData.uploads || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>${escHtml(project.name)}</h1>
        <p>${escHtml(project.ward)} · ${project.families} families · Unit: ${escHtml(project.unit || 'N/A')}</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px">
        <div class="card">
          <div class="card-header"><span class="card-title">Project Details</span></div>
          <div class="card-body">
            <div class="project-stage">${escHtml(project.stage)}</div>
            <div class="progress-container mb-3">
              <div class="progress-bar">
                <div class="progress-fill ${project.progress>=70?'green':''}" style="width:${project.progress}%"></div>
              </div>
              <span class="progress-pct">${project.progress}%</span>
            </div>
            <table style="width:100%"><tbody>
              <tr><td class="text-muted text-sm" style="padding:6px 0">Project ID</td><td class="font-semibold">${escHtml(project.id)}</td></tr>
              <tr><td class="text-muted text-sm" style="padding:6px 0">Contractor</td><td><span class="badge badge-purple" style="font-size:12px;font-weight:600">🏢 ${escHtml(project.contractor)}</span></td></tr>
              ${project.registered_residents ? `<tr><td class="text-muted text-sm" style="padding:6px 0">Assigned Resident(s)</td><td><span class="text-sm font-semibold text-green">👤 ${escHtml(project.registered_residents)}</span></td></tr>` : ''}
              <tr><td class="text-muted text-sm" style="padding:6px 0">Site Area</td><td>${escHtml(project.site_area)}</td></tr>
              <tr><td class="text-muted text-sm" style="padding:6px 0">Last Updated</td><td>${formatDate(project.updated)}</td></tr>
              <tr><td class="text-muted text-sm" style="padding:6px 0">Status</td><td><span class="badge badge-${statusBadge(project.status)}">${project.status}</span></td></tr>
              ${project.floor_number ? `<tr><td class="text-muted text-sm" style="padding:6px 0">Floor</td><td>${project.floor_number} / ${project.floors_total}</td></tr>` : ''}
            </tbody></table>
            ${project.next_milestone ? `<div class="feedback-box feedback-pending mt-3">🎯 Next: ${escHtml(project.next_milestone)}</div>` : ''}
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Construction Pipeline</span></div>
          <div class="card-body" style="padding:0 20px">
            ${buildStagePipeline(project.stage)}
          </div>
        </div>
      </div>

      <div class="map-card mb-4">
        <div class="map-header">
          <div>
            <span class="card-title">🗺️ Site Geo-Location & Mumbai Coordinates</span>
            <p class="text-xs text-muted">GPS verified plot boundary and coordinates for ${escHtml(project.name)}</p>
          </div>
          <div style="display:flex;gap:6px">
            <span class="badge badge-purple">Ward: ${escHtml(project.ward)}</span>
            <span class="badge badge-${project.is_delayed ? 'red' : 'green'}">
              ${project.is_delayed ? 'Delayed' : 'On Track'}
            </span>
          </div>
        </div>
        <div id="my-project-leaflet-map" style="width:100%;height:320px"></div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Evidence / Photos (${uploads.length})</span>
        </div>
        <div class="card-body">
          ${uploads.length === 0 ? emptyState('📷', 'No evidence uploaded yet') : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
            ${uploads.map(u => `
            <div class="card" style="padding:14px">
              <div style="font-size:24px;margin-bottom:8px">${categoryIcon(u.category)}</div>
              <div class="font-semibold text-sm truncate">${escHtml(u.file_name)}</div>
              <div class="text-xs text-muted mt-1">${u.category} · ${formatBytes(u.file_size)}</div>
              <div class="text-xs text-muted">${formatDate(u.created_at)}</div>
            </div>`).join('')}
          </div>`}
        </div>
      </div>
    </div>
  `;

  setTimeout(() => {
    initMumbaiMap([project], 'my-project-leaflet-map');
  }, 120);
}

// ── TIMELINE (Resident) ───────────────────────────────────────
async function renderTimeline(container) {
  const projectsData = await api('GET', '/projects');
  const project = (projectsData.projects || [])[0];
  if (!project) {
    container.innerHTML = `<div class="page active">${emptyState('📊', 'No project linked')}</div>`;
    return;
  }
  const updatesData = await api('GET', `/projects/${project.id}/progress`);
  const updates = updatesData.updates || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Progress Timeline</h1>
        <p>${escHtml(project.name)}</p>
      </div>
      ${buildStagePipelineCard(project)}
      <div class="card mt-4">
        <div class="card-header"><span class="card-title">Approved Progress Updates (${updates.length})</span></div>
        <div class="card-body">
          ${updates.length === 0 ? emptyState('📅', 'No approved updates yet', 'Progress updates will appear here once approved by the government official.') :
          `<div style="display:flex;flex-direction:column;gap:16px">
            ${updates.map(u => `
            <div style="display:flex;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--color-border)">
              <div style="width:40px;height:40px;background:var(--color-green-bg);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">✓</div>
              <div style="flex:1">
                <div class="font-semibold">${escHtml(u.stage)}</div>
                <div class="text-sm text-muted mt-1">${formatDate(u.created_at)}</div>
                <div class="progress-container mt-2">
                  <div class="progress-bar"><div class="progress-fill green" style="width:${u.progress}%"></div></div>
                  <span class="progress-pct">${u.progress}%</span>
                </div>
                ${u.notes ? `<p class="text-sm text-muted mt-2">${escHtml(u.notes)}</p>` : ''}
              </div>
            </div>`).join('')}
          </div>`}
        </div>
      </div>
    </div>
  `;
}

// ── COMPLAINTS (Resident) ─────────────────────────────────────
async function renderComplaints(container) {
  const [projectsData, complaintsData] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/complaints'),
  ]);
  const projects = projectsData.projects || [];
  const complaints = complaintsData.complaints || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>My Complaints</h1>
        <p>Submit and track your complaints about construction issues</p>
      </div>

      <div class="card mb-4">
        <div class="card-header"><span class="card-title">Submit New Complaint</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Project</label>
              <select id="complaint-project">
                ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group form-full">
              <label>Describe the Issue</label>
              <textarea id="complaint-issue" placeholder="Describe the construction issue, delay, or concern you want to report..."></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" style="width:auto" onclick="submitComplaint()">
              <span>Submit Complaint</span>
            </button>
          </div>
          <div id="complaint-result"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">My Complaints (${complaints.length})</span></div>
        <div class="card-body" style="padding:0">
          ${complaints.length === 0 ? `<div style="padding:20px">${emptyState('📝', 'No complaints submitted')}</div>` : `
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Project</th><th>Issue</th><th>Status</th><th>Response</th><th>Date</th></tr></thead>
              <tbody>
                ${complaints.map(c => `
                <tr>
                  <td>${c.id}</td>
                  <td><span class="badge badge-blue">${escHtml(c.project_id)}</span></td>
                  <td style="max-width:200px" class="truncate">${escHtml(c.issue)}</td>
                  <td><span class="badge badge-${complaintBadge(c.status)}">${c.status}</span></td>
                  <td class="text-muted text-sm">${escHtml(c.response || '—')}</td>
                  <td class="text-muted text-sm">${formatDate(c.created_at)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    </div>
  `;
}

async function submitComplaint() {
  const projectId = document.getElementById('complaint-project').value;
  const issue = document.getElementById('complaint-issue').value.trim();
  const result = document.getElementById('complaint-result');
  if (!issue) { toast('Please describe the issue.', 'error'); return; }
  try {
    await api('POST', '/complaints', { projectId, issue });
    toast('Complaint submitted successfully!', 'success');
    document.getElementById('complaint-issue').value = '';
    showPage('complaints');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── NOTICES (Resident) ───────────────────────────────────────
async function renderNotices(container) {
  const data = await api('GET', '/notices');
  const notices = data.notices || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Government Notices</h1>
        <p>Official communications from Government / SRA Officers</p>
      </div>
      <div class="card">
        <div class="card-body">
          ${notices.length === 0 ? emptyState('📋', 'No notices yet') :
          `<div class="notification-list">
            ${notices.map(n => `
            <div class="notification-item">
              <div class="notification-dot" style="background:var(--color-accent)"></div>
              <div style="flex:1">
                <div class="notification-title">${escHtml(n.title)}</div>
                <div class="notification-msg">${escHtml(n.message)}</div>
                <div class="notification-time">${formatDate(n.created_at)}</div>
                <button class="btn-secondary mt-2" style="font-size:11px;padding:6px 12px"
                  onclick="downloadNotice(${n.id})">⬇ Download Document</button>
              </div>
            </div>`).join('')}
          </div>`}
        </div>
      </div>
    </div>
  `;
}

async function downloadNotice(id) {
  try {
    const resp = await fetch(`${API}/notices/${id}/download`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!resp.ok) throw new Error('Failed to download');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `notice-${id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Notice downloaded!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
async function renderNotifications(container) {
  const data = await api('GET', '/notifications');
  const notifs = data.notifications || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Notifications</h1>
        <p>All system notifications for your account</p>
      </div>
      <div class="card">
        <div class="card-body">
          ${notifs.length === 0 ? emptyState('🔔', 'No notifications yet') :
          `<div class="notification-list">
            ${notifs.map(n => `
            <div class="notification-item">
              <div class="notification-dot"></div>
              <div>
                <div class="notification-title">${escHtml(n.title)}</div>
                <div class="notification-msg">${escHtml(n.message)}</div>
                <div class="notification-time">${formatDate(n.created_at)}</div>
              </div>
            </div>`).join('')}
          </div>`}
        </div>
      </div>
    </div>
  `;
}

// ── PROJECTS (Contractor / Government) ───────────────────────
async function renderProjects(container) {
  const data = await api('GET', '/projects');
  const projects = data.projects || [];

  let filterHtml = '';
  if (currentUser.role === 'government') {
    const wards = [...new Set(projects.map(p => p.ward))];
    filterHtml = `
      <div class="filter-bar mb-4" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <select id="ward-filter" onchange="filterProjects()">
            <option value="">${t('filter_all_wards')}</option>
            ${wards.map(w => `<option value="${escHtml(w)}">${escHtml(w)}</option>`).join('')}
          </select>
          <select id="status-filter" onchange="filterProjects()">
            <option value="">${t('filter_all_statuses')}</option>
            <option value="Approved">Approved</option>
            <option value="Monitoring">Monitoring</option>
            <option value="Handover review">Handover review</option>
            <option value="In progress">In progress</option>
            <option value="delayed">⚠️ Delayed (30+ days)</option>
          </select>
          <button class="btn-secondary" onclick="exportProjectsCsv()">⬇ ${t('export_csv')}</button>
        </div>
        <div class="view-mode-toggle">
          <button class="view-btn active" id="btn-view-grid" onclick="setViewMode('grid')">📋 ${t('list_view')}</button>
          <button class="view-btn" id="btn-view-map" onclick="setViewMode('map')">🗺️ ${t('map_view')}</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>${currentUser.role === 'government' ? t('all_projects') : t('my_project')}</h1>
        <p>${projects.length} projects in your jurisdiction</p>
      </div>
      ${filterHtml}
      <div id="projects-grid" class="projects-grid">
        ${projects.map(p => projectCard(p)).join('')}
      </div>
      <div id="projects-map-card" class="map-card mb-4" style="display:none">
        <div class="map-header">
          <span class="card-title">🗺️ Projects Map (Mumbai Metropolitan Region)</span>
          <div style="display:flex;gap:6px">
            <span class="badge badge-green">● On Track</span>
            <span class="badge badge-yellow">● Review Pending</span>
            <span class="badge badge-red">● Inactive (>30d)</span>
          </div>
        </div>
        <div id="projects-leaflet-map" style="width:100%;height:500px"></div>
      </div>
    </div>
  `;
  window._allProjects = projects;
  window._filteredProjects = projects;
}

function setViewMode(mode) {
  document.getElementById('btn-view-grid')?.classList.toggle('active', mode === 'grid');
  document.getElementById('btn-view-map')?.classList.toggle('active', mode === 'map');
  const grid = document.getElementById('projects-grid');
  const mapCard = document.getElementById('projects-map-card');
  if (grid) grid.style.display = mode === 'grid' ? 'grid' : 'none';
  if (mapCard) {
    mapCard.style.display = mode === 'map' ? 'block' : 'none';
    if (mode === 'map') {
      setTimeout(() => initMumbaiMap(window._filteredProjects || window._allProjects || [], 'projects-leaflet-map'), 100);
    }
  }
}

function filterProjects() {
  const ward = document.getElementById('ward-filter')?.value || '';
  const status = document.getElementById('status-filter')?.value || '';
  let filtered = window._allProjects || [];
  if (ward) filtered = filtered.filter(p => p.ward === ward);
  if (status === 'delayed') {
    filtered = filtered.filter(p => p.is_delayed || p.days_inactive >= 30);
  } else if (status) {
    filtered = filtered.filter(p => p.status === status);
  }
  window._filteredProjects = filtered;
  document.getElementById('projects-grid').innerHTML = filtered.length === 0
    ? emptyState('🔍', 'No projects match your filters')
    : filtered.map(p => projectCard(p)).join('');
  if (document.getElementById('projects-map-card')?.style.display !== 'none') {
    initMumbaiMap(filtered, 'projects-leaflet-map');
  }
}

function filterProjectsDelayed() {
  showPage('projects');
  setTimeout(() => {
    const sel = document.getElementById('status-filter');
    if (sel) {
      sel.value = 'delayed';
      filterProjects();
    }
  }, 150);
}

async function exportProjectsCsv() {
  try {
    const data = await api('POST', '/reports', { scope: 'project', target: window._allProjects?.[0]?.id });
    const resp = await fetch(`${API}/reports/${data.report.id}/download`, { headers: { Authorization: `Bearer ${authToken}` } });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'projects-report.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Report exported!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ── DAILY REPORT (Contractor) ─────────────────────────────────
async function renderDailyReport(container) {
  const [projectsData, reportsData] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/daily-reports'),
  ]);
  const projects = projectsData.projects || [];
  const reports = reportsData.reports || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Daily Report</h1>
        <p>Log today's construction activity</p>
      </div>
      <div class="card mb-4">
        <div class="card-header"><span class="card-title">Submit Daily Report</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Project</label>
              <select id="dr-project">
                ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Material Used</label>
              <input type="text" id="dr-material" placeholder="e.g., 200 bags cement, 50 cubic metres sand" />
            </div>
            <div class="form-group">
              <label>Labour Present</label>
              <input type="text" id="dr-labour" placeholder="e.g., 25 workers, 5 supervisors" />
            </div>
            <div class="form-group form-full">
              <label>Work Done Today</label>
              <textarea id="dr-workdone" placeholder="Describe work completed today in detail..."></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" style="width:auto" onclick="submitDailyReport()">
              <span>Save Daily Report</span>
            </button>
          </div>
          <div id="dr-result"></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Recent Daily Reports (${reports.length})</span></div>
        <div class="card-body" style="padding:0">
          ${reports.length === 0 ? `<div style="padding:20px">${emptyState('📄', 'No reports yet')}</div>` : `
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Project</th><th>Material</th><th>Labour</th><th>Work Done</th><th>Date</th></tr></thead>
              <tbody>
                ${reports.slice(0,20).map(r => `
                <tr>
                  <td>${r.id}</td>
                  <td><span class="badge badge-blue">${escHtml(r.project_id)}</span></td>
                  <td class="text-sm">${escHtml(r.material?.slice(0,40))}${r.material?.length>40?'…':''}</td>
                  <td class="text-sm">${escHtml(r.labour?.slice(0,30))}${r.labour?.length>30?'…':''}</td>
                  <td class="text-sm" style="max-width:200px">${escHtml(r.work_done?.slice(0,60))}${r.work_done?.length>60?'…':''}</td>
                  <td class="text-muted text-sm">${formatDate(r.created_at)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    </div>
  `;
  window._contractorReports = reports;
}

async function submitDailyReport() {
  const projectId = document.getElementById('dr-project').value;
  const material = document.getElementById('dr-material').value.trim();
  const labour = document.getElementById('dr-labour').value.trim();
  const workDone = document.getElementById('dr-workdone').value.trim();
  if (!material || !labour || !workDone) { toast('All fields are required.', 'error'); return; }
  try {
    const data = await api('POST', '/daily-reports', { projectId, material, labour, workDone });
    toast('Daily report saved!', 'success');
    window._lastDailyReport = data.report;
    document.getElementById('dr-material').value = '';
    document.getElementById('dr-labour').value = '';
    document.getElementById('dr-workdone').value = '';
    document.getElementById('dr-result').innerHTML = `
      <div class="feedback-box feedback-approved mt-3">
        ✓ Daily Report #${data.report.id} saved. You can now submit a progress update linked to this report.
        <button class="btn-secondary mt-2" onclick="showPage('submit-progress')" style="font-size:12px;padding:6px 12px">→ Submit Progress Update</button>
      </div>`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── SUBMIT PROGRESS (Contractor) ──────────────────────────────
async function renderSubmitProgress(container) {
  const [projectsData, reportsData] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/daily-reports'),
  ]);
  const projects = projectsData.projects || [];
  const reports = reportsData.reports || [];
  const stages = [
    'Survey & Eligibility Confirmed',
    'Demolition / Site Cleared',
    'Foundation Complete',
    'Structure — Floor-wise (shows floor number out of total)',
    'Plumbing, Electrical & Finishing',
    'Possession Ready / Handover',
  ];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Submit Progress Update</h1>
        <p>Report construction milestone progress for government review</p>
      </div>

      <div class="card mb-4" style="border-color:rgba(245,158,11,0.3)">
        <div class="card-body">
          <div class="flex items-center gap-2 text-sm" style="color:var(--color-accent-light)">
            ⚠️ <strong>Workflow:</strong> Submit a Daily Report first, then link it to a Progress Update. Government reviews and approves each update before it becomes visible to residents.
          </div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><span class="card-title">📷 Upload Tamper-Evident Proof (Photos, Videos & Compliance)</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Evidence Category</label>
              <select id="evidence-category">
                <option value="photo">📷 Photo (Mandatory from Stage 2 onward)</option>
                <option value="video">🎥 Site Progress Video</option>
                <option value="quality-report">📋 Quality Inspection Report</option>
                <option value="safety-report">⛑️ Safety Compliance Certificate</option>
              </select>
            </div>
            <div class="form-group">
              <label>Evidence File</label>
              <input type="file" id="evidence-file-input" />
            </div>
            <div class="form-group form-full">
              <label>📍 Site Geotag & GPS Verification</label>
              <div style="display:flex;gap:8px">
                <input type="text" id="evidence-geotag" value="Bandra East Pilot Site - Sector 3" placeholder="Enter site area or location" />
                <button type="button" class="btn-secondary" style="width:auto;white-space:nowrap" onclick="captureGpsLocation()">Auto GPS</button>
              </div>
              <input type="hidden" id="evidence-lat" value="19.0607" />
              <input type="hidden" id="evidence-lng" value="72.8525" />
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" style="width:auto" onclick="uploadEvidenceFile()">
              <span>Upload Proof File</span>
            </button>
          </div>
          <div id="evidence-upload-result"></div>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header"><span class="card-title">Progress Update</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group">
              <label>Project</label>
              <select id="pu-project" onchange="updateReportList()">
                ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Linked Daily Report</label>
              <select id="pu-report">
                ${reports.length === 0
                  ? '<option value="">No reports yet — save a Daily Report first</option>'
                  : reports.map(r => `<option value="${r.id}">#${r.id} — ${formatDate(r.created_at)} — ${escHtml(r.project_id)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Construction Stage</label>
              <select id="pu-stage" onchange="toggleFloorFields()">
                ${stages.map(s => `<option value="${s}">${s}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Progress (%)</label>
              <input type="number" id="pu-progress" placeholder="0–100" min="0" max="100" />
            </div>
            <div class="form-group" id="floor-fields" style="display:none">
              <label>Floor Number</label>
              <input type="number" id="pu-floor" placeholder="e.g., 9" min="1" />
            </div>
            <div class="form-group" id="floors-total-field" style="display:none">
              <label>Total Floors</label>
              <input type="number" id="pu-floors-total" placeholder="e.g., 14" min="1" />
            </div>
            <div class="form-group form-full">
              <label>Notes (optional)</label>
              <textarea id="pu-notes" placeholder="Additional notes, challenges, or observations..."></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-primary" style="width:auto" onclick="submitProgress()">
              <span>Submit for Government Review</span>
            </button>
          </div>
          <div id="pu-result"></div>
        </div>
      </div>
    </div>
  `;
  window._contractorReports = reports;
  toggleFloorFields();
}

function toggleFloorFields() {
  const stage = document.getElementById('pu-stage')?.value || '';
  const isFloorStage = stage.includes('Floor-wise');
  document.getElementById('floor-fields').style.display = isFloorStage ? '' : 'none';
  document.getElementById('floors-total-field').style.display = isFloorStage ? '' : 'none';
}

async function submitProgress() {
  const projectId = document.getElementById('pu-project').value;
  const dailyReportId = document.getElementById('pu-report').value;
  const stage = document.getElementById('pu-stage').value;
  const progress = document.getElementById('pu-progress').value;
  const notes = document.getElementById('pu-notes').value.trim();
  const floorNumber = document.getElementById('pu-floor')?.value || null;
  const floorsTotal = document.getElementById('pu-floors-total')?.value || null;

  if (!projectId || !dailyReportId || !stage || !progress) {
    toast('Please fill in all required fields.', 'error');
    return;
  }
  try {
    const data = await api('POST', '/progress', {
      projectId, dailyReportId: Number(dailyReportId), stage,
      progress: Number(progress), notes, floorNumber, floorsTotal,
    });
    toast('Progress update submitted for government review!', 'success');
    document.getElementById('pu-result').innerHTML = `
      <div class="feedback-box feedback-pending mt-3">
        ✓ Progress Update #${data.update.id} submitted. Status: Pending review by Government / SRA Officer.
      </div>`;
    document.getElementById('pu-progress').value = '';
    document.getElementById('pu-notes').value = '';
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function uploadEvidenceFile() {
  const fileInput = document.getElementById('evidence-file-input');
  const category = document.getElementById('evidence-category').value;
  const projectId = document.getElementById('pu-project').value;
  const geotag = document.getElementById('evidence-geotag').value.trim();
  const lat = document.getElementById('evidence-lat').value;
  const lng = document.getElementById('evidence-lng').value;

  if (!fileInput.files.length) {
    toast('Please select a file to upload.', 'error');
    return;
  }
  const file = fileInput.files[0];
  const buffer = await file.arrayBuffer();

  try {
    const resp = await fetch(`${API}/uploads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': file.type || 'application/octet-stream',
        'X-Project-Id': projectId,
        'X-File-Category': category,
        'X-File-Name': encodeURIComponent(file.name),
        'X-Geotag': encodeURIComponent(geotag || 'Bandra East Pilot Site'),
        'X-Latitude': lat,
        'X-Longitude': lng,
      },
      body: buffer,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Upload failed');
    toast('Evidence uploaded with tamper-evident metadata!', 'success');
    document.getElementById('evidence-upload-result').innerHTML = `
      <div class="feedback-box feedback-approved mt-3">
        ✓ Uploaded: <strong>${escHtml(data.upload.file_name)}</strong> (${formatBytes(data.upload.file_size)})<br/>
        <span class="geotag-meta mt-1">📍 ${escHtml(data.upload.geotag || geotag)} · 🕒 Auto-timestamped</span>
      </div>
    `;
    fileInput.value = '';
  } catch (err) {
    toast(err.message, 'error');
  }
}

function captureGpsLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('evidence-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('evidence-lng').value = pos.coords.longitude.toFixed(6);
        document.getElementById('evidence-geotag').value = `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (Verified)`;
        toast('GPS coordinates captured!', 'success');
      },
      () => {
        document.getElementById('evidence-lat').value = '19.0607';
        document.getElementById('evidence-lng').value = '72.8525';
        document.getElementById('evidence-geotag').value = 'Bandra East Pilot Site (19.0607, 72.8525)';
        toast('Defaulted to Bandra East site coordinates', 'info');
      }
    );
  } else {
    document.getElementById('evidence-lat').value = '19.0607';
    document.getElementById('evidence-lng').value = '72.8525';
    document.getElementById('evidence-geotag').value = 'Bandra East Pilot Site (19.0607, 72.8525)';
  }
}

// ── MY UPDATES (Contractor) ───────────────────────────────────
async function renderMyUpdates(container) {
  const projectsData = await api('GET', '/projects');
  const projects = projectsData.projects || [];
  let allUpdates = [];
  for (const p of projects) {
    const d = await api('GET', `/projects/${p.id}/progress`).catch(() => ({ updates: [] }));
    allUpdates = allUpdates.concat((d.updates || []).map(u => ({ ...u, projectName: p.name })));
  }
  allUpdates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>My Progress Updates</h1>
        <p>Track status of all submitted progress reports</p>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          ${allUpdates.length === 0 ? `<div style="padding:20px">${emptyState('📋', 'No progress updates yet', 'Submit a Daily Report, then a Progress Update.')}</div>` : `
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Project</th><th>Stage</th><th>Progress</th><th>Status</th><th>Feedback</th><th>Date</th><th>Action</th></tr></thead>
              <tbody>
                ${allUpdates.map(u => `
                <tr id="update-row-${u.id}">
                  <td>${u.id}</td>
                  <td class="text-sm">${escHtml(u.projectName || u.project_id)}</td>
                  <td class="text-sm">${escHtml(u.stage)}</td>
                  <td>
                    <div class="progress-container" style="min-width:80px">
                      <div class="progress-bar"><div class="progress-fill" style="width:${u.progress}%"></div></div>
                      <span class="progress-pct">${u.progress}%</span>
                    </div>
                  </td>
                  <td><span class="badge badge-${updateBadge(u.status)}">${u.status}</span></td>
                  <td class="text-sm text-muted">${escHtml(u.feedback || '—')}</td>
                  <td class="text-muted text-sm">${formatDate(u.created_at)}</td>
                  <td>
                    ${u.status === 'Rejected' ? `
                    <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
                      onclick="openResubmitModal(${u.id})">Resubmit</button>` : '—'}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    </div>
  `;
}

function openResubmitModal(updateId) {
  const stages = [
    'Survey & Eligibility Confirmed', 'Demolition / Site Cleared', 'Foundation Complete',
    'Structure — Floor-wise (shows floor number out of total)',
    'Plumbing, Electrical & Finishing', 'Possession Ready / Handover',
  ];
  openModal('Resubmit Progress Update', `
    <div class="form-grid">
      <div class="form-group">
        <label>Stage</label>
        <select id="resub-stage">${stages.map(s=>`<option>${s}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label>Progress (%)</label>
        <input type="number" id="resub-progress" placeholder="0–100" min="0" max="100"/>
      </div>
      <div class="form-group form-full">
        <label>Resolution / Explanation</label>
        <textarea id="resub-notes" placeholder="Explain how you resolved the issue that caused rejection..."></textarea>
      </div>
    </div>
  `, async () => {
    const stage = document.getElementById('resub-stage').value;
    const progress = Number(document.getElementById('resub-progress').value);
    const notes = document.getElementById('resub-notes').value.trim();
    if (!stage || isNaN(progress)) { toast('Stage and progress required.', 'error'); return false; }
    try {
      await api('POST', `/progress/${updateId}/resubmit`, { stage, progress, notes });
      toast('Resubmitted for review!', 'success');
      showPage('my-updates');
      return true;
    } catch (e) { toast(e.message, 'error'); return false; }
  });
}

// ── PROGRESS QUEUE (Government) ───────────────────────────────
async function renderProgressQueue(container) {
  const data = await api('GET', '/government/progress');
  const updates = data.updates || [];
  const pending = updates.filter(u => u.status === 'Pending review');

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Progress Review Queue</h1>
        <p>${pending.length} updates pending review · ${updates.length} total</p>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          ${updates.length === 0 ? `<div style="padding:20px">${emptyState('✅', 'No updates to review')}</div>` : `
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Project</th><th>Contractor</th><th>Stage</th><th>Progress</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
              <tbody>
                ${updates.map(u => `
                <tr>
                  <td>${u.id}</td>
                  <td><span class="badge badge-blue">${escHtml(u.project_id)}</span></td>
                  <td class="text-sm">${escHtml(u.contractor_mobile)}</td>
                  <td class="text-sm">${escHtml(u.stage)}</td>
                  <td>
                    <div class="progress-container" style="min-width:80px">
                      <div class="progress-bar"><div class="progress-fill" style="width:${u.progress}%"></div></div>
                      <span class="progress-pct">${u.progress}%</span>
                    </div>
                  </td>
                  <td><span class="badge badge-${updateBadge(u.status)}">${u.status}</span></td>
                  <td class="text-muted text-sm">${formatDate(u.created_at)}</td>
                  <td>
                    <div class="flex gap-2 items-center flex-wrap">
                      <button class="btn-secondary" style="font-size:11px;padding:4px 8px" onclick="viewEvidenceModal('${u.project_id}')">📷 Proof</button>
                      ${u.status === 'Pending review' ? `
                        <button class="btn-success" style="font-size:11px;padding:4px 8px" onclick="decideProgress(${u.id}, 'Approved')">✓ Approve</button>
                        <button class="btn-danger" style="font-size:11px;padding:4px 8px" onclick="openRejectModal(${u.id})">✕ Reject</button>
                      ` : `<span class="badge badge-${updateBadge(u.status)}">${u.status}</span>`}
                    </div>
                  </td>
                </tr>
                ${u.notes ? `<tr><td colspan="8" style="padding:4px 16px 12px;color:var(--color-text-2);font-size:12px">💬 Notes: ${escHtml(u.notes)}</td></tr>` : ''}
                ${u.feedback ? `<tr><td colspan="8" style="padding:4px 16px 12px;font-size:12px"><span class="feedback-box feedback-${u.status==='Approved'?'approved':'rejected'}">Feedback: ${escHtml(u.feedback)}</span></td></tr>` : ''}`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    </div>
  `;
}

async function decideProgress(id, status, feedback = '') {
  try {
    await api('POST', `/progress/${id}/decision`, { status, feedback });
    toast(`Progress update ${status.toLowerCase()}!`, status === 'Approved' ? 'success' : 'error');
    showPage('progress-queue');
  } catch (e) { toast(e.message, 'error'); }
}

function openRejectModal(id) {
  openModal('Reject Progress Update', `
    <p class="text-sm text-muted mb-3">Provide feedback so the contractor can address the issue.</p>
    <div class="form-group">
      <label>Rejection Reason / Feedback</label>
      <textarea id="reject-feedback" placeholder="Explain why this update is being rejected..."></textarea>
    </div>
  `, async () => {
    const feedback = document.getElementById('reject-feedback').value.trim();
    if (!feedback) { toast('Please provide a rejection reason.', 'error'); return false; }
    await decideProgress(id, 'Rejected', feedback);
    return true;
  });
}

// ── GOVERNMENT COMPLAINTS ─────────────────────────────────────
async function renderGovComplaints(container) {
  const data = await api('GET', '/complaints');
  const complaints = data.complaints || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Complaints Management</h1>
        <p>${complaints.filter(c=>c.status==='Submitted').length} open · ${complaints.length} total complaints</p>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          ${complaints.length === 0 ? `<div style="padding:20px">${emptyState('✅', 'No complaints')}</div>` : `
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Project</th><th>Resident</th><th>Unit</th><th>Issue</th><th>Status</th><th>Date</th><th>Action</th></tr></thead>
              <tbody>
                ${complaints.map(c => `
                <tr>
                  <td>${c.id}</td>
                  <td><span class="badge badge-blue">${escHtml(c.project_id)}</span></td>
                  <td class="text-sm">${escHtml(c.resident_mobile)}</td>
                  <td class="text-sm">${escHtml(c.unit || '—')}</td>
                  <td style="max-width:200px" class="text-sm">${escHtml(c.issue?.slice(0,80))}${c.issue?.length>80?'…':''}</td>
                  <td><span class="badge badge-${complaintBadge(c.status)}">${c.status}</span></td>
                  <td class="text-muted text-sm">${formatDate(c.created_at)}</td>
                  <td>
                    ${['Submitted','Under Review'].includes(c.status) ? `
                    <button class="btn-secondary" style="font-size:11px;padding:5px 10px"
                      onclick="openRespondModal(${c.id})">Respond</button>` : '—'}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    </div>
  `;
}

function openRespondModal(id) {
  openModal('Respond to Complaint', `
    <div class="form-group">
      <label>Update Status</label>
      <select id="respond-status">
        <option>Under Review</option>
        <option>Resolved</option>
        <option>Closed</option>
      </select>
    </div>
    <div class="form-group">
      <label>Response Message</label>
      <textarea id="respond-msg" placeholder="Write your official response to the resident..."></textarea>
    </div>
  `, async () => {
    const status = document.getElementById('respond-status').value;
    const response = document.getElementById('respond-msg').value.trim();
    try {
      await api('PATCH', `/complaints/${id}`, { status, response });
      toast('Response sent!', 'success');
      showPage('complaints-gov');
      return true;
    } catch (e) { toast(e.message, 'error'); return false; }
  });
}

// ── REPORTS (Government) ──────────────────────────────────────
async function renderReports(container) {
  const [projectsData, reportsData] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/reports'),
  ]);
  const projects = projectsData.projects || [];
  const reports = reportsData.reports || [];
  const wards = [...new Set(projects.map(p => p.ward))];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>Reports & Analytics</h1>
        <p>Generate and distribute project status reports</p>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:24px">
        <div class="card">
          <div class="card-header"><span class="card-title">Generate Project Report</span></div>
          <div class="card-body">
            <div class="form-group">
              <label>Report Type</label>
              <select id="report-scope" onchange="updateReportTarget()">
                <option value="project">By Project</option>
                <option value="ward">By Ward</option>
              </select>
            </div>
            <div class="form-group" id="report-target-group">
              <label id="report-target-label">Project</label>
              <select id="report-target">
                ${projects.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('')}
              </select>
            </div>
            <button class="btn-primary" onclick="generateReport()"><span>Generate Report</span></button>
            <div id="report-result"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Send Notice to Residents</span></div>
          <div class="card-body">
            <div class="form-group">
              <label>Based on Report</label>
              <select id="notice-report">
                ${reports.length === 0 ? '<option value="">Generate a report first</option>' :
                  reports.map(r => `<option value="${r.id}">Report #${r.id} — ${r.scope} — ${formatDate(r.created_at)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Notice Title</label>
              <input type="text" id="notice-title" placeholder="e.g., Monthly Progress Update" />
            </div>
            <div class="form-group">
              <label>Message</label>
              <textarea id="notice-msg" placeholder="Write the message to send to residents and contractors..."></textarea>
            </div>
            <button class="btn-primary" onclick="sendNotice()"><span>Send Notice</span></button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Generated Reports (${reports.length})</span>
        </div>
        <div class="card-body" style="padding:0">
          ${reports.length === 0 ? `<div style="padding:20px">${emptyState('📊', 'No reports yet')}</div>` : `
          <div class="table-wrapper">
            <table>
              <thead><tr><th>#</th><th>Scope</th><th>Target</th><th>Created By</th><th>Date</th><th>Download</th></tr></thead>
              <tbody>
                ${reports.map(r => `
                <tr>
                  <td>${r.id}</td>
                  <td><span class="badge badge-purple">${r.scope}</span></td>
                  <td>${escHtml(r.target)}</td>
                  <td class="text-sm">${escHtml(r.created_by)}</td>
                  <td class="text-muted text-sm">${formatDate(r.created_at)}</td>
                  <td><button class="btn-secondary" style="font-size:11px;padding:5px 10px"
                    onclick="downloadReport(${r.id})">⬇ CSV</button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
        </div>
      </div>
    </div>
  `;
  window._reportProjects = projects;
  window._reportWards = wards;
}

function updateReportTarget() {
  const scope = document.getElementById('report-scope').value;
  const label = document.getElementById('report-target-label');
  const select = document.getElementById('report-target');
  if (scope === 'project') {
    label.textContent = 'Project';
    select.innerHTML = (window._reportProjects || []).map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
  } else {
    label.textContent = 'Ward';
    select.innerHTML = (window._reportWards || []).map(w => `<option value="${w}">${escHtml(w)}</option>`).join('');
  }
}

async function generateReport() {
  const scope = document.getElementById('report-scope').value;
  const target = document.getElementById('report-target').value;
  const result = document.getElementById('report-result');
  try {
    const data = await api('POST', '/reports', { scope, target });
    toast('Report generated!', 'success');
    result.innerHTML = `<div class="feedback-box feedback-approved mt-3">✓ Report #${data.report.id} generated.
      <button class="btn-secondary mt-2" onclick="downloadReport(${data.report.id})" style="font-size:11px;padding:6px 12px">⬇ Download CSV</button></div>`;
    showPage('reports');
  } catch (e) { toast(e.message, 'error'); }
}

async function downloadReport(id) {
  try {
    const resp = await fetch(`${API}/reports/${id}/download`, { headers: { Authorization: `Bearer ${authToken}` } });
    if (!resp.ok) throw new Error('Failed to download');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `report-${id}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('Report downloaded!', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function sendNotice() {
  const reportId = document.getElementById('notice-report').value;
  const title = document.getElementById('notice-title').value.trim();
  const message = document.getElementById('notice-msg').value.trim();
  if (!reportId || !title || !message) { toast('Please fill all fields.', 'error'); return; }
  try {
    const data = await api('POST', '/notifications/send', { reportId: Number(reportId), title, message });
    toast(`Notice sent to ${data.projectsNotified} project(s)!`, 'success');
    document.getElementById('notice-title').value = '';
    document.getElementById('notice-msg').value = '';
  } catch (e) { toast(e.message, 'error'); }
}

// ============================================================
// UI HELPERS
// ============================================================

function openModal(title, bodyHtml, onConfirm) {
  document.querySelectorAll('.modal-overlay').forEach(m => m.remove());
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${escHtml(title)}</h3>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn-primary" style="width:auto" id="modal-confirm-btn">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  overlay.querySelector('#modal-confirm-btn').addEventListener('click', async () => {
    const result = await onConfirm();
    if (result !== false) overlay.remove();
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function buildStagePipeline(currentStage) {
  const stages = [
    { name: 'Survey & Eligibility Confirmed', short: 'Survey' },
    { name: 'Demolition / Site Cleared', short: 'Demolition' },
    { name: 'Foundation Complete', short: 'Foundation' },
    { name: 'Structure — Floor-wise (shows floor number out of total)', short: 'Structure' },
    { name: 'Plumbing, Electrical & Finishing', short: 'Finishing' },
    { name: 'Possession Ready / Handover', short: 'Handover' },
  ];
  const currentIdx = stages.findIndex(s => currentStage.includes(s.short) || currentStage.includes(s.name));
  return `<div class="stage-pipeline">
    ${stages.map((s, i) => {
      const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'future';
      return `<div class="stage-step ${state}">
        <div class="stage-dot">${i < currentIdx ? '✓' : i + 1}</div>
        <div class="stage-info">
          <div class="stage-name">${s.short}</div>
          <div class="stage-detail">${s.name}</div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

function buildStagePipelineCard(project) {
  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Construction Pipeline</span>
        <span class="badge badge-${statusBadge(project.status)}">${project.status}</span>
      </div>
      <div class="card-body" style="padding:0 20px">
        ${buildStagePipeline(project.stage)}
      </div>
    </div>`;
}

function projectCard(p) {
  const isDelay = p.is_delayed || p.days_inactive >= 30;
  return `
    <div class="project-card" onclick="showProjectDetail('${p.id}')">
      <div class="project-card-header">
        <div>
          <div class="project-id">${escHtml(p.id)} · <span class="badge badge-purple">${p.scheme_type || 'SRA'}</span></div>
          <div class="project-name">${escHtml(p.name)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <span class="badge badge-${statusBadge(p.status)}">${p.status}</span>
          ${isDelay ? `<span class="badge badge-red">⚠️ Delayed (${p.days_inactive}d)</span>` : `<span class="badge badge-green">On Track</span>`}
        </div>
      </div>
      <div class="project-stage">${escHtml(p.stage)}</div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill ${p.progress>=70?'green':p.progress>=40?'':'amber'}" style="width:${p.progress}%"></div>
        </div>
        <span class="progress-pct">${p.progress}%</span>
      </div>
      <div class="project-meta">
        <div class="project-meta-item">📌 ${escHtml(p.ward)}</div>
        <div class="project-meta-item">👪 ${p.families}</div>
        ${p.floor_number ? `<div class="project-meta-item">🏢 Floor ${p.floor_number}/${p.floors_total}</div>` : ''}
      </div>
      ${p.alert && p.alert !== 'No critical issue' ? `<div class="project-alert">⚠️ ${escHtml(p.alert)}</div>` : ''}
    </div>`;
}

// ── VERIFICATION QUEUE (Government / Admin KYC) ───────────────────
async function renderVerificationQueue(container) {
  const data = await api('GET', '/admin/queue');
  const queue = data.queue || [];

  container.innerHTML = `
    <div class="page active">
      <div class="page-header">
        <h1>${t('verification_queue')}</h1>
        <p>Review Aadhaar / SRA Allotment IDs for residents & Trade Licenses / GST for contractors</p>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Pending KYC & Onboarding Requests (${queue.length})</span>
        </div>
        <div class="card-body" style="padding:0">
          ${queue.length === 0 ? `<div style="padding:20px">${emptyState('✅', 'No pending onboarding applications in queue')}</div>` : `
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Applicant / Entity</th>
                    <th>Document Proof</th>
                    <th>Date Applied</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${queue.map(item => `
                    <tr>
                      <td><span class="badge ${item.type === 'resident' ? 'badge-blue' : 'badge-purple'}">${item.type.toUpperCase()}</span></td>
                      <td><strong>${escHtml(item.name)}</strong></td>
                      <td><code>${escHtml(item.documentProof)}</code></td>
                      <td class="text-xs text-muted">${formatDate(item.createdAt)}</td>
                      <td><span class="badge badge-yellow">${item.status}</span></td>
                      <td>
                        <div style="display:flex;gap:6px">
                          <button class="btn-success" style="padding:4px 10px;font-size:11px" onclick="verifyApplicant('${item.type}', ${item.id}, 'Approved')">✓ Approve</button>
                          <button class="btn-danger" style="padding:4px 10px;font-size:11px" onclick="verifyApplicant('${item.type}', ${item.id}, 'Rejected')">✕ Reject</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

async function verifyApplicant(type, id, status) {
  try {
    await api('POST', `/admin/verify/${type}/${id}`, { status, message: `Admin decision: ${status}` });
    toast(`Applicant ${type} #${id} marked as ${status}`, 'success');
    showPage('verification-queue');
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── LEAFLET MUMBAI MAP HELPER ─────────────────────────────────
let leafletMapInstances = {};
function initMumbaiMap(projects, containerId = 'gov-mumbai-map') {
  const mapEl = document.getElementById(containerId);
  if (!mapEl || typeof L === 'undefined') return;

  if (leafletMapInstances[containerId]) {
    try {
      leafletMapInstances[containerId].remove();
    } catch (_) {}
    leafletMapInstances[containerId] = null;
  }

  // Determine initial center and zoom
  let center = [19.0607, 72.8525];
  let zoom = 12;
  if (projects && projects.length === 1) {
    const single = projects[0];
    const sLat = single.latitude || (single.id === 'PUN-23-101' ? 19.0607 : single.id === 'PUN-23-104' ? 19.0416 : 19.0726);
    const sLng = single.longitude || (single.id === 'PUN-23-101' ? 72.8525 : single.id === 'PUN-23-104' ? 72.8550 : 72.8790);
    center = [sLat, sLng];
    zoom = 15;
  }

  const map = L.map(containerId).setView(center, zoom);
  leafletMapInstances[containerId] = map;

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);

  const bounds = [];

  projects.forEach(p => {
    const lat = p.latitude || (p.id === 'PUN-23-101' ? 19.0607 : p.id === 'PUN-23-104' ? 19.0416 : 19.0726);
    const lng = p.longitude || (p.id === 'PUN-23-101' ? 72.8525 : p.id === 'PUN-23-104' ? 72.8550 : 72.8790);
    bounds.push([lat, lng]);

    const isDelay = p.is_delayed || p.days_inactive >= 30;
    const markerColor = isDelay ? '#ef4444' : (p.status === 'Approved' ? '#10b981' : '#f59e0b');

    const marker = L.circleMarker([lat, lng], {
      radius: 11,
      fillColor: markerColor,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9,
    }).addTo(map);

    const popupContent = `
      <div class="map-popup">
        <h4>${escHtml(p.name)}</h4>
        <p><strong>ID:</strong> ${escHtml(p.id)} · <strong>Ward:</strong> ${escHtml(p.ward)} · <strong>Scheme:</strong> ${p.scheme_type || 'SRA'}</p>
        ${p.unit ? `<p style="color:var(--color-primary-light);"><strong>Allotted Unit:</strong> ${escHtml(p.unit)}</p>` : ''}
        <p><strong>Stage:</strong> ${escHtml(p.stage)}</p>
        ${p.floor_number ? `<p><strong>Floor:</strong> ${p.floor_number} of ${p.floors_total}</p>` : ''}
        <div class="progress-container" style="margin:6px 0">
          <div class="progress-bar"><div class="progress-fill ${p.progress>=70?'green':p.progress>=40?'':'amber'}" style="width:${p.progress}%"></div></div>
          <span class="progress-pct">${p.progress}%</span>
        </div>
        <div class="popup-meta">
          <span class="badge badge-${statusBadge(p.status)}">${p.status}</span>
          ${isDelay ? `<span class="badge badge-red">⚠️ ${p.days_inactive}d Inactive</span>` : `<span class="badge badge-green">On Track</span>`}
        </div>
        <p class="text-xs text-muted"><strong>Contractor:</strong> ${escHtml(p.contractor)}</p>
        ${p.registered_residents ? `<p class="text-xs text-muted"><strong>Resident:</strong> ${escHtml(p.registered_residents)}</p>` : ''}
        ${currentUser?.role === 'government' ? `
        <button class="btn-primary" style="padding:4px 8px;font-size:11px;margin-top:6px;width:100%" onclick="showProjectDetail('${p.id}')">
          View Full Project
        </button>` : ''}
      </div>
    `;
    marker.bindPopup(popupContent);

    // If single project (like resident), auto open popup
    if (projects.length === 1) {
      setTimeout(() => marker.openPopup(), 400);
    }
  });

  if (projects.length > 1 && bounds.length > 0) {
    try {
      map.fitBounds(bounds, { padding: [40, 40] });
    } catch (_) {}
  }

  setTimeout(() => {
    map.invalidateSize();
  }, 250);
}

// ── EVIDENCE INSPECTION MODAL ─────────────────────────────────
async function viewEvidenceModal(projectId) {
  try {
    const data = await api('GET', `/projects/${encodeURIComponent(projectId)}/uploads`);
    const uploads = data.uploads || [];
    const bodyHtml = `
      <div>
        <p class="text-sm text-muted mb-3">Tamper-evident photographic & technical proof uploaded for <strong>${escHtml(projectId)}</strong>:</p>
        ${uploads.length === 0 ? emptyState('📷', 'No evidence files found') : `
          <div style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto">
            ${uploads.map(u => `
              <div class="list-row" style="background:var(--color-surface-3);padding:10px 14px;border-radius:8px">
                <div style="flex:1">
                  <div class="font-semibold text-sm">${categoryIcon(u.category)} ${escHtml(u.file_name)}</div>
                  <div class="text-xs text-muted mt-1">
                    ${u.category.toUpperCase()} · ${formatBytes(u.file_size)} · ${formatDate(u.created_at)}
                  </div>
                  <div class="geotag-meta mt-1">
                    📍 ${escHtml(u.geotag || 'Bandra East Pilot Site')}
                    ${u.latitude && u.longitude ? `(${u.latitude}, ${u.longitude})` : ''}
                  </div>
                </div>
                <button class="btn-secondary" style="font-size:11px;padding:4px 8px" onclick="window.open('${API}/uploads/${u.id}/download', '_blank')">
                  Download
                </button>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
    openModal(`Evidence Inspection: ${projectId}`, bodyHtml, () => true);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function showProjectDetail(id) {
  if (currentUser.role === 'government') showPage('progress-queue');
  else showPage('my-project');
}

function emptyState(icon, title, msg = '') {
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <h3>${title}</h3>
    ${msg ? `<p>${msg}</p>` : ''}
  </div>`;
}

// ── Utility functions ─────────────────────────────────────────
function statusBadge(status) {
  const map = { 'Approved': 'green', 'In progress': 'blue', 'Monitoring': 'yellow', 'Handover review': 'purple', 'Completed': 'green' };
  return map[status] || 'gray';
}

function updateBadge(status) {
  const map = { 'Approved': 'green', 'Rejected': 'red', 'Pending review': 'yellow' };
  return map[status] || 'gray';
}

function complaintBadge(status) {
  const map = { 'Submitted': 'red', 'Under Review': 'yellow', 'Resolved': 'green', 'Closed': 'gray' };
  return map[status] || 'gray';
}

function categoryIcon(cat) {
  const map = { photo: '📷', video: '🎥', 'quality-report': '📋', 'safety-report': '⛑️' };
  return map[cat] || '📁';
}

function formatDate(str) {
  if (!str) return '—';
  try {
    const d = new Date(str);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_) { return str; }
}

function formatBytes(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// SVG Icons
function iconDashboard() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`; }
function iconBuilding() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V7l9-4 9 4v14H3z"/><path d="M9 21V12h6v9"/></svg>`; }
function iconTimeline() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`; }
function iconComplaint() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`; }
function iconNotice() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`; }
function iconBell() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>`; }
function iconReport() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`; }
function iconUpload() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>`; }
function iconQueue() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`; }
function iconCheck() { return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`; }

// ── Boot ──────────────────────────────────────────────────────
if (authToken && currentUser) {
  // Try to verify the session is still valid
  api('GET', '/notifications')
    .then(() => initApp())
    .catch(() => {
      authToken = null; currentUser = null;
      localStorage.removeItem('pun_token');
      localStorage.removeItem('pun_user');
    });
}

// OTP input — auto-submit on 6 digits
document.getElementById('otp-input').addEventListener('input', function() {
  if (this.value.length === 6) verifyOtp();
});

// Enter key on mobile input
document.getElementById('mobile-input').addEventListener('keypress', function(e) {
  if (e.key === 'Enter') requestOtp();
});
