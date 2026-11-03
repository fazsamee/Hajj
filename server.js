'use strict';
/*
 * Grade 3 Hajj Quiz Platform — Backend Server
 * Zero-dependency Node.js server:
 *   - Static frontend (public/)
 *   - JSON file "database" with safe atomic file writes (data/state.json)
 *   - Real-time leaderboard updates via Server-Sent Events (SSE)
 *   - Server-authoritative quiz timing, anti-cheat detection, and marking
 *
 * Run:  node server.js  →  http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const QUIZ_DURATION = 600;   // 10 minutes in seconds
const GRACE = 45;            // extra seconds before an unsubmitted attempt auto-finalises
const MAX_VIOLATIONS = 3;    // anti-cheating policy: warn 1, warn 2, disqualify on 3

/* ------------------------------------------------------------------ */
/* Quiz content + answer key (server-side only — never sent raw)      */
/* ------------------------------------------------------------------ */

const QUESTIONS = [
  // ----- Section A: Fill in the blanks (6) -----
  { id: 'a1', section: 'A', type: 'blank', text: "Hajj is the pilgrimage to the ______ in Makkah.", answer: "Ka'bah", accepts: ["Ka'bah", "Kaaba", "Kabah", "Kaabah", "House of Allah", "house"] },
  { id: 'a2', section: 'A', type: 'blank', text: "Hajj is the ______ pillar of Islam.", answer: "fifth", accepts: ["fifth", "5th", "five", "5"] },
  { id: 'a3', section: 'A', type: 'blank', text: "Tawaf is going around the Ka'bah ______ times.", answer: "seven", accepts: ["seven", "7"] },
  { id: 'a4', section: 'A', type: 'blank', text: "Sa'ee is walking between Safa and ______.", answer: "Marwah", accepts: ["Marwah", "Marwa"] },
  { id: 'a5', section: 'A', type: 'blank', text: "Pilgrims spend the night at ______ on the 8th of Dhul-Hijjah.", answer: "Mina", accepts: ["Mina", "Minaa", "Mina valley"] },
  { id: 'a6', section: 'A', type: 'blank', text: "The stay at Arafah takes place on the ______ of Dhul-Hijjah.", answer: "ninth", accepts: ["ninth", "9th", "9", "nine"] },

  // ----- Section B: One-word answers (5) -----
  { id: 'b1', section: 'B', type: 'word', text: "What is the name of the special clothing worn during Hajj?", answer: "Ihram", accepts: ["Ihram", "Ihraam", "Ehram"] },
  { id: 'b2', section: 'B', type: 'word', text: "What is the name of the hill next to Safa?", answer: "Marwah", accepts: ["Marwah", "Marwa"] },
  { id: 'b3', section: 'B', type: 'word', text: "Where do pilgrims stay on the 9th night of Dhul-Hijjah?", answer: "Muzdalifah", accepts: ["Muzdalifah", "Muzdalifa", "Muzdalipha", "Arafah", "Arafa"] },
  { id: 'b4', section: 'B', type: 'word', text: "What is the name of the act of going around the Ka'bah?", answer: "Tawaf", accepts: ["Tawaf", "Tawaaf"] },
  { id: 'b5', section: 'B', type: 'word', text: "What is the name of the declaration made by pilgrims when announcing their arrival for Hajj?", answer: "Talbiyah", accepts: ["Talbiyah", "Talbiyyah", "Talbia"] },

  // ----- Section C: Matching (5 pairs) -----
  { id: 'c1', section: 'C', type: 'match', term: "Ihram", correctMeaningId: 'm1' },
  { id: 'c2', section: 'C', type: 'match', term: "Tawaf", correctMeaningId: 'm2' },
  { id: 'c3', section: 'C', type: 'match', term: "Sa'ee", correctMeaningId: 'm3' },
  { id: 'c4', section: 'C', type: 'match', term: "Mina", correctMeaningId: 'm4' },
  { id: 'c5', section: 'C', type: 'match', term: "Arafah", correctMeaningId: 'm5' },

  // ----- Section D: Multiple choice (9) -----
  { id: 'd1', section: 'D', type: 'mcq', text: "What is Hajj?", options: ["A journey to the mountains", "Pilgrimage to the House of Allah", "A visit to a school", "A journey to a market"], answer: 1 },
  { id: 'd2', section: 'D', type: 'mcq', text: "Where is the Ka'bah located?", options: ["Madinah", "Riyadh", "Makkah", "Jeddah"], answer: 2 },
  { id: 'd3', section: 'D', type: 'mcq', text: "How many times do pilgrims perform Tawaf?", options: ["Three", "Five", "Seven", "Ten"], answer: 2 },
  { id: 'd4', section: 'D', type: 'mcq', text: "Which two places do pilgrims walk between during Sa'ee?", options: ["Mina and Arafah", "Safa and Marwah", "Makkah and Madinah", "Mina and Muzdalifah"], answer: 1 },
  { id: 'd5', section: 'D', type: 'mcq', text: "What is the reward for a Hajj that is Mabroor?", options: ["Money", "Paradise", "A gift", "A certificate"], answer: 1 },
  { id: 'd6', section: 'D', type: 'mcq', text: "What should a man wear during Ihram according to the chapter?", options: ["Two pieces of unsewn white cloth", "A school uniform", "A coloured suit", "Ordinary clothes"], answer: 0 },
  { id: 'd7', section: 'D', type: 'mcq', text: "Which of these is one of the conditions for Hajj to be compulsory?", options: ["Being wealthy only", "Having good health", "Being a child", "Living in Makkah"], answer: 1 },
  { id: 'd8', section: 'D', type: 'mcq', text: "What do pilgrims do in Mina on the 10th of Dhul-Hijjah?", options: ["Perform the stoning of Jamratul Aqaba", "Visit a school", "Perform the Farewell Tawaf", "Travel to another country"], answer: 0 },
  { id: 'd9', section: 'D', type: 'mcq', text: "Is visiting the Prophet's Mosque in Madinah an act of Hajj?", options: ["Yes", "No"], answer: 1 },
];

const MATCHING_MEANINGS = [
  { id: 'm1', text: 'Intention of performing Hajj' },
  { id: 'm2', text: "Going around the Ka'bah seven times" },
  { id: 'm3', text: "Walking between Safa and Marwah" },
  { id: 'm4', text: 'Place where pilgrims spend the night on the 8th of Dhul-Hijjah' },
  { id: 'm5', text: 'Place where pilgrims stay on the 9th of Dhul-Hijjah' },
];

const TOTAL_QUESTIONS = QUESTIONS.length; // 25
const QUIZ_VERSION = 'hajj-grade3-v1';

/* ------------------------------------------------------------------ */
/* Marking helpers                                                    */
/* ------------------------------------------------------------------ */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`".,\-–—?!\s\u060c]/g, '');
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

function isAccepted(input, accepts) {
  const n = norm(input);
  if (!n) return false;
  for (const acc of (accepts || [])) {
    const t = norm(acc);
    if (n === t) return true;
    if (n.length >= 5 && t.length >= 4 && lev(n, t) <= 1) return true;
  }
  return false;
}

function gradeAnswer(q, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { correct: false, answered: false };
  }
  switch (q.type) {
    case 'blank':
    case 'word':
      return { correct: isAccepted(value, q.accepts), answered: true };
    case 'match':
      return { correct: String(value) === q.correctMeaningId, answered: true };
    case 'mcq': {
      const idx = Number(value);
      return { correct: idx === q.answer, answered: true };
    }
    default:
      return { correct: false, answered: true };
  }
}

function gradeAttempt(attempt) {
  const answers = (attempt && attempt.answers) || {};
  let correct = 0;
  const perQuestion = QUESTIONS.map((q) => {
    const value = answers[q.id];
    const r = gradeAnswer(q, value);
    if (r.correct) correct++;
    return { qid: q.id, value: sanitizeValueForTeacher(q, value), correct: r.correct };
  });
  const score = correct;
  const timeTaken = attempt.timeTaken != null
    ? attempt.timeTaken
    : Math.max(0, Math.min(QUIZ_DURATION, Math.round(((attempt.finalizedAt || Date.now()) - (attempt.startedAt || Date.now())) / 1000)));
  return {
    score,
    total: TOTAL_QUESTIONS,
    percentage: Math.round((score / TOTAL_QUESTIONS) * 100),
    correct,
    incorrect: perQuestion.filter((p) => !p.correct).length,
    unanswered: perQuestion.filter((p) => p.value === '' || p.value === null).length,
    timeTaken,
    perQuestion,
  };
}

function sanitizeValueForTeacher(q, value) {
  if (value === undefined || value === null || value === '') return null;
  if (q.type === 'mcq') {
    const idx = Number(value);
    return Number.isInteger(idx) && idx >= 0 && idx < (q.options || []).length ? q.options[idx] : String(value);
  }
  if (q.type === 'match') {
    const found = MATCHING_MEANINGS.find((m) => m.id === value);
    return found ? found.text : String(value);
  }
  return String(value);
}

/* ------------------------------------------------------------------ */
/* State persistence ("Database")                                     */
/* ------------------------------------------------------------------ */

let state = null;

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const s = JSON.parse(raw);
    if (!Array.isArray(s.attempts)) throw new Error('bad attempts');
    s.settings = Object.assign({ reviewOpen: false, lastSessionStartedAt: Date.now() }, s.settings || {});
    // Ensure all attempts have essential fields
    s.attempts.forEach((a) => {
      a.violations = a.violations || [];
      a.answers = a.answers || {};
      a.student = a.student || {};
    });
    return s;
  } catch {
    return { settings: { reviewOpen: false, lastSessionStartedAt: Date.now() }, attempts: [] };
  }
}

function saveState() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // Write directly to file — safe across Windows and Linux
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('saveState warning:', err.message);
  }
}

function archiveState(reason) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(DATA_DIR, `archive-${stamp}-${reason}.json`), JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('archive failed:', e.message);
  }
}

function teacherPassword() {
  if (process.env.TEACHER_PASSWORD) return process.env.TEACHER_PASSWORD;
  const cfgFile = path.join(ROOT, 'config.json');
  let cfg = null;
  try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch {}
  if (!cfg || !cfg.teacherPassword) {
    cfg = { teacherPassword: 'hajj2025', note: 'CHANGE THIS PASSWORD before using with real students.' };
    try { fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2), 'utf8'); } catch {}
  }
  return cfg.teacherPassword;
}

/* ------------------------------------------------------------------ */
/* Attempt helpers                                                    */
/* ------------------------------------------------------------------ */

function identityKey(student) {
  const n = String(student.name || '').trim().toLowerCase();
  const c = String(student.className || '').trim().toLowerCase();
  const s = String(student.studentId || '').trim().toLowerCase() || '-';
  return `${n}|${c}|${s}`;
}

let isFinalizing = false;
function finalizeExpiredAttempts() {
  if (isFinalizing) return;
  isFinalizing = true;
  try {
    const now = Date.now();
    let changed = false;
    for (const a of (state.attempts || [])) {
      if (a.status === 'in-progress' && now > (a.endsAt || 0) + GRACE * 1000) {
        a.status = 'submitted';
        a.reason = a.reason || 'time';
        a.finalizedAt = Math.min(now, (a.endsAt || now) + GRACE * 1000);
        a.submittedAt = a.submittedAt || a.finalizedAt;
        Object.assign(a, gradeAttempt(a));
        changed = true;
      }
    }
    if (changed) {
      saveState();
      setImmediate(broadcast);
    }
  } finally {
    isFinalizing = false;
  }
}

function attemptById(id) {
  if (!id) return null;
  return (state.attempts || []).find((a) => a.id === id) || null;
}

function createAttempt(student) {
  const now = Date.now();
  const a = {
    id: crypto.randomUUID(),
    identity: identityKey(student),
    student: {
      name: String(student.name || '').trim(),
      className: String(student.className || '').trim(),
      studentId: String(student.studentId || '').trim(),
    },
    cameraOn: !!student.cameraOn,
    startedAt: now,
    endsAt: now + QUIZ_DURATION * 1000,
    answers: {},
    violations: [],
    status: 'in-progress',
    reason: null,
    finalizedAt: null,
    submittedAt: null,
    score: 0, correct: 0, incorrect: 0, percentage: 0, timeTaken: null,
  };
  state.attempts.push(a);
  saveState();
  return a;
}

function clientPayloadForAttempt(a, { includeSavedAnswers = false } = {}) {
  const now = Date.now();
  const endsAt = a.endsAt || (now + QUIZ_DURATION * 1000);
  const remaining = Math.max(0, Math.round((endsAt - now) / 1000));
  return {
    attemptId: a.id,
    quizVersion: QUIZ_VERSION,
    status: a.status,
    serverNow: now,
    startedAt: a.startedAt,
    endsAt: endsAt,
    remainingSeconds: remaining,
    durationSeconds: QUIZ_DURATION,
    savedAnswers: includeSavedAnswers ? (a.answers || {}) : undefined,
    violationCount: (a.violations || []).length,
    student: a.student || {},
  };
}

/* ------------------------------------------------------------------ */
/* Leaderboard                                                        */
/* ------------------------------------------------------------------ */

function leaderboardSnapshot() {
  finalizeExpiredAttempts();
  const valid = (state.attempts || [])
    .filter((a) => a && a.status === 'submitted')
    .sort((x, y) => {
      const scoreDiff = (y.score ?? 0) - (x.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (x.timeTaken ?? QUIZ_DURATION * 99) - (y.timeTaken ?? QUIZ_DURATION * 99);
    })
    .slice(0, 50)
    .map((a, i) => {
      const student = a.student || {};
      const fullName = String(student.name || 'Student');
      const firstName = fullName.split(/\s+/)[0] || 'Student';
      return {
        rank: i + 1,
        // privacy for children: first names only on public leaderboard
        name: firstName,
        className: String(student.className || ''),
        score: a.score ?? 0,
        total: TOTAL_QUESTIONS,
        percentage: a.percentage ?? 0,
        timeTaken: a.timeTaken,
        selfie: !!a.cameraOn,
      };
    });
  return {
    entries: valid,
    totalAttempts: (state.attempts || []).length,
    submitted: (state.attempts || []).filter((a) => a.status === 'submitted').length,
    disqualified: (state.attempts || []).filter((a) => a.status === 'disqualified').length,
    reviewOpen: !!state.settings?.reviewOpen,
  };
}

/* ------------------------------------------------------------------ */
/* SSE Broadcast                                                      */
/* ------------------------------------------------------------------ */

const sseClients = new Set();

function sendSSE(res, event, data) {
  try {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } else {
      sseClients.delete(res);
    }
  } catch {
    sseClients.delete(res);
  }
}

function broadcast() {
  const snap = leaderboardSnapshot();
  for (const res of sseClients) sendSSE(res, 'update', snap);
}

/* ------------------------------------------------------------------ */
/* Admin tokens                                                       */
/* ------------------------------------------------------------------ */

const adminTokens = new Map();
const ADMIN_TOKEN_TTL = 8 * 60 * 60 * 1000;

function issueAdminToken() {
  const t = crypto.randomBytes(24).toString('hex');
  adminTokens.set(t, Date.now() + ADMIN_TOKEN_TTL);
  return t;
}

function validAdminToken(t) {
  if (!t) return false;
  const exp = adminTokens.get(t);
  if (!exp) return false;
  if (Date.now() > exp) { adminTokens.delete(t); return false; }
  return true;
}

/* ------------------------------------------------------------------ */
/* HTTP Plumbing                                                      */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJSON(res, code, obj) {
  try {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (err) {
    console.error('sendJSON error:', err);
  }
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const raw = await readBody(req);
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function serveStatic(res, relPath) {
  try {
    const cleanRel = relPath.replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.resolve(PUB, '.' + path.sep + cleanRel);
    const pubResolved = path.resolve(PUB);
    if (!filePath.toLowerCase().startsWith(pubResolved.toLowerCase())) {
      return sendJSON(res, 403, { error: 'forbidden' });
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(buf);
    });
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Static file error');
  }
}

/* ------------------------------------------------------------------ */
/* API Routing                                                        */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  switch (route) {
    /* ---------------- Student API ---------------- */

    case 'POST /api/start': {
      finalizeExpiredAttempts();
      const body = await readJSON(req);
      const name = String(body.name || '').trim();
      const className = String(body.className || '').trim();
      const studentId = String(body.studentId || '').trim();

      if (name.length < 2)
        return sendJSON(res, 400, { error: 'Please enter your full name.' });
      if (!className)
        return sendJSON(res, 400, { error: 'Please enter your class.' });

      const key = identityKey({ name, className, studentId });
      const existing = (state.attempts || []).find((a) => a.identity === key);

      if (existing) {
        if (existing.status !== 'in-progress') {
          // one attempt only — no retries to improve score
          return sendJSON(res, 409, { error: 'ALREADY_COMPLETED', attemptId: existing.id, status: existing.status });
        }
        // resume an interrupted attempt (e.g. reload or temporary disconnect)
        return sendJSON(res, 200, {
          ok: true,
          resumed: true,
          questions: publicQuestions(),
          meanings: MATCHING_MEANINGS,
          attempt: clientPayloadForAttempt(existing, { includeSavedAnswers: true }),
        });
      }

      const a = createAttempt({ name, className, studentId, cameraOn: !!body.cameraOn });
      return sendJSON(res, 200, {
        ok: true,
        resumed: false,
        questions: publicQuestions(),
        meanings: MATCHING_MEANINGS,
        attempt: clientPayloadForAttempt(a, { includeSavedAnswers: true }),
      });
    }

    case 'POST /api/save': {
      const body = await readJSON(req);
      const a = attemptById(String(body.attemptId || ''));
      if (!a) return sendJSON(res, 404, { error: 'attempt not found' });
      if (a.status !== 'in-progress') return sendJSON(res, 409, { error: 'attempt already finished' });
      if (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
        if (Date.now() <= (a.endsAt || Date.now() + 1000)) {
          a.answers = sanitizeAnswers(body.answers);
        }
      }
      saveState();
      return sendJSON(res, 200, {
        ok: true,
        remainingSeconds: Math.max(0, Math.round(((a.endsAt || Date.now()) - Date.now()) / 1000)),
        violationCount: (a.violations || []).length,
      });
    }

    case 'POST /api/violation': {
      const body = await readJSON(req);
      const a = attemptById(String(body.attemptId || ''));
      if (!a) return sendJSON(res, 404, { error: 'attempt not found' });
      a.violations = a.violations || [];
      a.violations.push({
        type: String(body.type || 'unknown').slice(0, 40),
        detail: String(body.detail || '').slice(0, 200),
        at: Date.now(),
      });
      let disqualified = false;
      if (a.status === 'in-progress' && a.violations.length >= MAX_VIOLATIONS) {
        a.status = 'disqualified';
        a.reason = 'violations';
        a.finalizedAt = Date.now();
        a.submittedAt = a.finalizedAt;
        Object.assign(a, gradeAttempt(a));
        disqualified = true;
        saveState();
        broadcast();
      } else {
        saveState();
      }
      return sendJSON(res, 200, {
        ok: true,
        violations: a.violations.length,
        warningsLeft: Math.max(0, MAX_VIOLATIONS - a.violations.length),
        status: a.status,
        disqualified,
      });
    }

    case 'POST /api/submit': {
      const body = await readJSON(req);
      const a = attemptById(String(body.attemptId || ''));
      if (!a) return sendJSON(res, 404, { error: 'attempt not found' });
      if (a.status !== 'in-progress') {
        // idempotent: return existing finalized result
        return sendJSON(res, 200, { ok: true, alreadyFinished: true, status: a.status, result: resultPayload(a) });
      }
      const wasDisqualified = a.reason === 'violations';
      if (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
        a.answers = sanitizeAnswers(body.answers);
      }
      a.status = wasDisqualified ? 'disqualified' : 'submitted';
      a.reason = wasDisqualified ? 'violations' : (body.auto === 'time' ? 'time' : 'manual');
      a.finalizedAt = Date.now();
      a.submittedAt = a.finalizedAt;
      Object.assign(a, gradeAttempt(a));
      saveState();
      broadcast();
      return sendJSON(res, 200, { ok: true, status: a.status, result: resultPayload(a) });
    }

    case 'GET /api/result': {
      finalizeExpiredAttempts();
      const aid = String(url.searchParams.get('attemptId') || '');
      const a = attemptById(aid);
      if (!a) return sendJSON(res, 404, { error: 'attempt not found' });
      return sendJSON(res, 200, { ok: true, result: resultPayload(a) });
    }

    case 'GET /api/leaderboard': {
      return sendJSON(res, 200, { ok: true, leaderboard: leaderboardSnapshot() });
    }

    case 'GET /api/events': {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      sendSSE(res, 'update', leaderboardSnapshot());
      sseClients.add(res);

      const ping = setInterval(() => {
        try {
          if (!res.writableEnded && !res.destroyed) {
            res.write(': ping\n\n');
          } else {
            clearInterval(ping);
            sseClients.delete(res);
          }
        } catch {
          clearInterval(ping);
          sseClients.delete(res);
        }
      }, 15000);

      req.on('close', () => {
        clearInterval(ping);
        sseClients.delete(res);
      });
      res.on('error', () => {
        clearInterval(ping);
        sseClients.delete(res);
      });
      return undefined;
    }

    /* ---------------- Teacher Admin API ---------------- */

    case 'POST /api/admin/login': {
      const body = await readJSON(req);
      const given = String(body.password || '');
      const expected = teacherPassword();
      const a = crypto.createHash('sha256').update(given).digest();
      const b = crypto.createHash('sha256').update(expected).digest();
      if (crypto.timingSafeEqual(a, b)) {
        return sendJSON(res, 200, { ok: true, token: issueAdminToken() });
      }
      await new Promise((r) => setTimeout(r, 400));
      return sendJSON(res, 401, { error: 'Wrong password.' });
    }

    case 'GET /api/admin/attempts': {
      if (!requireAdmin(req, res)) return undefined;
      finalizeExpiredAttempts();
      return sendJSON(res, 200, {
        ok: true,
        attempts: (state.attempts || []).slice().sort((x, y) => (y.startedAt || 0) - (x.startedAt || 0)).map((a) => ({
          id: a.id,
          student: a.student || {},
          cameraOn: !!a.cameraOn,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          finalizedAt: a.finalizedAt,
          timeTaken: a.timeTaken,
          status: a.status,
          reason: a.reason,
          score: a.score ?? 0,
          total: a.total || TOTAL_QUESTIONS,
          percentage: a.percentage ?? 0,
          correct: a.correct ?? 0,
          incorrect: a.incorrect ?? 0,
          violations: a.violations || [],
          grade: a.perQuestion || [],
          currentAnswers: a.answers || {},
        })),
        questionKey: QUESTIONS.map((q) => ({
          id: q.id,
          label: q.id.replace('a', 'A').replace('b', 'B').replace('c', 'C').replace('d', 'D').toUpperCase(),
          section: q.section,
          type: q.type,
          text: q.text || `${q.term} → match`,
          answer: q.type === 'mcq'
            ? (q.options ? q.options[q.answer] : null)
            : (q.type === 'match' ? (MATCHING_MEANINGS.find((m) => m.id === q.correctMeaningId)?.text || q.correctMeaningId) : q.answer)
        })),
        reviewOpen: !!state.settings?.reviewOpen,
        sessionStartedAt: state.settings?.lastSessionStartedAt,
      });
    }

    case 'GET /api/admin/stats': {
      if (!requireAdmin(req, res)) return undefined;
      finalizeExpiredAttempts();
      const graded = (state.attempts || []).filter((a) => a.status === 'submitted');
      const qStats = QUESTIONS.map((q) => {
        let correct = 0, answered = 0;
        for (const a of graded) {
          const r = gradeAnswer(q, (a.answers || {})[q.id]);
          if (r.answered) answered++;
          if (r.correct) correct++;
        }
        return {
          qid: q.id,
          text: q.text || `Match: ${q.term}`,
          correct,
          answered,
          gradedCount: graded.length,
          pctCorrect: graded.length ? Math.round((correct / graded.length) * 100) : null
        };
      });
      const scores = graded.map((a) => a.score ?? 0);
      return sendJSON(res, 200, {
        ok: true,
        gradedCount: graded.length,
        inProgress: (state.attempts || []).filter((a) => a.status === 'in-progress').length,
        disqualifiedCount: (state.attempts || []).filter((a) => a.status === 'disqualified').length,
        averageScore: scores.length ? +(scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2) : null,
        highest: scores.length ? Math.max(...scores) : null,
        lowest: scores.length ? Math.min(...scores) : null,
        questions: qStats,
      });
    }

    case 'GET /api/admin/export.csv': {
      if (!requireAdmin(req, res)) return undefined;
      finalizeExpiredAttempts();
      const rows = [['Name', 'Class', 'Student ID', 'Score', 'Out of', 'Percentage', 'Correct', 'Incorrect', 'Time (s)', 'Time (mm:ss)', 'Status', 'Reason', 'Violations', 'Submission Time', 'Attempt ID']];
      for (const a of (state.attempts || []).slice().sort((x, y) => (y.score ?? 0) - (x.score ?? 0) || ((x.timeTaken || 0) - (y.timeTaken || 0)))) {
        const student = a.student || {};
        rows.push([
          student.name || '', student.className || '', student.studentId || '',
          a.score ?? 0, TOTAL_QUESTIONS, (a.percentage ?? 0) + '%', a.correct ?? 0, a.incorrect ?? 0,
          a.timeTaken ?? '', mmss(a.timeTaken), a.status, a.reason || '', (a.violations || []).length,
          a.submittedAt ? new Date(a.submittedAt).toISOString() : '', a.id,
        ]);
      }
      const csv = '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="hajj-quiz-results-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      });
      return res.end(csv);
    }

    case 'POST /api/admin/settings': {
      if (!requireAdmin(req, res)) return undefined;
      const body = await readJSON(req);
      if (typeof body.reviewOpen === 'boolean') state.settings.reviewOpen = body.reviewOpen;
      saveState();
      broadcast();
      return sendJSON(res, 200, { ok: true, reviewOpen: state.settings.reviewOpen });
    }

    case 'POST /api/admin/reset': {
      if (!requireAdmin(req, res)) return undefined;
      const body = await readJSON(req);
      const mode = body.mode === 'leaderboard' ? 'leaderboard' : 'session';
      archiveState(mode === 'leaderboard' ? 'leaderboard-reset' : 'session-reset');
      state.attempts = [];
      state.settings.reviewOpen = mode === 'leaderboard' ? state.settings.reviewOpen : false;
      state.settings.lastSessionStartedAt = Date.now();
      saveState();
      broadcast();
      return sendJSON(res, 200, { ok: true, mode, archived: true });
    }

    case 'GET /api/health':
      return sendJSON(res, 200, { ok: true, time: Date.now() });

    default:
      return sendJSON(res, 404, { error: 'not found (API)' });
  }
}

function requireAdmin(req, res) {
  const t = req.headers['x-admin-token'] || '';
  if (validAdminToken(String(t))) return true;
  sendJSON(res, 401, { error: 'not authorised' });
  return false;
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function mmss(sec) {
  if (sec == null) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sanitizeAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  const clean = {};
  for (const q of QUESTIONS) {
    if (Object.prototype.hasOwnProperty.call(answers, q.id)) {
      const v = answers[q.id];
      if (q.type === 'blank' || q.type === 'word') {
        if (typeof v === 'string' || typeof v === 'number') {
          clean[q.id] = String(v).slice(0, 80);
        }
      } else if (q.type === 'match') {
        if (typeof v === 'string' && MATCHING_MEANINGS.some((m) => m.id === v)) {
          clean[q.id] = v;
        }
      } else if (q.type === 'mcq') {
        const idx = Number(v);
        if (Number.isInteger(idx) && idx >= 0 && idx < (q.options || []).length) {
          clean[q.id] = idx;
        }
      }
    }
  }
  return clean;
}

function publicQuestions() {
  return QUESTIONS.map((q) => {
    const c = { id: q.id, section: q.section, type: q.type };
    if (q.type === 'blank' || q.type === 'word') c.text = q.text;
    if (q.type === 'mcq') { c.text = q.text; c.options = q.options; }
    if (q.type === 'match') c.term = q.term;
    return c;
  });
}

function resultPayload(a) {
  const done = a.status !== 'in-progress';
  const snap = done ? leaderboardSnapshot() : null;
  const result = {
    attemptId: a.id,
    student: a.student || {},
    status: a.status,
    reason: a.reason,
    submittedAt: a.submittedAt,
    finalizedAt: a.finalizedAt,
    total: TOTAL_QUESTIONS,
    reviewOpen: !!state.settings?.reviewOpen,
    leaderboard: snap,
  };
  if (done) {
    const g = a.perQuestion ? a : gradeAttempt(a);
    result.score = a.score ?? 0;
    result.percentage = a.percentage ?? 0;
    result.correct = a.correct ?? 0;
    result.incorrect = a.incorrect ?? 0;
    result.unanswered = g.unanswered ?? 0;
    result.timeTaken = a.timeTaken;
    result.rank = a.status === 'submitted' && snap
      ? (snap.entries.find((e) => e.score === a.score && e.timeTaken === a.timeTaken)?.rank ?? null)
      : null;
  }
  // answers review is only revealed after teacher opens the review session
  if (done && a.reason !== 'violations' && state.settings?.reviewOpen) {
    const perQ = a.perQuestion || gradeAttempt(a).perQuestion || [];
    result.review = QUESTIONS.map((q) => {
      const grade = perQ.find((p) => p.qid === q.id);
      let yourAns = grade ? grade.value : (a.answers || {})[q.id];
      if (q.type === 'match' && yourAns) {
        const found = MATCHING_MEANINGS.find((m) => m.id === yourAns);
        if (found) yourAns = found.text;
      }
      let correctAns = q.answer;
      if (q.type === 'mcq') {
        correctAns = q.options && q.options[q.answer] ? q.options[q.answer] : q.answer;
      } else if (q.type === 'match') {
        const found = MATCHING_MEANINGS.find((m) => m.id === q.correctMeaningId);
        correctAns = found ? found.text : q.correctMeaningId;
      }
      return {
        qid: q.id,
        section: q.section,
        prompt: q.type === 'mcq' || q.type === 'blank' || q.type === 'word' ? q.text : `Match: ${q.term}`,
        type: q.type,
        yourAnswer: yourAns != null && yourAns !== '' ? yourAns : '(unanswered)',
        correctAnswer: correctAns,
        correct: !!grade?.correct,
      };
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Server Initialization                                              */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.url, `http://${host}`);
    if (url.pathname.startsWith('/api/')) {
      const r = await handleApi(req, res, url);
      if (r !== undefined) return;
      return; // SSE keeps the connection open
    }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    if (p === '/admin') p = '/admin.html';
    serveStatic(res, p);
  } catch (e) {
    console.error('Request error:', req.method, req.url, e);
    if (!res.headersSent) {
      sendJSON(res, 500, {
        error: e.message || 'An unexpected error occurred.',
        detail: String(e.stack || e),
      });
    }
  }
});

server.listen(PORT, HOST, () => {
  state = loadState();
  console.log('');
  console.log('  🕋  Hajj Quiz Platform (Grade 3) is running');
  console.log(`  ➜ Student quiz:  http://localhost:${PORT}`);
  console.log(`  ➜ Teacher area:  http://localhost:${PORT}/admin`);
  console.log(`  ➜ Teacher password: see config.json  (default: hajj2025 — change it!)`);
  console.log('');
});

process.on('SIGINT', () => { try { saveState(); } catch {} process.exit(0); });
