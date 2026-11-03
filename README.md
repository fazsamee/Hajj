# 🕋 Grade 3 Islamic Studies Quiz Platform: Hajj – The Pilgrimage

A modern, interactive, and child-friendly online examination platform built specifically for Grade 3 students (ages 8–9) on **Chapter 8: Hajj – The Pilgrimage**.

---

## 🌟 Key Features

### 1. 25 Curated Questions (Based Exclusively on Chapter 8)
- **Section A: Fill in the Blanks (6 Questions)**
  1. Hajj is the pilgrimage to the **Ka'bah / House of Allah** in Makkah.
  2. Hajj is the **fifth / 5th** pillar of Islam.
  3. Tawaf is going around the Ka'bah **seven / 7** times.
  4. Sa'ee is walking between Safa and **Marwah**.
  5. Pilgrims spend the night at **Mina** on the 8th of Dhul-Hijjah.
  6. The stay at Arafah takes place on the **9th / ninth** of Dhul-Hijjah.
- **Section B: One-Word Answers (5 Questions)**
  1. Name of special clothing worn during Hajj: **Ihram**
  2. Name of the hill next to Safa: **Marwah**
  3. Where pilgrims stay on the 9th night of Dhul-Hijjah: **Muzdalifah**
  4. Act of going around the Ka'bah: **Tawaf**
  5. Declaration made when announcing arrival: **Talbiyah**
- **Section C: Interactive Matching Activity (5 Questions)**
  - Touch/click to connect or drag and drop:
    - *Ihram* ➔ Intention of performing Hajj
    - *Tawaf* ➔ Going around the Ka'bah seven times
    - *Sa'ee* ➔ Walking between Safa and Marwah
    - *Mina* ➔ Place where pilgrims spend the night on the 8th of Dhul-Hijjah
    - *Arafah* ➔ Place where pilgrims stay on the 9th of Dhul-Hijjah
- **Section D: Multiple Choice (9 Questions)**
  - Age-appropriate questions covering conditions of Hajj, Mabroor reward (Paradise), Ihram garments, Jamratul Aqaba stoning, and the visit to Madinah.

---

### 2. Child-Centric Game Design (Grade 3 Suitable)
- **Palette**: Royal purple primary, white background, soft emerald green and warm gold accents.
- **Islamic Art**: Animated Ka'bah vector art, subtle star geometric background, curved cards, large readable fonts.
- **Web Audio Effects**: Gentle synthesizer chimes, victory fanfare, warning tones, and sound mute toggle.
- **Celebration Confetti**: Dynamic particle celebration for scores $\ge 15$.
- **Score Dial & Encouraging Badges**:
  - `23–25`: 🏆 Excellent! Hajj Champion!
  - `19–22`: ⭐ Amazing Work!
  - `15–18`: 📚 Good Job! Keep Learning!
  - `10–14`: 🌱 Keep Practising!
  - `0–9`: ❤️ Don't Give Up! Try Learning Again!

---

### 3. Strict 10-Minute Countdown Timer
- Synchronized server-authoritative timer (600 seconds).
- Visual color transitions:
  - Green (Normal)
  - Amber pulse at **2 minutes remaining** (with audio warning chime).
  - Red pulse at **30 seconds remaining** (with urgent alert toast).
- Automatic final submission at `0:00`.
- Background auto-save protects answers against accidental refreshes.

---

### 4. Anti-Cheating & Exam Security Controls
1. **Fullscreen Enforcement**: Requests fullscreen upon quiz commencement.
2. **Tab & Window Detection**: Listens to `visibilitychange`, `blur`, `mouseleave` to detect tab switching or opening other windows.
3. **Three-Strike Policy**:
   - **Strike 1**: Gentle warning popup informing student to remain inside the quiz window (2 warnings remaining).
   - **Strike 2**: Urgent final warning popup (1 warning remaining).
   - **Strike 3**: Automatic quiz submission and disqualification.
4. **Context & Key Interception**: Disables right-click and keyboard shortcuts (`Ctrl+C`, `Ctrl+V`, `Ctrl+U`, `F12`).
5. **No Answer Leaks**: Correct answers and grading criteria remain strictly on the server and are never sent to the client during active attempts.
6. **Optional Webcam Verification**:
   - Displays clear parental consent information.
   - Shows small, reassuring live self-view bubble in bottom-right corner.
   - **No video is recorded or sent across the network**; protects student privacy while encouraging honesty.

---

### 5. Real-Time Live Leaderboard
- Real-time Server-Sent Events (SSE) updates automatically when any student finishes.
- **Olympic Podium Display**:
  - 🥇 1st Place (Gold)
  - 🥈 2nd Place (Silver)
  - 🥉 3rd Place (Bronze)
- **Fair Ranking**: Ranked by highest score first, with fastest completion time breaking ties. Disqualified attempts are excluded from rankings.
- **Child Privacy Protection**: Public leaderboard displays student first names only.

---

### 6. Teacher Admin Dashboard (`/admin`)
- **Protected by Password**: Default password is `hajj2025` (configurable in `config.json`).
- **Live Metrics**: Class average score, high/low score, total registered, active in-progress, submitted, disqualified.
- **Detailed Student Attempt Logs**:
  - View individual scores, percentages, and exact completion times.
  - **Audit Trail Viewer**: Click any violation count to see the exact timestamp and event type (e.g. `tab-hidden at 14:02:15`).
  - **Full Student Answer Inspector**: Review what each student answered on all 25 questions compared against the answer key.
- **Question Difficulty Analytics**: Visual breakdown showing which questions students found hardest across Chapter 8.
- **Exam Controls**:
  - **Toggle Answers Review**: Unlock/lock student access to correct answers on their results screen.
  - **Export CSV**: One-click download of all class results including Student ID, score, percentage, completion time, violation counts, and status.
  - **Reset Controls**: Reset leaderboard or start a brand new session with automatic JSON archival of previous data.

---

## 🚀 Quick Start Guide

### 1. Requirements
- Node.js (version 16 or newer). No external npm dependencies required!

### 2. Running the Server
```bash
cd hajj-quiz
node server.js
```

### 3. Accessing the Platform
- **Student Quiz**: [http://localhost:3000](http://localhost:3000)
- **Teacher Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)
  - *Default Teacher Password*: `hajj2025`

### 4. Running Automated Tests
```bash
node test/quiz_test.js
```
All 14 end-to-end tests will execute and verify health, questions, anti-cheat detection, grading, leaderboard ranking, admin features, and answer review unlocking.

