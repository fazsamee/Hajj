'use strict';

/* ==========================================================================
   Grade 3 Islamic Studies Quiz Platform — Interactive Frontend
   Topic: Chapter 8 – Hajj · 25 Questions · 10 Minutes · Anti-Cheating · Live Leaderboard
   ========================================================================== */

(function () {
  // Application State
  const state = {
    screen: 'welcome',
    attempt: null,
    questions: [],
    meanings: [],
    currentQIndex: 0,
    answers: {},
    timerInterval: null,
    saveDebounceTimer: null,
    remainingSeconds: 600,
    warn2mTriggered: false,
    warn30sTriggered: false,
    violations: 0,
    maxViolations: 3,
    lastViolationTime: 0,
    cameraStream: null,
    cameraEnabled: false,
    soundEnabled: true,
    sseSource: null,
    submitting: false,
    disqualified: false,
    // Section C matching tracking
    matchingTermSelected: null,
  };

  // Sound Synthesizer via Web Audio API
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playTone(freq, duration = 0.15, type = 'sine', gainVal = 0.15) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      /* ignore audio errors */
    }
  }

  function playSound(name) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      if (name === 'click') {
        playTone(520, 0.08, 'triangle', 0.1);
      } else if (name === 'answer') {
        playTone(660, 0.12, 'sine', 0.15);
      } else if (name === 'warn') {
        playTone(440, 0.25, 'sawtooth', 0.2);
        setTimeout(() => playTone(330, 0.35, 'sawtooth', 0.2), 150);
      } else if (name === 'fanfare') {
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          setTimeout(() => playTone(freq, 0.25, 'sine', 0.2), idx * 140);
        });
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Toast Notifications
  function showToast(msg, type = 'info', duration = 4000) {
    const existing = document.querySelector('.toast-msg');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    toast.innerHTML = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -20px)';
      toast.style.transition = 'all .3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Modal Dialogs
  function showModal({ title, body, icon = 'ℹ️', buttons = [{ text: 'OK', primary: true }] }) {
    return new Promise((resolve) => {
      const root = document.getElementById('overlay-root');
      root.innerHTML = '';

      const back = document.createElement('div');
      back.className = 'modal-back';

      const box = document.createElement('div');
      box.className = 'modal';

      box.innerHTML = `
        <div style="font-size:2.8rem;text-align:center;margin-bottom:8px;">${icon}</div>
        <h3 style="text-align:center;">${title}</h3>
        <p style="text-align:center;">${body}</p>
        <div class="btn-row" style="margin-top:20px;"></div>
      `;

      const btnRow = box.querySelector('.btn-row');
      buttons.forEach((btnInfo, idx) => {
        const b = document.createElement('button');
        b.className = `btn ${btnInfo.primary ? '' : 'ghost'} small`;
        b.textContent = btnInfo.text;
        b.addEventListener('click', () => {
          back.remove();
          resolve(idx);
        });
        btnRow.appendChild(b);
      });

      back.appendChild(box);
      root.appendChild(back);
    });
  }

  // Screen Management
  function showScreen(name) {
    state.screen = name;
    document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
    const target = document.getElementById(`screen-${name}`);
    if (target) {
      target.classList.add('active');
      window.scrollTo(0, 0);
    }
  }

  // Sound toggle button
  const soundBtn = document.getElementById('btn-sound');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      soundBtn.textContent = state.soundEnabled ? '🔊' : '🔇';
      showToast(state.soundEnabled ? 'Sound enabled 🔊' : 'Sound muted 🔇', 'info', 1500);
    });
  }

  // Fullscreen Helpers
  function enterFullscreen() {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
    } catch (e) {
      /* ignore fullscreen block */
    }
  }

  function exitFullscreen() {
    try {
      if (document.fullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      }
    } catch (e) {}
  }

  // Camera Management
  const btnCam = document.getElementById('btn-cam');
  const camStatus = document.getElementById('cam-status');

  if (btnCam) {
    btnCam.addEventListener('click', async () => {
      if (state.cameraEnabled) {
        stopCamera();
        btnCam.textContent = '📷 Add camera check (optional)';
        btnCam.classList.remove('gold');
        btnCam.classList.add('green');
        camStatus.textContent = 'Camera turned off.';
        return;
      }

      const confirmed = await showModal({
        icon: '📷',
        title: 'Optional Camera Verification',
        body: 'Camera access helps teachers verify your attempt. A small live preview will be visible to you only. <b>No video is recorded or sent across the internet</b>. Parent/guardian consent is required.',
        buttons: [
          { text: 'Enable Camera', primary: true },
          { text: 'Cancel', primary: false },
        ],
      });

      if (confirmed !== 0) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
          audio: false,
        });
        state.cameraStream = stream;
        state.cameraEnabled = true;

        btnCam.textContent = '✅ Camera Active (Click to turn off)';
        btnCam.classList.remove('green');
        btnCam.classList.add('gold');
        camStatus.innerHTML = '<span style="color:var(--green);font-weight:700;">● Camera verified! Small preview will show during quiz.</span>';
        showToast('Camera enabled successfully! 📷', 'info');
      } catch (err) {
        console.warn('Camera error:', err);
        state.cameraEnabled = false;
        camStatus.textContent = 'Camera not available or permission denied. You can continue without camera!';
      }
    });
  }

  function attachCameraBubble() {
    if (!state.cameraEnabled || !state.cameraStream) return;
    let bubble = document.getElementById('cam-bubble');
    if (!bubble) {
      bubble = document.createElement('div');
      bubble.id = 'cam-bubble';
      bubble.className = 'cam-bubble';
      bubble.innerHTML = `
        <video autoplay playsinline muted></video>
        <div class="cam-label">🟢 Self View</div>
      `;
      document.body.appendChild(bubble);
      const video = bubble.querySelector('video');
      video.srcObject = state.cameraStream;
    }
  }

  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach((t) => t.stop());
      state.cameraStream = null;
    }
    state.cameraEnabled = false;
    const bubble = document.getElementById('cam-bubble');
    if (bubble) bubble.remove();
  }

  // Student Entry Form Validation
  const inName = document.getElementById('in-name');
  const inClass = document.getElementById('in-class');
  const inId = document.getElementById('in-id');
  const btnStartQuiz = document.getElementById('btn-start-quiz');

  function validateEntryForm() {
    const nameVal = (inName.value || '').trim();
    const classVal = (inClass.value || '').trim();
    if (nameVal.length >= 2 && classVal.length >= 1) {
      btnStartQuiz.removeAttribute('disabled');
    } else {
      btnStartQuiz.setAttribute('disabled', 'true');
    }
  }

  if (inName && inClass) {
    inName.addEventListener('input', validateEntryForm);
    inClass.addEventListener('input', validateEntryForm);
  }

  // Welcome Screen Buttons
  document.getElementById('btn-go-entry')?.addEventListener('click', () => {
    playSound('click');
    showScreen('entry');
  });

  document.getElementById('btn-back-welcome')?.addEventListener('click', () => {
    playSound('click');
    showScreen('welcome');
  });

  document.getElementById('btn-go-lb')?.addEventListener('click', () => {
    playSound('click');
    loadLeaderboard();
    showScreen('leaderboard');
  });

  document.getElementById('btn-lb-home')?.addEventListener('click', () => {
    playSound('click');
    showScreen('welcome');
  });

  document.getElementById('btn-result-home')?.addEventListener('click', () => {
    playSound('click');
    showScreen('welcome');
  });

  document.getElementById('btn-result-lb')?.addEventListener('click', () => {
    playSound('click');
    loadLeaderboard();
    showScreen('leaderboard');
  });

  // Start Quiz Handler
  btnStartQuiz?.addEventListener('click', async () => {
    playSound('click');
    const name = (inName.value || '').trim();
    const className = (inClass.value || '').trim();
    const studentId = (inId.value || '').trim();

    if (!name || !className) {
      showToast('Please enter your full name and class', 'warn');
      return;
    }

    btnStartQuiz.disabled = true;
    btnStartQuiz.textContent = '⏳ Preparing Quiz...';

    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, className, studentId, cameraOn: state.cameraEnabled }),
      });

      const data = await res.json();

      if (res.status === 409) {
        btnStartQuiz.disabled = false;
        btnStartQuiz.textContent = '▶️ START QUIZ';
        const choice = await showModal({
          icon: '🛑',
          title: 'Quiz Already Completed',
          body: `An attempt for <b>${escapeHtml(name)}</b> in <b>${escapeHtml(className)}</b> has already been submitted. As per school rules, students may only take the quiz once.`,
          buttons: [
            { text: 'View My Results 📄', primary: true },
            { text: 'View Leaderboard 🏅', primary: false },
          ],
        });
        if (choice === 0 && data.attemptId) {
          state.attempt = { attemptId: data.attemptId, student: { name, className } };
          sessionStorage.setItem('hajj_quiz_attempt_id', data.attemptId);
          finishAndShowResults(data.attemptId);
        } else {
          loadLeaderboard();
          showScreen('leaderboard');
        }
        return;
      }

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to start quiz');
      }

      // Successful Start
      enterFullscreen();
      attachCameraBubble();

      state.attempt = data.attempt;
      sessionStorage.setItem('hajj_quiz_attempt_id', data.attempt.attemptId);
      state.questions = data.questions;
      state.meanings = data.meanings;
      state.answers = data.attempt.savedAnswers || {};
      state.violations = data.attempt.violationCount || 0;
      state.remainingSeconds = data.attempt.remainingSeconds || 600;
      state.currentQIndex = 0;
      state.submitting = false;
      state.disqualified = false;
      state.warn2mTriggered = false;
      state.warn30sTriggered = false;

      // Start Countdown Timer
      startCountdown(data.attempt.endsAt);

      // Render Dots and First Question
      renderQuestionDots();
      renderCurrentQuestion();
      updateStrikesDisplay();

      showScreen('quiz');
      showToast('🌟 Quiz started! Bismillah! You have 10 minutes.', 'info');
      playSound('fanfare');
    } catch (err) {
      console.error('Quiz start error:', err);
      showToast(err.message || 'Network error starting quiz. Please retry.', 'danger');
      btnStartQuiz.disabled = false;
      btnStartQuiz.textContent = '▶️ START QUIZ';
    }
  });

  // Countdown Timer Implementation
  function startCountdown(endsAt) {
    if (state.timerInterval) clearInterval(state.timerInterval);

    const timerPill = document.getElementById('timer');

    function tick() {
      const now = Date.now();
      const diffSec = Math.max(0, Math.round((endsAt - now) / 1000));
      state.remainingSeconds = diffSec;

      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      timerPill.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;

      // 2 Minute Warning
      if (diffSec <= 120 && diffSec > 30) {
        timerPill.classList.add('warn');
        timerPill.classList.remove('danger');
        if (!state.warn2mTriggered) {
          state.warn2mTriggered = true;
          playSound('warn');
          showToast('⚠️ <b>2 Minutes Remaining!</b> Make sure all 25 questions are answered.', 'warn', 5000);
        }
      } else if (diffSec <= 30 && diffSec > 0) {
        timerPill.classList.remove('warn');
        timerPill.classList.add('danger');
        if (!state.warn30sTriggered) {
          state.warn30sTriggered = true;
          playSound('warn');
          showToast('🚨 <b>30 Seconds Left!</b> Finishing soon!', 'danger', 4000);
        }
      } else if (diffSec === 0) {
        clearInterval(state.timerInterval);
        timerPill.textContent = '⏱ 0:00';
        timerPill.classList.add('danger');
        handleTimeUp();
      }
    }

    tick();
    state.timerInterval = setInterval(tick, 1000);
  }

  function handleTimeUp() {
    if (state.submitting) return;
    showToast('⏰ <b>Time is up!</b> Submitting your quiz now...', 'danger', 3000);
    submitQuiz(true, 'time');
  }

  // Auto-Save Answers
  function scheduleSave() {
    if (state.saveDebounceTimer) clearTimeout(state.saveDebounceTimer);
    state.saveDebounceTimer = setTimeout(async () => {
      if (!state.attempt || state.submitting) return;
      try {
        await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attemptId: state.attempt.attemptId,
            answers: state.answers,
          }),
        });
      } catch (err) {
        console.warn('Auto-save error:', err);
      }
    }, 450);
  }

  // Anti-Cheating & Exam Security Listeners
  function handleViolation(type, detail) {
    if (state.submitting || state.disqualified || state.screen !== 'quiz') return;

    const now = Date.now();
    // Throttle violations to prevent cascading blur/visibility triggers
    if (now - state.lastViolationTime < 3500) return;
    state.lastViolationTime = now;

    playSound('warn');

    fetch('/api/violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: state.attempt.attemptId,
        type,
        detail,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.ok) return;
        state.violations = data.violations;
        updateStrikesDisplay();

        if (data.disqualified || data.status === 'disqualified') {
          state.disqualified = true;
          showModal({
            icon: '❌',
            title: 'Attempt Disqualified',
            body: 'You left or switched away from the quiz window <b>3 times</b>. As per the examination rules, your quiz has been automatically submitted and disqualified.',
            buttons: [{ text: 'View Results', primary: true }],
          }).then(() => {
            finishAndShowResults();
          });
        } else {
          const warningsLeft = data.warningsLeft;
          if (warningsLeft === 2) {
            showModal({
              icon: '⚠️',
              title: 'Warning 1 of 3: Stay on Quiz Page',
              body: 'Please do not switch tabs, minimize, or leave the quiz window. You have <b>2 warnings remaining</b> before your quiz is disqualified.',
              buttons: [{ text: 'I Understand — Continue Quiz', primary: true }],
            }).then(() => enterFullscreen());
          } else if (warningsLeft === 1) {
            showModal({
              icon: '🚨',
              title: 'FINAL WARNING (2 of 3)',
              body: '<b>Warning:</b> If you switch away from the quiz window one more time, your quiz will immediately end and be disqualified!',
              buttons: [{ text: 'Return to Quiz Immediately', primary: true }],
            }).then(() => enterFullscreen());
          }
        }
      })
      .catch((e) => console.warn('Violation logging failed:', e));
  }

  function updateStrikesDisplay() {
    const el = document.getElementById('strikes');
    if (!el) return;
    if (state.violations === 0) {
      el.innerHTML = '<span style="color:var(--green);font-size:.85rem;font-weight:700;">🛡️ Secure</span>';
    } else if (state.violations === 1) {
      el.innerHTML = '<span style="color:var(--gold);font-weight:800;font-size:.85rem;">⚠️ Strike 1/3</span>';
    } else if (state.violations === 2) {
      el.innerHTML = '<span style="color:var(--rose);font-weight:800;font-size:.85rem;">🚨 Final Strike 2/3</span>';
    } else {
      el.innerHTML = '<span style="color:var(--rose);font-weight:900;font-size:.85rem;">❌ Disqualified</span>';
    }
  }

  // Detect Visibility / Tab Switching
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'quiz') {
      handleViolation('tab-hidden', 'Student switched tabs or minimized browser');
    }
  });

  // Detect Window Blur (clicking outside)
  window.addEventListener('blur', () => {
    if (state.screen === 'quiz' && !document.hidden) {
      handleViolation('window-blur', 'Student clicked outside browser window');
    }
  });

  // Detect Mouse Leaving Top of Window
  document.documentElement.addEventListener('mouseleave', (e) => {
    if (state.screen === 'quiz' && e.clientY <= 0) {
      // Trying to switch tabs or click address bar
      showToast('⚠️ Please stay within the quiz window!', 'warn', 2000);
    }
  });

  // Detect Fullscreen Change
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.screen === 'quiz' && !state.submitting) {
      handleViolation('exit-fullscreen', 'Student exited fullscreen mode');
    }
  });

  // Prevent Right-Click and Copy Shortcuts
  document.addEventListener('contextmenu', (e) => {
    if (state.screen === 'quiz') {
      e.preventDefault();
      showToast('🔒 Right-click is disabled during the quiz.', 'info', 1500);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (state.screen === 'quiz') {
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'u', 'p', 's', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        showToast('🔒 Keyboard copy/paste shortcuts are disabled.', 'info', 1500);
      }
      if (e.key === 'F12') {
        e.preventDefault();
      }
    }
  });

  // Question Dots & Navigation
  function renderQuestionDots() {
    const dotsContainer = document.getElementById('dots');
    if (!dotsContainer) return;
    dotsContainer.innerHTML = '';

    state.questions.forEach((q, idx) => {
      const dot = document.createElement('button');
      dot.className = 'dot';
      dot.setAttribute('title', `Question ${idx + 1}`);

      const hasAns = isQuestionAnswered(q.id);
      if (hasAns) dot.classList.add('answered');
      if (idx === state.currentQIndex) dot.classList.add('current');

      dot.addEventListener('click', () => {
        playSound('click');
        state.currentQIndex = idx;
        renderCurrentQuestion();
      });

      dotsContainer.appendChild(dot);
    });
  }

  function isQuestionAnswered(qid) {
    const val = state.answers[qid];
    return val !== undefined && val !== null && String(val).trim() !== '';
  }

  function updateProgress() {
    const total = state.questions.length;
    const answeredCount = state.questions.filter((q) => isQuestionAnswered(q.id)).length;
    const pct = Math.round((answeredCount / total) * 100);
    const fill = document.getElementById('progress');
    if (fill) fill.style.width = `${pct}%`;

    const qCountPill = document.getElementById('q-count');
    if (qCountPill) {
      qCountPill.textContent = `Question ${state.currentQIndex + 1} of ${total}`;
    }

    renderQuestionDots();

    // Show finish button if on last question or all answered
    const btnFinish = document.getElementById('btn-finish');
    if (btnFinish) {
      if (state.currentQIndex === total - 1 || answeredCount >= total - 1) {
        btnFinish.classList.remove('hidden');
      } else {
        btnFinish.classList.add('hidden');
      }
    }
  }

  // Render Current Question
  function renderCurrentQuestion() {
    const card = document.getElementById('q-card');
    if (!card) return;

    const q = state.questions[state.currentQIndex];
    if (!q) return;

    updateProgress();

    // Section Tag
    let sectionTag = '';
    let sectionTitle = '';
    if (q.section === 'A') {
      sectionTag = 'Section A · Fill in the Blanks';
      sectionTitle = 'Fill in the missing word from Chapter 8';
    } else if (q.section === 'B') {
      sectionTag = 'Section B · One-Word Answer';
      sectionTitle = 'Type exactly one word as your answer';
    } else if (q.section === 'C') {
      sectionTag = 'Section C · Interactive Matching';
      sectionTitle = 'Connect the correct Hajj terms to their meanings';
    } else if (q.section === 'D') {
      sectionTag = 'Section D · Multiple Choice';
      sectionTitle = 'Choose the one correct answer';
    }

    let bodyHTML = '';

    if (q.type === 'blank') {
      const val = state.answers[q.id] || '';
      bodyHTML = `
        <div class="q-section-tag">${sectionTag}</div>
        <p class="muted" style="font-size:.9rem;margin-bottom:8px;">${sectionTitle}</p>
        <div class="q-text">${escapeHtml(q.text)}</div>
        <div style="margin-top:16px;">
          <input type="text" class="answer-input" id="inp-blank" placeholder="Type missing word here..." autocomplete="off" value="${escapeHtml(val)}">
        </div>
      `;
    } else if (q.type === 'word') {
      const val = state.answers[q.id] || '';
      bodyHTML = `
        <div class="q-section-tag">${sectionTag}</div>
        <p class="muted" style="font-size:.9rem;margin-bottom:8px;">${sectionTitle}</p>
        <div class="q-text">${escapeHtml(q.text)}</div>
        <div style="margin-top:16px;">
          <input type="text" class="answer-input" id="inp-word" placeholder="Type one word here..." autocomplete="off" value="${escapeHtml(val)}">
        </div>
      `;
    } else if (q.type === 'mcq') {
      const selectedIdx = state.answers[q.id];
      const letters = ['A', 'B', 'C', 'D'];
      const optionsHTML = (q.options || [])
        .map((opt, i) => {
          const isSel = selectedIdx === i;
          return `
            <button class="option-btn ${isSel ? 'selected' : ''}" data-idx="${i}">
              <span class="letter">${letters[i]}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `;
        })
        .join('');

      bodyHTML = `
        <div class="q-section-tag">${sectionTag}</div>
        <p class="muted" style="font-size:.9rem;margin-bottom:8px;">${sectionTitle}</p>
        <div class="q-text">${escapeHtml(q.text)}</div>
        <div class="options" style="margin-top:16px;">
          ${optionsHTML}
        </div>
      `;
    } else if (q.type === 'match') {
      // Interactive Matching Board
      // Renders all 5 matching pairs with current question's term highlighted
      bodyHTML = `
        <div class="q-section-tag">${sectionTag}</div>
        <div class="q-text" style="margin-bottom:6px;">Connect each term to its meaning</div>
        <p class="muted" style="font-size:.92rem;margin-bottom:16px;">
          👉 <b>How to play:</b> Tap a <b>Term on the left</b>, then tap its <b>Meaning on the right</b> to pair them up!
        </p>
        <div id="matching-board-root"></div>
      `;
    }

    card.innerHTML = bodyHTML;

    // Attach Handlers
    if (q.type === 'blank') {
      const inp = document.getElementById('inp-blank');
      inp.focus();
      inp.addEventListener('input', (e) => {
        state.answers[q.id] = e.target.value.trim();
        scheduleSave();
        updateProgress();
      });
    } else if (q.type === 'word') {
      const inp = document.getElementById('inp-word');
      inp.focus();
      inp.addEventListener('input', (e) => {
        state.answers[q.id] = e.target.value.trim();
        scheduleSave();
        updateProgress();
      });
    } else if (q.type === 'mcq') {
      card.querySelectorAll('.option-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          playSound('answer');
          const idx = Number(btn.getAttribute('data-idx'));
          state.answers[q.id] = idx;
          card.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          scheduleSave();
          updateProgress();

          // Auto-advance after gentle delay if not last question
          if (state.currentQIndex < state.questions.length - 1) {
            setTimeout(() => {
              if (state.screen === 'quiz') {
                state.currentQIndex++;
                renderCurrentQuestion();
              }
            }, 300);
          }
        });
      });
    } else if (q.type === 'match') {
      renderMatchingBoard(q.id);
    }

    // Previous / Next button state
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (btnPrev) btnPrev.disabled = state.currentQIndex === 0;
    if (btnNext) {
      if (state.currentQIndex === state.questions.length - 1) {
        btnNext.textContent = 'Finish & Submit ✅';
        btnNext.classList.add('green');
      } else {
        btnNext.textContent = 'Next →';
        btnNext.classList.remove('green');
      }
    }
  }

  // Render Matching Board (Section C)
  function renderMatchingBoard(activeQid) {
    const root = document.getElementById('matching-board-root');
    if (!root) return;

    // The 5 matching questions are c1..c5
    const matchQuestions = state.questions.filter((q) => q.section === 'C');
    const meanings = state.meanings;

    const board = document.createElement('div');
    board.className = 'match-board';

    // Left Column: Terms
    const leftCol = document.createElement('div');
    leftCol.className = 'match-col';
    leftCol.innerHTML = '<h4 style="color:var(--purple-dark);margin-bottom:4px;">1. Terms</h4>';

    matchQuestions.forEach((mq) => {
      const pairedMeaningId = state.answers[mq.id];
      const pairedMeaning = meanings.find((m) => m.id === pairedMeaningId);
      const isSelected = state.matchingTermSelected === mq.id;
      const isCurrentActive = mq.id === activeQid;

      const item = document.createElement('div');
      item.className = `match-item ${isSelected ? 'sel' : ''} ${pairedMeaning ? 'done' : ''}`;
      if (isCurrentActive) item.style.borderWidth = '3px';

      let inner = `<b>${escapeHtml(mq.term)}</b>`;
      if (pairedMeaning) {
        inner += ` <span class="matched-badge">✓ Linked</span>`;
        inner += ` <button class="unpair-btn" title="Unlink" data-qid="${mq.id}">✕</button>`;
      }

      item.innerHTML = inner;

      // Click to select
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('unpair-btn')) {
          playSound('click');
          delete state.answers[mq.id];
          scheduleSave();
          renderMatchingBoard(activeQid);
          updateProgress();
          return;
        }

        playSound('click');
        if (state.matchingTermSelected === mq.id) {
          state.matchingTermSelected = null;
        } else {
          state.matchingTermSelected = mq.id;
        }
        renderMatchingBoard(activeQid);
      });

      leftCol.appendChild(item);
    });

    // Right Column: Meanings
    const rightCol = document.createElement('div');
    rightCol.className = 'match-col';
    rightCol.innerHTML = '<h4 style="color:var(--purple-dark);margin-bottom:4px;">2. Meanings</h4>';

    meanings.forEach((m) => {
      // Find which term is paired with this meaning
      const pairedQ = matchQuestions.find((mq) => state.answers[mq.id] === m.id);

      const item = document.createElement('div');
      item.className = `match-item ${pairedQ ? 'done' : ''}`;

      let inner = `<span>${escapeHtml(m.text)}</span>`;
      if (pairedQ) {
        inner += ` <span class="matched-badge" style="background:var(--purple);">Linked to: ${escapeHtml(pairedQ.term)}</span>`;
      }

      item.innerHTML = inner;

      item.addEventListener('click', () => {
        if (state.matchingTermSelected) {
          playSound('answer');
          state.answers[state.matchingTermSelected] = m.id;
          state.matchingTermSelected = null;
          scheduleSave();
          renderMatchingBoard(activeQid);
          updateProgress();
        } else {
          showToast('Tap a Term on the left first, then tap this meaning! 👈', 'info', 2000);
        }
      });

      rightCol.appendChild(item);
    });

    board.appendChild(leftCol);
    board.appendChild(rightCol);
    root.innerHTML = '';
    root.appendChild(board);
  }

  // Navigation Button Handlers
  document.getElementById('btn-prev')?.addEventListener('click', () => {
    if (state.currentQIndex > 0) {
      playSound('click');
      state.currentQIndex--;
      renderCurrentQuestion();
    }
  });

  document.getElementById('btn-next')?.addEventListener('click', () => {
    if (state.currentQIndex < state.questions.length - 1) {
      playSound('click');
      state.currentQIndex++;
      renderCurrentQuestion();
    } else {
      confirmAndSubmit();
    }
  });

  document.getElementById('btn-finish')?.addEventListener('click', () => {
    confirmAndSubmit();
  });

  async function confirmAndSubmit() {
    const total = state.questions.length;
    const answered = state.questions.filter((q) => isQuestionAnswered(q.id)).length;
    const unanswered = total - answered;

    let bodyMsg = `You have answered <b>${answered} of ${total}</b> questions.`;
    if (unanswered > 0) {
      bodyMsg += `<br><span style="color:var(--rose);">You still have <b>${unanswered} unanswered question${unanswered > 1 ? 's' : ''}</b>!</span>`;
    }
    bodyMsg += '<br><br>Are you sure you want to finish and submit your quiz now?';

    const confirmed = await showModal({
      icon: '📝',
      title: 'Finish Quiz Submission?',
      body: bodyMsg,
      buttons: [
        { text: 'Yes, Submit My Quiz! ✅', primary: true },
        { text: 'Keep Checking Answers', primary: false },
      ],
    });

    if (confirmed === 0) {
      submitQuiz(false, 'manual');
    }
  }

  // Quiz Submission
  async function submitQuiz(isAuto = false, reason = 'manual') {
    if (state.submitting) return;
    state.submitting = true;

    if (state.timerInterval) clearInterval(state.timerInterval);
    exitFullscreen();
    stopCamera();

    showToast('Submitting your answers...', 'info');

    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: state.attempt.attemptId,
          answers: state.answers,
          auto: isAuto ? 'time' : 'manual',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      finishAndShowResults();
    } catch (err) {
      console.error('Submit error:', err);
      showToast('Error submitting. Fetching your saved results...', 'warn');
      finishAndShowResults();
    }
  }

  // Results Screen & Celebration
  async function finishAndShowResults(explicitAttemptId) {
    showScreen('results');

    const aid = explicitAttemptId || state.attempt?.attemptId || sessionStorage.getItem('hajj_quiz_attempt_id');
    if (!aid) {
      loadLeaderboard();
      showScreen('leaderboard');
      return;
    }

    try {
      const res = await fetch(`/api/result?attemptId=${encodeURIComponent(aid)}`);
      const data = await res.json();

      if (!res.ok || !data.ok || !data.result) {
        throw new Error((data && data.error) || 'Could not load results');
      }

      renderResultsScreen(data.result);
    } catch (err) {
      console.error('Results load error:', err);
      const card = document.getElementById('results-card');
      if (card) {
        card.innerHTML = `
          <h2>Quiz Completed!</h2>
          <p class="muted">Check the live leaderboard for your current standing.</p>
        `;
      }
    }
  }

  function renderResultsScreen(result) {
    const card = document.getElementById('results-card');
    if (!card) return;

    const isDisqualified = result.status === 'disqualified';
    const score = result.score || 0;
    const total = result.total || 25;
    const percentage = result.percentage || Math.round((score / total) * 100);
    const correct = result.correct || 0;
    const incorrect = result.incorrect || 0;
    const unanswered = result.unanswered || 0;
    const timeTaken = result.timeTaken != null ? formatTime(result.timeTaken) : '—';
    const rank = result.rank;

    // Encouraging Grade 3 Message & Banner
    let banner = '';
    let emoji = '🌟';
    if (isDisqualified) {
      emoji = '⚠️';
      banner = 'Attempt Disqualified (Tab Switch Limit Reached)';
    } else if (score >= 23) {
      emoji = '🏆';
      banner = 'Excellent! Hajj Champion!';
    } else if (score >= 19) {
      emoji = '⭐';
      banner = 'Amazing Work!';
    } else if (score >= 15) {
      emoji = '📚';
      banner = 'Good Job! Keep Learning!';
    } else if (score >= 10) {
      emoji = '🌱';
      banner = 'Keep Practising!';
    } else {
      emoji = '❤️';
      banner = "Don't Give Up! Try Learning Again!";
    }

    if (!isDisqualified && score >= 15) {
      triggerConfetti();
      playSound('fanfare');
    }

    let rankHTML = '';
    if (rank) {
      let medal = '🏅';
      if (rank === 1) medal = '🥇 Gold';
      else if (rank === 2) medal = '🥈 Silver';
      else if (rank === 3) medal = '🥉 Bronze';
      rankHTML = `<div class="rank-chip">${medal} Leaderboard Rank #${rank}</div>`;
    }

    card.innerHTML = `
      <div style="font-size:3.5rem;margin-bottom:4px;">${emoji}</div>
      <h1 class="result-banner" style="color:var(--purple-dark);">${banner}</h1>
      <p class="muted" style="font-size:1.05rem;margin-bottom:18px;">Well done, <b>${escapeHtml(result.student.name)}</b> (${escapeHtml(result.student.className)})!</p>

      ${rankHTML}

      <!-- Circular Score Gauge -->
      <div class="score-ring-wrap" style="margin-top:16px;">
        <div class="score-ring">
          <svg width="190" height="190" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="#ede7ff" stroke-width="11"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="url(#grad)" stroke-width="11"
              stroke-dasharray="314.159"
              stroke-dashoffset="${314.159 * (1 - percentage / 100)}"
              stroke-linecap="round"
              style="transition: stroke-dashoffset 1.5s ease-out;"/>
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#7c3aed"/>
                <stop offset="100%" stop-color="#f59e0b"/>
              </linearGradient>
            </defs>
          </svg>
          <div class="num">${score}<span style="font-size:1.2rem;color:var(--muted);">/${total}</span></div>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="result-stats">
        <div class="stat"><div class="v">${percentage}%</div><div class="l">Accuracy</div></div>
        <div class="stat"><div class="v" style="color:var(--green);">${correct}</div><div class="l">Correct ✅</div></div>
        <div class="stat"><div class="v" style="color:var(--rose);">${incorrect}</div><div class="l">Incorrect ❌</div></div>
        <div class="stat"><div class="v">${timeTaken}</div><div class="l">Time Taken ⏱️</div></div>
      </div>
    `;

    // Teacher Review Box
    const reviewBox = document.getElementById('review-box');
    if (reviewBox) {
      if (result.review && Array.isArray(result.review)) {
        reviewBox.classList.remove('hidden');
        reviewBox.innerHTML = `
          <h2 style="color:var(--purple-dark);margin-bottom:14px;">📖 Question by Question Review</h2>
          <div class="review-list">
            ${result.review
              .map(
                (item, idx) => `
                <div class="review-item ${item.correct ? 'right' : 'wrong'}">
                  <div class="prompt">Question ${idx + 1}: ${escapeHtml(item.prompt)}</div>
                  <div class="line"><b>Your answer:</b> ${escapeHtml(item.yourAnswer || '—')}</div>
                  ${!item.correct ? `<div class="line" style="color:var(--green);font-weight:700;"><b>Correct answer:</b> ${escapeHtml(item.correctAnswer)}</div>` : ''}
                </div>
              `
              )
              .join('')}
          </div>
        `;
      } else {
        reviewBox.classList.remove('hidden');
        reviewBox.innerHTML = `
          <div style="text-align:center;padding:12px;">
            <div style="font-size:1.8rem;margin-bottom:6px;">🔒</div>
            <h3 style="color:var(--purple-dark);font-size:1.1rem;">Answers Review Locked</h3>
            <p class="muted" style="font-size:.92rem;">Your teacher will open the full answers review during class review time.</p>
          </div>
        `;
      }
    }

    // Embed Results Leaderboard
    if (result.leaderboard) {
      renderLeaderboardTable('results-lb', result.leaderboard);
    }
  }

  // Leaderboard Loader & SSE Connection
  function loadLeaderboard() {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.ok && data.leaderboard) {
          renderLeaderboardTable('lb-body', data.leaderboard);
        }
      })
      .catch((e) => console.warn('Leaderboard fetch failed:', e));

    setupSSE();
  }

  function setupSSE() {
    if (state.sseSource) return;
    try {
      state.sseSource = new EventSource('/api/events');
      state.sseSource.addEventListener('update', (e) => {
        try {
          const lb = JSON.parse(e.data);
          if (state.screen === 'leaderboard') {
            renderLeaderboardTable('lb-body', lb);
          }
          if (state.screen === 'results') {
            renderLeaderboardTable('results-lb', lb);
          }
        } catch (err) {}
      });
    } catch (e) {}
  }

  function renderLeaderboardTable(containerId, lb) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const entries = lb.entries || [];
    if (entries.length === 0) {
      el.innerHTML = `
        <div class="text-center muted" style="padding:40px 10px;">
          <div style="font-size:2.6rem;margin-bottom:8px;">🕌</div>
          <p>No completed attempts yet in this session.</p>
          <p style="font-size:.85rem;margin-top:4px;">Be the first to finish and take #1 on the podium!</p>
        </div>
      `;
      return;
    }

    // Top 3 Podium Cards
    const top3 = entries.slice(0, 3);
    let podiumHTML = '<div class="podium-wrap">';

    const medals = ['🥇', '🥈', '🥉'];
    const cardClasses = ['first', 'second', 'third'];

    // Display in order 2nd, 1st, 3rd for classic podium visual
    const displayOrder = [1, 0, 2];
    displayOrder.forEach((pos) => {
      const student = top3[pos];
      if (student) {
        podiumHTML += `
          <div class="podium-card ${cardClasses[pos]}">
            <div class="podium-rank">${medals[pos]}</div>
            <div class="podium-name">${escapeHtml(student.name)}</div>
            <div class="podium-class">${escapeHtml(student.className)}</div>
            <div class="podium-score">${student.score}<span style="font-size:.9rem;color:var(--muted);">/25</span></div>
            <div class="podium-time">⏱️ ${formatTime(student.timeTaken)}</div>
          </div>
        `;
      }
    });
    podiumHTML += '</div>';

    // Table for all rankings
    let tableHTML = `
      <div style="overflow-x:auto;">
        <table class="lb-table">
          <thead>
            <tr>
              <th class="rank">Rank</th>
              <th>Student</th>
              <th>Class</th>
              <th style="text-align:center;">Score</th>
              <th style="text-align:right;">Time</th>
            </tr>
          </thead>
          <tbody>
    `;

    entries.forEach((row, i) => {
      let rowClass = '';
      let rankText = `#${row.rank}`;
      if (row.rank === 1) { rowClass = 'gold-row'; rankText = '🥇 1st'; }
      else if (row.rank === 2) { rowClass = 'silver-row'; rankText = '🥈 2nd'; }
      else if (row.rank === 3) { rowClass = 'bronze-row'; rankText = '🥉 3rd'; }

      tableHTML += `
        <tr class="${rowClass}">
          <td class="rank">${rankText}</td>
          <td><b>${escapeHtml(row.name)}</b></td>
          <td class="muted">${escapeHtml(row.className)}</td>
          <td class="score text-center"><b>${row.score}</b> / 25 <span class="muted" style="font-size:.78rem;">(${row.percentage}%)</span></td>
          <td class="time text-right">${formatTime(row.timeTaken)}</td>
        </tr>
      `;
    });

    tableHTML += '</tbody></table></div>';
    el.innerHTML = podiumHTML + tableHTML;
  }

  // Celebration Confetti
  function triggerConfetti() {
    const colors = ['#7c3aed', '#f59e0b', '#059669', '#ec4899', '#3b82f6'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = `${Math.random() * 100}vw`;
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      p.style.animationDuration = `${1.8 + Math.random() * 2.2}s`;
      p.style.animationDelay = `${Math.random() * 0.5}s`;
      document.body.appendChild(p);

      setTimeout(() => p.remove(), 4200);
    }
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

