'use strict';

/* ==========================================================================
   Grade 3 Islamic Studies Quiz Platform — Teacher Admin Dashboard
   ========================================================================== */

(function () {
  let token = sessionStorage.getItem('adminToken') || '';
  let attemptsData = [];
  let questionKey = [];
  let statsData = null;
  let reviewOpen = false;
  let activeFilter = 'all';
  let searchQuery = '';

  // DOM Elements
  const loginScreen = document.getElementById('admin-login-screen');
  const dashScreen = document.getElementById('admin-dash-screen');
  const inpPass = document.getElementById('adm-pass');
  const btnLogin = document.getElementById('btn-adm-login');
  const loginErr = document.getElementById('adm-login-err');
  const btnLogout = document.getElementById('btn-adm-logout');
  const btnRefresh = document.getElementById('btn-adm-refresh');
  const btnExport = document.getElementById('btn-adm-export');
  const btnToggleReview = document.getElementById('btn-adm-toggle-review');
  const btnCtrlToggleReview = document.getElementById('btn-ctrl-toggle-review');
  const reviewStatusLabel = document.getElementById('review-status-label');
  const btnResetLb = document.getElementById('btn-reset-lb');
  const btnResetSession = document.getElementById('btn-reset-session');
  const inpSearch = document.getElementById('inp-search-attempts');
  const modalRoot = document.getElementById('admin-modal-root');

  // Initialize
  if (token) {
    verifyAndLoad();
  }

  // Login Handler
  btnLogin?.addEventListener('click', doLogin);
  inpPass?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });

  async function doLogin() {
    const password = (inpPass.value || '').trim();
    if (!password) {
      loginErr.textContent = 'Please enter the teacher password.';
      return;
    }

    loginErr.textContent = 'Checking password...';
    btnLogin.disabled = true;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Invalid password');
      }

      token = data.token;
      sessionStorage.setItem('adminToken', token);
      loginErr.textContent = '';
      inpPass.value = '';

      showDashboard();
      await loadAllData();
    } catch (err) {
      loginErr.textContent = err.message || 'Incorrect password. Default is "hajj2025".';
    } finally {
      btnLogin.disabled = false;
    }
  }

  // Verify Existing Token & Load
  async function verifyAndLoad() {
    try {
      const res = await fetch('/api/admin/attempts', {
        headers: { 'x-admin-token': token },
      });
      if (res.ok) {
        showDashboard();
        await loadAllData();
      } else {
        token = '';
        sessionStorage.removeItem('adminToken');
        showLogin();
      }
    } catch (e) {
      showLogin();
    }
  }

  function showLogin() {
    loginScreen.classList.remove('hidden');
    dashScreen.classList.add('hidden');
  }

  function showDashboard() {
    loginScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
  }

  // Logout
  btnLogout?.addEventListener('click', () => {
    token = '';
    sessionStorage.removeItem('adminToken');
    showLogin();
  });

  // Refresh
  btnRefresh?.addEventListener('click', async () => {
    btnRefresh.textContent = '⏳ Refreshing...';
    await loadAllData();
    btnRefresh.textContent = '🔄 Refresh';
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      const targetId = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach((tc) => tc.classList.add('hidden'));
      const target = document.getElementById(targetId);
      if (target) target.classList.remove('hidden');

      if (targetId === 'tab-leaderboard') renderLeaderboardTab();
      if (targetId === 'tab-analytics') renderAnalyticsTab();
    });
  });

  // Search & Filter Listeners
  inpSearch?.addEventListener('input', (e) => {
    searchQuery = (e.target.value || '').trim().toLowerCase();
    renderAttemptsTable();
  });

  document.querySelectorAll('.filter-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach((b) => {
        b.classList.remove('active');
        b.classList.add('ghost');
      });
      btn.classList.add('active');
      btn.classList.remove('ghost');
      activeFilter = btn.getAttribute('data-filter');
      renderAttemptsTable();
    });
  });

  // Load All Admin Data
  async function loadAllData() {
    try {
      const [attRes, statsRes] = await Promise.all([
        fetch('/api/admin/attempts', { headers: { 'x-admin-token': token } }),
        fetch('/api/admin/stats', { headers: { 'x-admin-token': token } }),
      ]);

      if (!attRes.ok || !statsRes.ok) throw new Error('Data load failed');

      const attData = await attRes.json();
      const stData = await statsRes.json();

      attemptsData = attData.attempts || [];
      questionKey = attData.questionKey || [];
      reviewOpen = !!attData.reviewOpen;
      statsData = stData;

      updateReviewButtonLabel();
      updateMetricCards();
      renderAttemptsTable();
      renderLeaderboardTab();
      renderAnalyticsTab();
    } catch (err) {
      console.error('Failed to load admin data:', err);
    }
  }

  function updateReviewButtonLabel() {
    if (reviewStatusLabel) {
      reviewStatusLabel.textContent = reviewOpen ? 'Unlocked 🔓' : 'Locked 🔒';
    }
    if (btnToggleReview) {
      if (reviewOpen) {
        btnToggleReview.classList.add('green');
        btnToggleReview.classList.remove('ghost');
      } else {
        btnToggleReview.classList.remove('green');
        btnToggleReview.classList.add('ghost');
      }
    }
  }

  // Metric Cards
  function updateMetricCards() {
    const total = attemptsData.length;
    const inProgress = attemptsData.filter((a) => a.status === 'in-progress').length;
    const submitted = attemptsData.filter((a) => a.status === 'submitted').length;
    const disqualified = attemptsData.filter((a) => a.status === 'disqualified').length;

    document.getElementById('met-total').textContent = total;
    document.getElementById('met-in-progress').textContent = inProgress;
    document.getElementById('met-submitted').textContent = submitted;
    document.getElementById('met-disqualified').textContent = disqualified;
    document.getElementById('tab-cnt-attempts').textContent = total;

    const scores = attemptsData.filter((a) => a.status === 'submitted').map((a) => a.score);
    if (scores.length > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      const avg = (sum / scores.length).toFixed(1);
      document.getElementById('met-avg').textContent = `${avg} / 25`;
      document.getElementById('met-high-low').textContent = `${Math.max(...scores)} / ${Math.min(...scores)}`;
    } else {
      document.getElementById('met-avg').textContent = '—';
      document.getElementById('met-high-low').textContent = '—';
    }
  }

  // Render Attempts Table
  function renderAttemptsTable() {
    const tbody = document.getElementById('tbl-attempts-body');
    if (!tbody) return;

    let filtered = attemptsData.slice();

    // Status filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter((a) => a.status === activeFilter);
    }

    // Search query
    if (searchQuery) {
      filtered = filtered.filter(
        (a) =>
          (a.student.name || '').toLowerCase().includes(searchQuery) ||
          (a.student.className || '').toLowerCase().includes(searchQuery) ||
          (a.student.studentId || '').toLowerCase().includes(searchQuery)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center muted" style="padding:30px;">
            No student attempts found matching your criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((a) => {
        // Status Chip
        let statusChip = '';
        if (a.status === 'submitted') {
          statusChip = '<span class="status-chip ok">✅ Submitted</span>';
        } else if (a.status === 'in-progress') {
          statusChip = '<span class="status-chip live">⏳ In Progress</span>';
        } else if (a.status === 'disqualified') {
          statusChip = '<span class="status-chip dq">❌ Disqualified</span>';
        }

        // Violations Pill
        const vCount = (a.violations || []).length;
        let vHTML = '';
        if (vCount === 0) {
          vHTML = '<span class="violation-pill clean">0 clean</span>';
        } else {
          vHTML = `<button class="violation-pill btn-view-audit" data-id="${a.id}">⚠️ ${vCount} event${vCount > 1 ? 's' : ''}</button>`;
        }

        // Time format
        const timeStr = a.timeTaken != null ? formatTime(a.timeTaken) : '—';
        const subTime = a.submittedAt ? new Date(a.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

        // Camera
        const camStr = a.cameraOn ? '<span style="color:var(--green);font-weight:700;">🟢 On</span>' : '<span class="muted">No</span>';

        return `
          <tr>
            <td><b>${escapeHtml(a.student.name)}</b></td>
            <td>${escapeHtml(a.student.className)}</td>
            <td class="muted">${escapeHtml(a.student.studentId || '—')}</td>
            <td>${statusChip}</td>
            <td style="font-weight:900;color:var(--purple-dark);">${a.score ?? 0} / ${a.total || 25} <span class="muted" style="font-size:.78rem;">(${a.percentage ?? 0}%)</span></td>
            <td>${timeStr}</td>
            <td>${vHTML}</td>
            <td>${camStr}</td>
            <td class="muted">${subTime}</td>
            <td>
              <button class="btn ghost small btn-view-answers" data-id="${a.id}" style="padding:5px 12px;font-size:.82rem;">📄 Answers</button>
            </td>
          </tr>
        `;
      })
      .join('');

    // Attach Event Listeners
    tbody.querySelectorAll('.btn-view-audit').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        showAuditModal(id);
      });
    });

    tbody.querySelectorAll('.btn-view-answers').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        showAnswersModal(id);
      });
    });
  }

  // Audit Trail Modal (Tab-Switch Events)
  function showAuditModal(attemptId) {
    const a = attemptsData.find((x) => x.id === attemptId);
    if (!a) return;

    const violations = a.violations || [];
    let content = '';

    if (violations.length === 0) {
      content = '<p class="muted">No anti-cheat violations recorded for this attempt. Clean session!</p>';
    } else {
      content = `
        <div style="margin-top:12px;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Event Type</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${violations
                .map(
                  (v, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td class="muted">${new Date(v.at).toLocaleTimeString()}</td>
                  <td><span class="status-chip dq">${escapeHtml(v.type)}</span></td>
                  <td>${escapeHtml(v.detail)}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    showAdminModal({
      title: `🛡️ Anti-Cheating Event Log: ${escapeHtml(a.student.name)}`,
      body: `
        <p class="muted">Class: ${escapeHtml(a.student.className)} · Total Recorded Events: <b>${violations.length}</b></p>
        ${content}
      `,
    });
  }

  // View Student Answers Modal
  function showAnswersModal(attemptId) {
    const a = attemptsData.find((x) => x.id === attemptId);
    if (!a) return;

    const answers = a.currentAnswers || {};
    const grade = a.grade || [];

    const rows = questionKey
      .map((q, idx) => {
        const g = grade.find((p) => p.qid === q.id);
        const isRight = g ? g.correct : false;
        const studentAns = g ? g.value : answers[q.id];

        return `
          <div class="review-item ${isRight ? 'right' : 'wrong'}" style="margin-bottom:8px;">
            <div class="prompt">
              <b>Q${idx + 1} [${q.section}]:</b> ${escapeHtml(q.text)}
              <span style="float:right;font-weight:800;color:${isRight ? 'var(--green)' : 'var(--rose)'};">
                ${isRight ? '✅ Correct' : '❌ Incorrect'}
              </span>
            </div>
            <div class="line"><b>Student Answer:</b> ${escapeHtml(studentAns != null && studentAns !== '' ? String(studentAns) : '(unanswered)')}</div>
            <div class="line" style="color:var(--green);"><b>Accepted / Correct:</b> ${escapeHtml(String(q.answer))}</div>
          </div>
        `;
      })
      .join('');

    showAdminModal({
      title: `📄 Answers: ${escapeHtml(a.student.name)} (${a.score} / ${a.total || 25})`,
      body: `
        <div style="max-height:65vh;overflow-y:auto;padding-right:8px;">
          ${rows}
        </div>
      `,
    });
  }

  // Tab 2: Render Live Leaderboard
  function renderLeaderboardTab() {
    const c = document.getElementById('adm-lb-container');
    if (!c) return;

    const submitted = attemptsData
      .filter((a) => a.status === 'submitted')
      .sort((x, y) => y.score - x.score || (x.timeTaken || 9999) - (y.timeTaken || 9999));

    if (submitted.length === 0) {
      c.innerHTML = '<p class="muted text-center" style="padding:30px;">No completed submissions yet.</p>';
      return;
    }

    c.innerHTML = `
      <table class="lb-table">
        <thead>
          <tr>
            <th class="rank">Rank</th>
            <th>Student</th>
            <th>Class</th>
            <th>Score</th>
            <th>Time</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${submitted
            .map((s, i) => {
              let medal = `#${i + 1}`;
              let rowCls = '';
              if (i === 0) { medal = '🥇 1st'; rowCls = 'gold-row'; }
              else if (i === 1) { medal = '🥈 2nd'; rowCls = 'silver-row'; }
              else if (i === 2) { medal = '🥉 3rd'; rowCls = 'bronze-row'; }
              return `
                <tr class="${rowCls}">
                  <td class="rank">${medal}</td>
                  <td><b>${escapeHtml(s.student.name)}</b></td>
                  <td class="muted">${escapeHtml(s.student.className)}</td>
                  <td class="score"><b>${s.score}</b> / 25 (${s.percentage}%)</td>
                  <td class="time">${formatTime(s.timeTaken)}</td>
                  <td><span class="status-chip ok">Ranked</span></td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  // Tab 3: Question Difficulty Analysis
  function renderAnalyticsTab() {
    const c = document.getElementById('adm-analytics-container');
    if (!c || !statsData) return;

    const questions = statsData.questions || [];
    const gradedCount = statsData.gradedCount || 0;

    if (gradedCount === 0) {
      c.innerHTML = '<p class="muted text-center" style="padding:30px;">No graded quizzes yet to analyze difficulty.</p>';
      return;
    }

    // Sort by hardest first (lowest percent correct)
    const sorted = questions.slice().sort((a, b) => (a.pctCorrect ?? 0) - (b.pctCorrect ?? 0));

    c.innerHTML = `
      <div style="margin-bottom:14px;">
        <span class="pill green">Analyzed attempts: ${gradedCount}</span>
        <span class="pill gold" style="margin-left:8px;">Hardest questions listed first</span>
      </div>
      <div>
        ${sorted
          .map((q, idx) => {
            const pct = q.pctCorrect ?? 0;
            let barColor = 'var(--green)';
            if (pct < 50) barColor = 'var(--rose)';
            else if (pct < 75) barColor = 'var(--gold)';

            return `
            <div class="q-diff">
              <span style="font-weight:800;width:38px;color:var(--muted);">${q.qid.toUpperCase()}</span>
              <div class="lab" title="${escapeHtml(q.text)}">${escapeHtml(q.text)}</div>
              <div class="bar-track">
                <div class="bar" style="width:${pct}%;background:${barColor};"></div>
              </div>
              <div class="pct" style="color:${barColor};">${pct}%</div>
              <span class="muted" style="font-size:.78rem;width:80px;text-align:right;">(${q.correct}/${gradedCount})</span>
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  }

  // Toggle Answers Review
  async function toggleReviewPolicy() {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({ reviewOpen: !reviewOpen }),
      });
      const data = await res.json();
      if (data && data.ok) {
        reviewOpen = data.reviewOpen;
        updateReviewButtonLabel();
        alert(reviewOpen ? '🔓 Student review is now UNLOCKED! Students can now see answers on results screen.' : '🔒 Student review is now LOCKED. Answers hidden.');
      }
    } catch (e) {
      alert('Failed to update review setting.');
    }
  }

  btnToggleReview?.addEventListener('click', toggleReviewPolicy);
  btnCtrlToggleReview?.addEventListener('click', toggleReviewPolicy);

  // Export CSV
  btnExport?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/admin/export.csv', {
        headers: { 'x-admin-token': token },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hajj-quiz-grade3-results-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not export CSV. Make sure you are authorized.');
    }
  });

  // Reset Leaderboard
  btnResetLb?.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset the leaderboard for a new session? Previous attempts will be safely archived.')) return;
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ mode: 'leaderboard' }),
      });
      const data = await res.json();
      if (data && data.ok) {
        alert('Leaderboard reset successfully. Archive saved to data/ directory.');
        await loadAllData();
      }
    } catch (e) {
      alert('Reset failed.');
    }
  });

  // Reset Entire Session
  btnResetSession?.addEventListener('click', async () => {
    if (!confirm('⚠️ DANGER: Reset entire quiz session? All student attempts will be archived and a fresh session will start.')) return;
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ mode: 'session' }),
      });
      const data = await res.json();
      if (data && data.ok) {
        alert('All attempts archived and session reset successfully.');
        await loadAllData();
      }
    } catch (e) {
      alert('Reset failed.');
    }
  });

  // Admin Modal Helper
  function showAdminModal({ title, body }) {
    modalRoot.innerHTML = '';
    const back = document.createElement('div');
    back.className = 'modal-back';

    const box = document.createElement('div');
    box.className = 'modal';
    box.style.maxWidth = '750px';

    box.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;">${title}</h3>
        <button class="btn ghost small" id="btn-close-modal" style="padding:4px 10px;font-size:1rem;">✕</button>
      </div>
      <div>${body}</div>
    `;

    box.querySelector('#btn-close-modal').addEventListener('click', () => back.remove());
    back.addEventListener('click', (e) => {
      if (e.target === back) back.remove();
    });

    back.appendChild(box);
    modalRoot.appendChild(back);
  }

  // Utilities
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(sec) {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
})();

