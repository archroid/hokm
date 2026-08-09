const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { RoomManager } = require('./game/roomManager');

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

  // Lobby actions
  socket.on('create_room', ({ playerName }, callback) => {
    const res = roomManager.createRoom(socket, playerName);
    if (typeof callback === 'function') callback({ success: true, ...res });
  });

  socket.on('join_room', ({ roomId, playerName }, callback) => {
    const res = roomManager.joinRoom(socket, roomId, playerName);
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
