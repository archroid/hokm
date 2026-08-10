const { HokmGame } = require('./engine');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> { roomId, game, hostId, hostUsername, playerSockets: Map(socketId -> seatIndex) }
    this.userRoomMap = new Map(); // usernameKey -> { roomId, seatIndex }
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocket, username) {
    const roomId = this.generateRoomCode();
    const game = new HokmGame(roomId);
    const userKey = username.toLowerCase();

    // Clean up old userRoomMap if player was in another room
    if (this.userRoomMap.has(userKey)) {
      const old = this.userRoomMap.get(userKey);
      if (old.roomId !== roomId) {
        this.leaveRoomInternal(username, old.roomId);
      }
    }

    // Host takes seat 0 (South)
    game.seats[0] = {
      id: hostSocket.id,
      name: username,
      username: username,
      isBot: false,
      connected: true
    };

    const roomData = {
      roomId,
      game,
      hostId: hostSocket.id,
      hostUsername: username,
      playerSockets: new Map() // socketId -> seatIndex
    };

    roomData.playerSockets.set(hostSocket.id, 0);
    this.rooms.set(roomId, roomData);
    this.userRoomMap.set(userKey, { roomId, seatIndex: 0 });

    hostSocket.join(roomId);
    this.broadcastState(roomId);
    return { roomId, seatIndex: 0 };
  }

  joinRoom(socket, roomId, username) {
    roomId = roomId.toUpperCase().trim();
    if (!this.rooms.has(roomId)) {
      return { success: false, message: 'Room not found' };
    }

    const userKey = username.toLowerCase();
    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    // Check if user is already seated in this room (reconnection path)
    if (this.userRoomMap.has(userKey)) {
      const activeInfo = this.userRoomMap.get(userKey);
      if (activeInfo.roomId === roomId) {
        return this.reconnectUser(socket, username, roomId);
      }
    }

    // Check if socket is already in room
    if (roomData.playerSockets.has(socket.id)) {
      const seat = roomData.playerSockets.get(socket.id);
      return { success: true, roomId, seatIndex: seat };
    }

    // Find first empty seat
    let seatIndex = game.seats.findIndex(s => s === null);
    if (seatIndex === -1) {
      return { success: false, message: 'Room is full' };
    }

    game.seats[seatIndex] = {
      id: socket.id,
      name: username,
      username: username,
      isBot: false,
      connected: true
    };

    roomData.playerSockets.set(socket.id, seatIndex);
    this.userRoomMap.set(userKey, { roomId, seatIndex });
    socket.join(roomId);

    this.broadcastState(roomId);
    return { success: true, roomId, seatIndex };
  }

  reconnectUser(socket, username, requestedRoomId) {
    const userKey = username.toLowerCase();

    // Check if user has an active room
    if (!this.userRoomMap.has(userKey)) {
      if (requestedRoomId && this.rooms.has(requestedRoomId)) {
        // Try joining if room exists
        return this.joinRoom(socket, requestedRoomId, username);
      }
      return { success: false, message: 'No active room found for user' };
    }

    const { roomId, seatIndex } = this.userRoomMap.get(userKey);
    if (!this.rooms.has(roomId)) {
      this.userRoomMap.delete(userKey);
      return { success: false, message: 'Previous room no longer exists' };
    }

    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    // Clear old socket ID mapping for this seat if any
    for (const [sId, sIdx] of roomData.playerSockets.entries()) {
      if (sIdx === seatIndex) {
        roomData.playerSockets.delete(sId);
      }
    }

    // Rebind seat
    game.seats[seatIndex].id = socket.id;
    game.seats[seatIndex].connected = true;
    game.seats[seatIndex].name = username;
    game.seats[seatIndex].username = username;

    roomData.playerSockets.set(socket.id, seatIndex);
    if (roomData.hostUsername === username) {
      roomData.hostId = socket.id;
    }

    socket.join(roomId);
    this.broadcastState(roomId);

    return { success: true, roomId, seatIndex, state: game.state, reconnected: true };
  }

  leaveRoomInternal(username, roomId) {
    const userKey = username.toLowerCase();
    this.userRoomMap.delete(userKey);
    if (!this.rooms.has(roomId)) return;

    const roomData = this.rooms.get(roomId);
    const seatIndex = roomData.game.seats.findIndex(s => s && s.username && s.username.toLowerCase() === userKey);
    if (seatIndex !== -1) {
      const seat = roomData.game.seats[seatIndex];
      if (seat) {
        roomData.playerSockets.delete(seat.id);
        roomData.game.seats[seatIndex] = null;
      }
    }
    this.broadcastState(roomId);
  }

  addBot(hostSocket, roomId, seatIndex) {
    if (!this.rooms.has(roomId)) return false;
    const roomData = this.rooms.get(roomId);
    if (roomData.hostId !== hostSocket.id) return false;

    const game = roomData.game;
    if (game.state !== 'LOBBY') return false;

    if (seatIndex >= 0 && seatIndex < 4 && game.seats[seatIndex] === null) {
      const botNames = ['Hassan Bot', 'Reza Bot', 'Parvin Bot', 'Sara Bot', 'Ali Bot'];
      const botName = botNames[seatIndex % botNames.length];
      game.seats[seatIndex] = {
        id: `bot_${seatIndex}_${Date.now()}`,
        name: botName,
        username: botName,
        isBot: true,
        connected: true
      };
      this.broadcastState(roomId);
      return true;
    }
    return false;
  }

  removePlayerOrBot(hostSocket, roomId, seatIndex) {
    if (!this.rooms.has(roomId)) return false;
    const roomData = this.rooms.get(roomId);
    if (roomData.hostId !== hostSocket.id) return false;

    const game = roomData.game;
    if (game.state !== 'LOBBY') return false;

    if (seatIndex >= 0 && seatIndex < 4 && seatIndex !== 0) { // Can't remove host (seat 0)
      const seat = game.seats[seatIndex];
      if (seat) {
        if (!seat.isBot) {
          if (seat.username) {
            this.userRoomMap.delete(seat.username.toLowerCase());
          }
          if (roomData.playerSockets.has(seat.id)) {
            roomData.playerSockets.delete(seat.id);
          }
        }
        game.seats[seatIndex] = null;
        this.broadcastState(roomId);
        return true;
      }
    }
    return false;
  }

  startGame(hostSocket, roomId) {
    if (!this.rooms.has(roomId)) return { success: false, message: 'Room not found' };
    const roomData = this.rooms.get(roomId);

    if (roomData.hostId !== hostSocket.id) {
      return { success: false, message: 'Only host can start the game' };
    }

    const game = roomData.game;
    // Check if all 4 seats are filled
    const filledCount = game.seats.filter(s => s !== null).length;
    if (filledCount < 4) {
      return { success: false, message: 'Need 4 players to start! Add AI bots for open seats.' };
    }

    // Step 1: Cut for Hakem
    game.startCutHakem();
    this.broadcastState(roomId);

    // After 3 seconds, start first round (Trump selection)
    setTimeout(() => {
      game.startNewRound();
      this.broadcastState(roomId);
      this.checkBotTurn(roomId);
    }, 3000);

    return { success: true };
  }

  declareTrump(socket, roomId, suit) {
    if (!this.rooms.has(roomId)) return false;
    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    const seat = roomData.playerSockets.get(socket.id);
    if (seat !== game.hakemSeat || game.state !== 'TRUMP_SELECTION') return false;

    const result = game.setTrump(suit);
    if (result) {
      this.broadcastState(roomId);
      this.checkBotTurn(roomId);
    }
    return result;
  }

  playCard(socket, roomId, cardId) {
    if (!this.rooms.has(roomId)) return { success: false, message: 'Room not found' };
    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    const seat = roomData.playerSockets.get(socket.id);
    if (seat === undefined) return { success: false, message: 'Not in this room' };

    const playResult = game.playCard(seat, cardId);
    if (!playResult.success) return playResult;

    // If trick complete, delay clearing table so players can see the 4 cards played
    if (playResult.trickComplete) {
      this.broadcastState(roomId);

      setTimeout(() => {
        if (game.state === 'PLAYING') {
          game.currentTrick = [];
          this.broadcastState(roomId);
          this.checkBotTurn(roomId);
        } else if (game.state === 'ROUND_OVER') {
          this.broadcastState(roomId);
          // Auto start next round after 4.5 seconds if game not over
          setTimeout(() => {
            if (game.state === 'ROUND_OVER') {
              game.startNewRound();
              this.broadcastState(roomId);
              this.checkBotTurn(roomId);
            }
          }, 4500);
        } else if (game.state === 'GAME_OVER') {
          this.broadcastState(roomId);
        }
      }, 2000);
    } else {
      this.broadcastState(roomId);
      this.checkBotTurn(roomId);
    }

    return playResult;
  }

  checkBotTurn(roomId) {
    if (!this.rooms.has(roomId)) return;
    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    if (game.state === 'TRUMP_SELECTION') {
      const hakemPlayer = game.seats[game.hakemSeat];
      if (hakemPlayer && hakemPlayer.isBot) {
        setTimeout(() => {
          const trumpSuit = game.chooseBotTrump(game.hakemSeat);
          game.setTrump(trumpSuit);
          this.broadcastState(roomId);
          this.checkBotTurn(roomId);
        }, 1200);
      }
    } else if (game.state === 'PLAYING') {
      const turnPlayer = game.seats[game.currentTurn];
      if (turnPlayer && turnPlayer.isBot) {
        setTimeout(() => {
          if (game.state !== 'PLAYING') return;
          const botCard = game.chooseBotCard(game.currentTurn);
          if (botCard) {
            this.playCardInternal(roomId, game.currentTurn, botCard.id);
          }
        }, 1000 + Math.random() * 500);
      }
    }
  }

  playCardInternal(roomId, seatIndex, cardId) {
    if (!this.rooms.has(roomId)) return;
    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    const playResult = game.playCard(seatIndex, cardId);
    if (!playResult.success) return;

    if (playResult.trickComplete) {
      this.broadcastState(roomId);

      setTimeout(() => {
        if (game.state === 'PLAYING') {
          game.currentTrick = [];
          this.broadcastState(roomId);
          this.checkBotTurn(roomId);
        } else if (game.state === 'ROUND_OVER') {
          this.broadcastState(roomId);
          setTimeout(() => {
            if (game.state === 'ROUND_OVER') {
              game.startNewRound();
              this.broadcastState(roomId);
              this.checkBotTurn(roomId);
            }
          }, 4500);
        } else if (game.state === 'GAME_OVER') {
          this.broadcastState(roomId);
        }
      }, 2000);
    } else {
      this.broadcastState(roomId);
      this.checkBotTurn(roomId);
    }
  }

  sendQuickChat(socket, roomId, message) {
    if (!this.rooms.has(roomId)) return;
    const roomData = this.rooms.get(roomId);
    const seatIndex = roomData.playerSockets.get(socket.id);
    if (seatIndex !== undefined) {
      const sender = roomData.game.seats[seatIndex];
      this.io.to(roomId).emit('chat_message', {
        seatIndex,
        senderName: sender ? sender.name : 'Player',
        message
      });
    }
  }

  handleDisconnect(socket) {
    for (const [roomId, roomData] of this.rooms.entries()) {
      if (roomData.playerSockets.has(socket.id)) {
        const seatIndex = roomData.playerSockets.get(socket.id);
        roomData.playerSockets.delete(socket.id);

        const seat = roomData.game.seats[seatIndex];
        if (seat) {
          seat.connected = false;
        }

        this.broadcastState(roomId);

        // If all sockets in room are disconnected and game is in LOBBY, clean up room
        const activeSockets = roomData.playerSockets.size;
        if (activeSockets === 0 && roomData.game.state === 'LOBBY') {
          for (const s of roomData.game.seats) {
            if (s && s.username) {
              this.userRoomMap.delete(s.username.toLowerCase());
            }
          }
          this.rooms.delete(roomId);
        }
        break;
      }
    }
  }

  broadcastState(roomId) {
    if (!this.rooms.has(roomId)) return;
    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    // Send personalized state to each connected socket
    for (const [socketId, seatIndex] of roomData.playerSockets.entries()) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        const state = game.getPublicState(seatIndex);
        const seat = game.seats[seatIndex];
        state.mySeat = seatIndex;
        state.isHost = (roomData.hostUsername && seat ? roomData.hostUsername === seat.username : roomData.hostId === socketId);
        socket.emit('game_state', state);
      }
    }
  }
}

module.exports = { RoomManager };
