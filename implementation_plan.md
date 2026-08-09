# Web‑Based 4‑Player Hokm Game

## Goal
Create an online version of the Iranian card game **Hokm** that supports four friends playing simultaneously in real‑time. The game will run in a browser with a polished, modern UI and a lightweight backend to manage game state and communications.

## User Review Required
[!IMPORTANT]
- **Hosting / Deployment** – Do you want the app to be runnable locally only, or should we set up a simple deployment (e.g., using `npm run start` and optional Dockerfile) for public access?
- **Authentication** – Should players log in with a name only, or integrate a simple OAuth (Google) flow?  A name‑only lobby is the fastest.
- **Visual Theme** – Preferred color palette (dark mode, vibrant, etc.)?  I will use a dark‑mode‑friendly teal‑purple gradient, but let me know if you have another style.
[/!IMPORTANT]

## Open Questions
- **Room Management** – Should players create/join a room via a short URL code, or use a lobby list?
- **Mobile Support** – Is responsive design for mobile browsers required?
- **Scoring Persistence** – Should match scores be stored across sessions (e.g., simple JSON file) or be in‑memory only?

## Proposed Changes
---
### Project Scaffold
#### [NEW] `package.json`
- Define scripts, dependencies (`express`, `socket.io`, `nodemon` for dev) and a start command.

#### [NEW] `server.js`
- Express server serving static files from `public/`.
- `socket.io` handles real‑time events: `createRoom`, `joinRoom`, `startGame`, `playCard`, `nextTrick`, `gameOver`.
- In‑memory store for rooms and game state (cards, turns, scores).

#### [NEW] `public/index.html`
- Landing page with a simple lobby UI (enter name, create/join room).
- After joining, transition to the game UI.

#### [NEW] `public/style.css`
- Modern dark theme with gradient background, custom font (Google "Inter").
- Card visuals using CSS shapes or small PNG assets.

#### [NEW] `public/app.js`
- Front‑end logic: connect to Socket.io, manage UI state, render hand, table, scores.
- Animation for card play (CSS transitions).
- Responsive layout for desktop and mobile.

#### [NEW] `public/assets/card_images/`
- Placeholder SVG/PNG for each of the 52 cards (can be generated later).

#### [NEW] `README.md`
- Setup instructions, run `npm install` then `npm start`.
- Explanation of game rules and how to play.

#### [NEW] `.gitignore`
- Node modules, `node_modules/`, `npm-debug.log`.

---
### Optional Enhancements (future)
- Persistent storage (SQLite) for user accounts and match history.
- Deploy to Vercel/Render with Dockerfile.
- AI‑driven tutorial overlay.
- Sound effects and optional chat.

## Verification Plan
- **Automated Tests**: None for now (quick prototype). Manual testing steps:
  1. Run `npm start` and open two browser windows.
  2. Create a room, join from both windows, add two more participants.
  3. Verify card dealing, turn order, trick‑taking logic, scoring, and end‑of‑hand detection.
  4. Check UI responsiveness on mobile screen.
- **Linting**: Use `eslint` for JavaScript, `stylelint` for CSS.

---
## Timeline (approx.)
1. Scaffold project & install deps – 15 min.
2. Implement server logic for rooms & game state – 30 min.
3. Build UI skeleton (HTML/CSS) – 20 min.
4. Wire front‑end to socket events, implement card rendering – 30 min.
5. Polish UI, add animations, test across 4 browsers – 20 min.
6. Write README & final cleanup – 10 min.

Total ~2 hours.

---
## Next Steps
Please review the **User Review Required** items and answer the **Open Questions**. Once clarified, I will proceed to generate the scaffold files and implement the game.

*If you would like to tweak any part of the plan (e.g., choose a different tech stack), let me know.*