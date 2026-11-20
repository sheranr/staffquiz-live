# StaffQuiz Live

A live, game-show style MCQ quiz for your staff, similar to FlexiQuiz Live or Kahoot.
You run the quiz from a big screen. Staff answer on their phones. **A faster correct answer earns more points**, so the quickest correct staff member finishes 1st.

Tested with 100 simulated players at the same time.

---

## 1. How it works

| Step | Host (projector / TV / Zoom share) | Staff (phone browser, no app or login) |
|---|---|---|
| Lobby | Big 6-digit PIN + QR code. Names pop in as people join | Scan the QR (or open the link), type a name, then **Join** |
| 3-2-1 | Countdown | "Get ready!" |
| Question | Question, timer ring, live "answered" count | Question + coloured answer buttons (▲◆●■★⬟) |
| Answer | Bar chart of answers, correct one marked ✔, **⚡ fastest correct person** | Green "Correct! +870 pts" or red "Not quite", plus their current rank |
| Leaderboard | Top 10 after each question | "You're #5 of 100, 120 pts behind Kasun" |
| Final | Podium for the top 3 with confetti, full ranking table, **Download results CSV** | Final position and medal |

### Scoring (the "fastest correct wins" rule)
- Correct answer: **500 to 1000 points**. Answering instantly gives 1000. Answering at the last second gives 500.
- Wrong answer or no answer: 0 points.
- **Tie-break:** if two people have the same points, the one with the lower total answer time ranks higher.
- Times are measured **on the server**, not on the phone, so nobody can cheat by changing their phone's clock.
- The correct answer is never sent to phones until the reveal, so it can't be read from the page code.
- If everyone has answered, the reveal happens right away. The host doesn't need to wait for the timer.

---

## 2. Run everything from your phone (admin)

1. Put the app online once (see *Option B* below, Render.com). After that you only need your phone.
2. On your phone open `https://<your-app>.onrender.com/host` and install it: in Chrome tap ⋮ → **Add to Home screen / Install app**; in Safari tap Share → **Add to Home Screen**. A **Quiz Admin** icon appears on your phone and opens full screen like a normal app.
   On that page, enter the host password, enter the host password under *Game settings*, and tap **Launch live game**.
3. Staff scan the QR code on your phone, or you tell them the PIN. They join at `https://<your-app>.onrender.com`.
4. Use the big yellow button at the bottom to run the game: Start, then Leaderboard, then Next question.
   - **No TV?** That's fine. Every staff phone shows the question and the answer buttons.
   - **Have a TV or projector?** In the lobby, tap **Copy** next to *Big screen / projector link* and open that link on the TV or laptop browser. It shows the PIN, QR code, questions, timer, answer charts and leaderboard in full screen with no buttons. You keep controlling everything from your phone.
5. Questions you make on the phone are saved in that phone's browser. Tap *Save quiz file* to keep a backup, and use *Import CSV* to load questions made in Excel or Google Sheets.

## 3. Run it

You need **Node.js 18 or later** (download it from nodejs.org).

```bash
npm install
npm start
```

- Host screen: `http://localhost:3000/host`
- Staff join page: `http://<this-computer-ip>:3000/` (the QR code on the host screen links here)

### Option A: Office Wi-Fi (free, fastest, no internet needed)
1. Run the app on a laptop connected to the office Wi-Fi.
2. Find the laptop's IP address. On Windows, run `ipconfig` and look for the IPv4 address, for example 192.168.1.25.
3. Open `http://192.168.1.25:3000/host` on the laptop. Don't use *localhost* here, because the QR code uses the address you opened the page with.
4. Staff connect their phones to the same Wi-Fi and scan the QR code.
5. If phones can't connect, allow Node.js through Windows Firewall.

### Option B: Online, so staff can join from anywhere (Render / Railway / VPS)
- **Render.com** (works from a phone): sign in with GitHub, then tap **New → Blueprint** and choose this repository. The included `render.yaml` sets everything up and asks you for a `HOST_PASSWORD`. The free tier goes to sleep when idle, so open the site a minute before the quiz to wake it up. The paid Starter plan (about USD 7/month) stays awake.
- **Railway / Fly.io / any VPS**: same steps. The app reads the `PORT` environment variable.
- Use only **one instance**, because games are kept in memory. Don't turn on autoscaling.

### Optional environment variables
| Variable | Purpose |
|---|---|
| `HOST_PASSWORD` | Only people who know this password can launch quizzes. Enter it under *Game settings → Host password* |
| `MAX_PLAYERS` | Limit on players per game (default 300) |
| `PORT` | Port to listen on (default 3000) |

---

## 4. Creating questions

- **Editor:** add, edit, duplicate, reorder and delete questions. Each question can have 2 to 6 options, its own time limit and an optional image URL. Your work saves automatically in the browser.
- **CSV import:** click *CSV template*, fill it in with Excel or Google Sheets, save it as CSV, then click *Import CSV*.
  Columns: `Question, Option A … Option F, Correct, Time, Image URL`. The **Correct** column can be a letter (`C`), a number (`3`) or the exact answer text.
- **Save quiz file / Open quiz file:** keep quizzes as `.quiz.json` files and reuse them.
- Tip: ask Claude to "write 30 MCQ questions about our product/safety rules in this CSV format", then import the result.

### Game settings
Default timer · speed scoring on/off · shuffle questions · shuffle answers · show players their rank · require Staff ID (adds the ID to the name in the results) · allow late joining.

### Results export
The CSV includes rank, name, score, number correct, total time, and for every question: what each person chose, whether it was right, and how many seconds they took. An answer key is at the bottom. It opens directly in Excel.

---

## 5. Host controls
- **Space / Enter / →** moves to the next step (start → reveal → leaderboard → next question).
- *Show answer now* ends the current question early.
- Click a name in the lobby to remove a player.
- ⛶ switches to full-screen for the projector.
- If the host page is refreshed, it reconnects to the running game. If a phone drops off, the player rejoins automatically with their score kept.

---

## 6. FlexiQuiz analysis: what we copied and what we improved

FlexiQuiz has two modes: *Classic* (self-paced tests through a link) and *Live* (the host presents and everyone answers at the same time). This app reproduces the **Live** mode, which is what a staff game needs.

| FlexiQuiz Live feature | StaffQuiz Live |
|---|---|
| Access code + QR code to join, no player account | ✅ 6-digit PIN + QR, no login |
| 3-second countdown, host controls the pace | ✅ |
| Time limits and bonus points for speed | ✅ 500–1000 pts by speed |
| Leaderboard after each question, ties ordered by quickest answer | ✅ same rule |
| Top-3 medals + confetti at the end | ✅ podium + confetti |
| Players see their position | ✅ plus "X pts behind <name>" |
| Question types: 6 (single, multiple, picture, matching, blanks, free) | MCQ only (single answer, 2–6 options + optional image), as you asked |
| AI question generation, spreadsheet import | CSV import (generate questions with Claude, then import) |
| Player limits by paid plan | **No per-player fees.** Default limit is 300, and you can change it |
| Results/reports | CSV with every answer and response time per person |
| Extra | ⚡ "fastest correct" shown after every question, 🔥 answer streaks, auto-reveal when everyone has answered, rejoin after a dropped connection, server-side timing to stop cheating |

**Not included yet** (possible next steps): saved player history across sessions, a host login with a quiz library on the server (database), team mode, other question types, and a branded theme/logo.

---

## 7. Project structure
```
server.js            game engine (Express + Socket.io): rooms, timing, scoring, leaderboard
public/host.html     quiz editor + live host screen
public/index.html    player (phone) screen
public/common.js     timer, confetti, sounds, helpers
public/style.css     theme
test/load-test.js    simulates a 100-player game: npm run load-test (with the server running)
```
