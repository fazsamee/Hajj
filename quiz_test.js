'use strict';

const http = require('http');

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${path}`, {
      method: 'GET',
      headers,
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Grade 3 Hajj Quiz Platform Verification Tests...\n');

  const runId = Math.floor(Math.random() * 90000 + 10000);
  const name1 = `Fatima${runId}`;
  const name2 = `Zayd${runId}`;
  const name3 = `Maryam${runId}`;

  // 1. Health check
  const health = await get('/api/health');
  if (health.status !== 200 || !health.data.ok) throw new Error('Health check failed');
  console.log('✅ 1. Server health check passed.');

  // 2. Start quiz for Student 1
  const start1 = await post('/api/start', {
    name: name1,
    className: 'Grade 3A',
    studentId: `G3-${runId}-1`,
    cameraOn: true,
  });
  if (start1.status !== 200 || !start1.data.ok) throw new Error('Start quiz 1 failed');
  const questions = start1.data.questions;
  if (questions.length !== 25) throw new Error(`Expected 25 questions, got ${questions.length}`);
  console.log(`✅ 2. Started quiz attempt for ${name1}. Received exactly ${questions.length} questions.`);

  // Verify questions do not leak raw answer keys
  for (const q of questions) {
    if (q.answer !== undefined || q.accepts !== undefined || q.correctMeaningId !== undefined) {
      throw new Error(`Security breach: Answer key leaked in question ${q.id}!`);
    }
  }
  console.log('✅ 3. Verified zero answer key leakage in client payload.');

  const attemptId1 = start1.data.attempt.attemptId;

  // 3. Perfect answers for all 25 questions
  const perfectAnswers = {
    // Section A: Fill in blanks (6)
    a1: "Ka'bah",
    a2: "fifth",
    a3: "7",
    a4: "Marwah",
    a5: "Mina",
    a6: "9th",
    // Section B: One-word answers (5)
    b1: "Ihram",
    b2: "Marwah",
    b3: "Muzdalifah",
    b4: "Tawaf",
    b5: "Talbiyah",
    // Section C: Matching (5 pairs)
    c1: "m1", // Ihram -> Intention of performing Hajj
    c2: "m2", // Tawaf -> Going around Ka'bah seven times
    c3: "m3", // Sa'ee -> Walking between Safa and Marwah
    c4: "m4", // Mina -> Where pilgrims spend night on 8th Dhul-Hijjah
    c5: "m5", // Arafah -> Where pilgrims stay on 9th Dhul-Hijjah
    // Section D: MCQ (9 questions)
    d1: 1, // Pilgrimage to House of Allah
    d2: 2, // Makkah
    d3: 2, // Seven
    d4: 1, // Safa and Marwah
    d5: 1, // Paradise
    d6: 0, // Two pieces of unsewn white cloth
    d7: 1, // Having good health
    d8: 0, // Stoning Jamratul Aqaba
    d9: 1, // No
  };

  // Auto-save test
  const saveRes = await post('/api/save', { attemptId: attemptId1, answers: perfectAnswers });
  if (saveRes.status !== 200 || !saveRes.data.ok) throw new Error('Auto-save failed');
  console.log('✅ 4. Auto-save tested and verified.');

  // Submit test
  const sub1 = await post('/api/submit', { attemptId: attemptId1, answers: perfectAnswers });
  if (sub1.status !== 200 || !sub1.data.ok) throw new Error('Submit 1 failed');
  const res1 = sub1.data.result;
  if (res1.score !== 25 || res1.percentage !== 100 || res1.correct !== 25) {
    throw new Error(`Expected 25/25, got score=${res1.score}, correct=${res1.correct}`);
  }
  console.log(`✅ 5. Submitted perfect quiz: Score ${res1.score}/${res1.total} (${res1.percentage}%) - Champion!`);

  // 4. Duplicate submission check (One attempt only)
  const startDup = await post('/api/start', {
    name: name1,
    className: 'Grade 3A',
    studentId: `G3-${runId}-1`,
  });
  if (startDup.status !== 409) throw new Error('Expected 409 Conflict for duplicate attempt');
  console.log('✅ 6. Verified anti-retake protection (duplicate attempt rejected with 409).');

  // 5. Anti-cheat violation & disqualification test for Student 2
  const start2 = await post('/api/start', {
    name: name2,
    className: 'Grade 3A',
    studentId: `G3-${runId}-2`,
  });
  const attemptId2 = start2.data.attempt.attemptId;

  // Violation 1
  const v1 = await post('/api/violation', { attemptId: attemptId2, type: 'tab-hidden', detail: 'Tab switch 1' });
  if (v1.data.warningsLeft !== 2) throw new Error('Expected 2 warnings left after strike 1');

  // Violation 2
  const v2 = await post('/api/violation', { attemptId: attemptId2, type: 'window-blur', detail: 'Window blur 2' });
  if (v2.data.warningsLeft !== 1) throw new Error('Expected 1 warning left after strike 2');

  // Violation 3 -> Disqualification
  const v3 = await post('/api/violation', { attemptId: attemptId2, type: 'tab-hidden', detail: 'Tab switch 3' });
  if (!v3.data.disqualified || v3.data.status !== 'disqualified') {
    throw new Error('Expected disqualification on 3rd violation');
  }
  console.log('✅ 7. Anti-cheating system verified: Warn 1 -> Warn 2 -> Auto-Disqualify on strike 3.');

  // 6. Student 3 (Maryam) - partial score (22/25)
  const start3 = await post('/api/start', {
    name: name3,
    className: 'Grade 3B',
    studentId: `G3-${runId}-3`,
  });
  const attemptId3 = start3.data.attempt.attemptId;
  const maryamAnswers = { ...perfectAnswers, a2: "sixth", d1: 0, d9: 0 }; // 3 wrong -> 22/25
  const sub3 = await post('/api/submit', { attemptId: attemptId3, answers: maryamAnswers });
  if (sub3.data.result.score !== 22) throw new Error(`Expected score 22, got ${sub3.data.result.score}`);
  console.log(`✅ 8. Submitted partial quiz for ${name3}: Score ${sub3.data.result.score}/25.`);

  // 7. Verify Leaderboard
  const lbRes = await get('/api/leaderboard');
  const lb = lbRes.data.leaderboard;
  if (!lb || !lb.entries || lb.entries.length < 2) throw new Error('Leaderboard missing entries');
  const entry1 = lb.entries.find(e => e.name === name1);
  if (!entry1 || entry1.score !== 25) {
    throw new Error(`Expected ${name1} on leaderboard with 25 points`);
  }
  const entry3 = lb.entries.find(e => e.name === name3);
  if (!entry3 || entry3.score !== 22) {
    throw new Error(`Expected ${name3} on leaderboard with 22 points`);
  }
  // Disqualified student should NOT be on competitive leaderboard
  const disqualifiedInLb = lb.entries.some(e => e.name === name2);
  if (disqualifiedInLb) throw new Error('Disqualified attempt appeared on competitive leaderboard!');
  console.log(`✅ 9. Live Leaderboard verified: ${name1} (25/25), ${name3} (22/25). Disqualified entries excluded.`);

  // 8. Teacher Admin Login & Features
  const loginRes = await post('/api/admin/login', { password: 'wrongpassword' });
  if (loginRes.status !== 401) throw new Error('Expected 401 for wrong admin password');

  const loginOk = await post('/api/admin/login', { password: 'hajj2025' });
  if (loginOk.status !== 200 || !loginOk.data.token) throw new Error('Admin login failed');
  const adminToken = loginOk.data.token;
  console.log('✅ 10. Teacher admin authentication verified.');

  // Admin attempts
  const adminAtt = await get('/api/admin/attempts', { 'x-admin-token': adminToken });
  if (adminAtt.data.attempts.length < 3) throw new Error('Expected at least 3 attempts in admin view');
  console.log(`✅ 11. Teacher admin attempts list verified (${adminAtt.data.attempts.length} attempts tracked).`);

  // Admin stats
  const adminStats = await get('/api/admin/stats', { 'x-admin-token': adminToken });
  if (!adminStats.data.questions || adminStats.data.questions.length !== 25) {
    throw new Error('Expected 25 questions in difficulty analytics');
  }
  console.log('✅ 12. Question difficulty analytics verified for all 25 questions.');

  // Admin CSV export
  const csvRes = await get('/api/admin/export.csv', { 'x-admin-token': adminToken });
  if (csvRes.status !== 200 || !csvRes.raw.includes('Fatima Ali')) {
    throw new Error('CSV export failed or missing student data');
  }
  console.log('✅ 13. CSV results export verified.');

  // Admin toggle review mode
  const toggleRes = await post('/api/admin/settings', { reviewOpen: true }, { 'x-admin-token': adminToken });
  if (!toggleRes.data.reviewOpen) throw new Error('Review open toggle failed');

  // Verify Fatima can now see the answers review
  const fatimaRes = await get(`/api/result?attemptId=${attemptId1}`);
  if (!fatimaRes.data.result.review || fatimaRes.data.result.review.length !== 25) {
    throw new Error('Expected 25 review items after teacher unlocked review mode');
  }
  console.log('✅ 14. Answer review unlocked by teacher and verified in student results.');

  console.log('\n🎉 ALL 14 AUTOMATED END-TO-END TESTS PASSED SUCCESSFULLY! 🌟\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err.message);
  process.exit(1);
});

