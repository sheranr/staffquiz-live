# StaffQuiz Live

A live, game-show style MCQ quiz for your staff, similar to FlexiQuiz Live or Kahoot.
You run it from your phone. Staff join by tapping a link or scanning a QR code, then answer on their phones. **A faster correct answer earns more points**, so the quickest correct person finishes 1st.

**Free to run, with no credit card and no server to rent:**
- **GitHub Pages** hosts the website: `https://sheranr.github.io/staffquiz-live/`
- **Google Firebase** (free *Spark* plan) passes answers between phones in real time and timestamps every answer on Google's servers, so the timing is fair.

Tested with 100 players in one game. Players can join late, and the host page can be refreshed in the middle of a question without breaking the game.

---

## Links
| Who | Link |
|---|---|
| **You (admin)** | `https://sheranr.github.io/staffquiz-live/host.html`. Add it to your home screen: Chrome ⋮ → *Add to Home screen*, or Safari Share → *Add to Home Screen* |
| **Staff** | The QR code or join link shown in the lobby, e.g. `…/staffquiz-live/?pin=123456` |
| **TV / projector (optional)** | The *Big screen link* shown in the lobby, e.g. `…/host.html?screen=123456`. It shows the game in full screen with no buttons, while you control it from your phone |

## Running a quiz from your phone
1. Open **Quiz Admin**. Add questions, or tap *Import CSV* to load questions made in Excel or Google Sheets.
2. Tap **Launch live game**. A PIN and QR code appear.
3. Staff scan the QR code, or you tap **Share** to send the join link on WhatsApp or Viber.
4. Use the big yellow button at the bottom to run the game: Start, then Leaderboard, then Next question, and finally Final results 🏆.
5. At the end, tap **Download results (CSV)** to get every person's answers and response times. It opens in Excel.

Tap a name in the lobby to remove that player. Your questions are saved on the phone you made them on. Tap *Save quiz file* to keep a backup.

## Scoring
- A correct answer earns **500 to 1000 points** depending on how fast it was. A wrong answer or no answer earns 0.
- If two people have the same points, the one with the lower total answer time ranks higher.
- Answer times are recorded by Google's server, not the phone. An answer arriving after the time limit is refused, and nobody can change an answer once it's sent.
- The correct answer stays only on the admin phone until the reveal. It is never sent to staff phones early.

## Free plan limits (Firebase Spark)
About **50,000 reads a day**. One 20-question game with 100 staff uses roughly 12,000, so you can run about 3 or 4 full games a day for free. Smaller games use less.

---

## One-time setup (already done for this repository)
1. Create a Firebase project. Then turn on **Firestore Database** (Production mode) and, under **Authentication**, the **Anonymous** sign-in method.
2. Put your web app settings in `public/config.js`.
3. Paste the contents of `firestore.rules` into Firestore → **Rules** → **Publish**. **This is important:** the rules are what stop people from cheating or changing other people's data.
4. GitHub Pages serves the `gh-pages` branch, which is a copy of the `public/` folder.

## Project structure
```
public/host.html      admin: quiz editor + live game control + big-screen mode (?screen=PIN)
public/index.html     staff phone screen
public/backend.js     Firebase connection (Firestore + anonymous sign-in)
public/config.js      your Firebase project settings
public/vendor/        Firebase SDK + QR code library (bundled, no CDN needed)
firestore.rules       security rules (paste into the Firebase console)
test/                 test-only stand-in for Firebase + 100-bot simulator
```

### Testing locally without Firebase
```bash
npm install
npm run test-server             # opens the site at http://localhost:4000 with a fake Firebase
node test/bots.js <PIN> 97      # 97 simulated staff join and answer
```
