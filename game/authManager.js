const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

class AuthManager {
  constructor() {
    this.users = new Map(); // username.toLowerCase() -> { username, passwordHash, salt, createdAt }
    this.sessions = new Map(); // token -> { username, createdAt }
    this.ensureDataDir();
    this.loadUsers();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  loadUsers() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const u of list) {
            if (u && u.username && u.passwordHash && u.salt) {
              this.users.set(u.username.toLowerCase(), u);
            }
          }
        }
      }
    } catch (err) {
      console.error('[AuthManager] Error loading users.json:', err.message);
    }
  }

  saveUsers() {
    try {
      const list = Array.from(this.users.values());
      fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), 'utf8');
    } catch (err) {
      console.error('[AuthManager] Error saving users.json:', err.message);
    }
  }

  hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  }

  register(username, password) {
    if (!username || typeof username !== 'string') {
      return { success: false, message: 'Username is required' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      return { success: false, message: 'Username must be between 3 and 20 characters' };
    }
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmed)) {
      return { success: false, message: 'Username can only contain letters, numbers, spaces, and underscores' };
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return { success: false, message: 'Password must be at least 4 characters long' };
    }

    const key = trimmed.toLowerCase();
    if (this.users.has(key)) {
      return { success: false, message: 'Username is already taken' };
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(password, salt);
    const userRecord = {
      username: trimmed,
      passwordHash,
      salt,
      createdAt: new Date().toISOString()
    };

    this.users.set(key, userRecord);
    this.saveUsers();

    const token = this.createSession(trimmed);
    return { success: true, token, username: trimmed };
  }

  login(username, password) {
    if (!username || !password) {
      return { success: false, message: 'Username and password are required' };
    }
    const key = username.trim().toLowerCase();
    const user = this.users.get(key);
    if (!user) {
      return { success: false, message: 'Invalid username or password' };
    }

    const hash = this.hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return { success: false, message: 'Invalid username or password' };
    }

    const token = this.createSession(user.username);
    return { success: true, token, username: user.username };
  }

  createSession(username) {
    const token = crypto.randomBytes(32).toString('hex');
    this.sessions.set(token, {
      username,
      createdAt: Date.now()
    });
    return token;
  }

  verifySession(token) {
    if (!token || !this.sessions.has(token)) {
      return { valid: false };
    }
    const session = this.sessions.get(token);
    return { valid: true, username: session.username };
  }
}

module.exports = new AuthManager();
