# 👑 Online Multi-Game Platform: Iranian Hokm (حکم) & Coup (کودتا)

A full-featured, real-time web application for playing **Iranian Hokm (حکم)** and **Coup (کودتا)** with friends or intelligent AI bots. Built with Node.js, Express, Socket.IO, user authentication, session reconnection support, and a modern dark velvet glassmorphism UI.

---

## 📸 Screenshots

| Landing & Game Selector | Room Lobby & AI Bots |
| :---: | :---: |
| ![Landing Screen](assets/landing.png) | ![Lobby Screen](assets/lobby.png) |

---

## ✨ Key Features

### 👤 1. Account Authentication & Persistence
- **Mandatory User Registration & Login**: Each player creates a secure account with a Username and Password.
- **Salted Password Hashing**: Passwords are saved with `crypto.pbkdf2` salt hashing in `data/users.json`.
- **Session Restoration**: Session tokens are remembered in `localStorage` so refreshing the browser retains your logged-in session.

### 🔄 2. Reconnection Engine (Resume Playing)
- **Seamless Disconnect & Reconnect**: If a player loses connection or reloads the browser mid-game, their seat is preserved with a **Reconnecting** indicator.
- **Automatic Hand Restoration**: Re-entering the room automatically restores your hand cards, game status, turn state, and player score.

### 🚪 3. Quit Room & Leave Game Options
- **In-Lobby & In-Game Exit**: Players can click **Leave Room** or **Leave Lobby** at any time.
- **Bot Handover**: In active games, quitting automatically converts the departing player's seat into an AI Bot so the remaining players can complete the match without disruption.

### 🎮 4. Multi-Game Support

#### 👑 Iranian Hokm (حکم)
- **Hakem Cutting**: Automated card cutting round to determine the first Hakem (👑).
- **Trump Declaration**: 5-card modal prompt allowing the Hakem to select the trump suit (*Hokm*).
- **Full Card Dealing**: 13 cards per player (dealt in standard $5 + 4 + 4$ sequence).
- **Trick & Match Scoring**: First team to 7 tricks wins the hand; first team to 7 points wins the match.
- **Special Bonuses**:
  - **Kot (کت)**: $+2$ points (winning team holds opponent team to 0 tricks).
  - **Hakem Kot (حاکم کت)**: $+3$ points (defeating Hakem's team $7-0$).
  - **Bām (بام)**: $+3$ points (winning all 7 tricks of the hand).

#### 🗡️ Coup (کودتا)
- **2 to 6 Players**: Supports 2–6 seats per room.
- **5 Character Roles**: **Duke** 👑 (+3 Tax, blocks Foreign Aid), **Assassin** 🗡️ (Pay 3 coins to assassinate), **Captain** ⚔️ (Steal 2 coins), **Ambassador** 📜 (Exchange cards), **Contessa** 🛡️ (Blocks assassination).
- **Action & Challenge Mechanics**: Declare actions (Income, Foreign Aid, Coup, Tax, Assassinate, Steal, Exchange), challenge claims, block actions, and choose influence card losses.

### 🤖 5. Flexible Player Count & AI Bots
- **Instant Start**: Host can start games with any number of human players (1 to 6).
- **Automatic Bot Auto-Fill**: Any open or empty seats are automatically populated with intelligent AI Bots on game start.

### 🎨 6. Modern UI & Audio
- **Dark Velvet & Glassmorphism Design**: High-resolution poker table layout with glowing suit/character icons and active turn indicators.
- **Web Audio API Sound Effects**: Synthesized sound effects for card slides, trump declarations, trick wins, and match fanfare.
- **Quick Chat Bar**: Preset chat chips for fast in-game commentary.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, Socket.IO, Crypto (PBKDF2)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Custom CSS3
- **Audio**: Web Audio API (Synthesized dynamic audio generator)
- **Icons & Fonts**: FontAwesome 6, Google Fonts (*Cinzel*, *Vazirmatn*, *Inter*)

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm (Node Package Manager)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/archroid/hokm.git
   cd hokm
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```

4. **Access the application**:
   Open your browser and navigate to `http://localhost:3000`.

---

## 🌐 Local Network (LAN) & Cloud Deployment

### Playing on Local Network (Wi-Fi)

To play with friends on the same Wi-Fi network:
1. Find your local IP address:
   ```bash
   hostname -I
   ```
2. Share the IP with your friends: `http://192.168.x.x:3000`.

### Deploying to a VPS (DigitalOcean / AWS / Hetzner)

#### Keep Server Running 24/7 with PM2
```bash
npm install -g pm2
pm2 start server.js --name "hokm-coup-server"
pm2 save
pm2 startup
```

---

## 📁 Project Structure

```
hokm/
├── assets/              # Preview screenshots
├── data/
│   └── users.json       # User account database (Salted password hashes)
├── game/
│   ├── authManager.js   # User registration, login, PBKDF2 hashing & session tokens
│   ├── coupEngine.js    # Coup card roles, turn state machine, challenges & AI bots
│   ├── engine.js        # Hokm rules, scoring, card dealing & AI bots
│   └── roomManager.js   # Room lifecycle, socket seat mapping, reconnect & leave logic
├── public/
│   ├── css/
│   │   └── style.css    # Dark velvet table design, glassmorphism & spacing utilities
│   ├── js/
│   │   ├── app.js       # Client Socket.IO logic, multi-game switching & UI updates
│   │   └── sound.js     # Web Audio API sound generator
│   └── index.html       # Single-page application structure & modals
├── server.js            # Node.js HTTP server & WebSocket event router
├── package.json         # Project metadata & dependencies
└── README.md            # Project documentation
```

---

## 📄 License

Distributed under the [MIT License](LICENSE).
