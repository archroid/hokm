const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { RoomManager } = require('./game/roomManager');
const authManager = require('./game/authManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Authentication actions
  socket.on('auth_register', ({ username, password }, callback) => {
    const res = authManager.register(username, password);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('auth_login', ({ username, password }, callback) => {
    const res = authManager.login(username, password);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('auth_verify_session', ({ token }, callback) => {
    const res = authManager.verifySession(token);
    if (typeof callback === 'function') callback(res);
  });

  // Lobby actions
  socket.on('create_room', ({ token }, callback) => {
    const auth = authManager.verifySession(token);
    if (!auth.valid) {
      if (typeof callback === 'function') callback({ success: false, message: 'Account required to play. Please login first.' });
      return;
    }
    const res = roomManager.createRoom(socket, auth.username);
    if (typeof callback === 'function') callback({ success: true, ...res });
  });

  socket.on('join_room', ({ roomId, token }, callback) => {
    const auth = authManager.verifySession(token);
    if (!auth.valid) {
      if (typeof callback === 'function') callback({ success: false, message: 'Account required to play. Please login first.' });
      return;
    }
    const res = roomManager.joinRoom(socket, roomId, auth.username);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('reconnect_room', ({ token, roomId }, callback) => {
    const auth = authManager.verifySession(token);
    if (!auth.valid) {
      if (typeof callback === 'function') callback({ success: false, message: 'Authentication failed' });
      return;
    }
    const res = roomManager.reconnectUser(socket, auth.username, roomId);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('add_bot', ({ roomId, seatIndex }) => {
    roomManager.addBot(socket, roomId, seatIndex);
  });

  socket.on('remove_seat', ({ roomId, seatIndex }) => {
    roomManager.removePlayerOrBot(socket, roomId, seatIndex);
  });

  socket.on('start_game', ({ roomId }, callback) => {
    const res = roomManager.startGame(socket, roomId);
    if (typeof callback === 'function') callback(res);
  });

  // Gameplay actions
  socket.on('declare_trump', ({ roomId, suit }) => {
    roomManager.declareTrump(socket, roomId, suit);
  });

  socket.on('play_card', ({ roomId, cardId }, callback) => {
    const res = roomManager.playCard(socket, roomId, cardId);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('send_chat', ({ roomId, message }) => {
    roomManager.sendQuickChat(socket, roomId, message);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    roomManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`👑 Iranian Hokm Game Server running on http://localhost:${PORT}`);
});
