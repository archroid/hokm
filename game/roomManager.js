const { HokmGame } = require('./engine');
const { CoupGame } = require('./coupEngine');

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomId -> { roomId, game, gameType, hostId, hostUsername, playerSockets: Map(socketId -> seatIndex) }
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

  createRoom(hostSocket, username, gameType = 'HOKM') {
    const roomId = this.generateRoomCode();
    const type = gameType.toUpperCase() === 'COUP' ? 'COUP' : 'HOKM';
    const game = type === 'COUP' ? new CoupGame(roomId, 6) : new HokmGame(roomId);
    const userKey = username.toLowerCase();

    // Clean up old userRoomMap if player was in another room
    if (this.userRoomMap.has(userKey)) {
      const old = this.userRoomMap.get(userKey);
      if (old.roomId !== roomId) {
        this.leaveRoomInternal(username, old.roomId);
      }
    }

    // Host takes seat 0
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
      gameType: type,
      hostId: hostSocket.id,
      hostUsername: username,
      playerSockets: new Map() // socketId -> seatIndex
    };

    roomData.playerSockets.set(hostSocket.id, 0);
    this.rooms.set(roomId, roomData);
    this.userRoomMap.set(userKey, { roomId, seatIndex: 0 });

    hostSocket.join(roomId);
    this.broadcastState(roomId);
    return { roomId, seatIndex: 0, gameType: type };
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
      return { success: true, roomId, seatIndex: seat, gameType: roomData.gameType };
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
    return { success: true, roomId, seatIndex, gameType: roomData.gameType };
  }

  reconnectUser(socket, username, requestedRoomId) {
    const userKey = username.toLowerCase();

    if (!this.userRoomMap.has(userKey)) {
      if (requestedRoomId && this.rooms.has(requestedRoomId)) {
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

    // Clear old socket ID mapping for this seat
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

    return { success: true, roomId, seatIndex, gameType: roomData.gameType, state: game.state, reconnected: true };
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

  leaveRoom(socket, roomId) {
    if (!roomId || !this.rooms.has(roomId)) return { success: false, message: 'Room not found' };
    const roomData = this.rooms.get(roomId);
    const seatIndex = roomData.playerSockets.get(socket.id);
    if (seatIndex === undefined) return { success: false, message: 'Not in room' };

    const seat = roomData.game.seats[seatIndex];
    if (seat && seat.username) {
      this.userRoomMap.delete(seat.username.toLowerCase());
    }

    roomData.playerSockets.delete(socket.id);
    socket.leave(roomId);

    if (roomData.game.state === 'LOBBY') {
      roomData.game.seats[seatIndex] = null;
    } else {
      // In active game, convert player to Bot so remaining players can finish!
      roomData.game.seats[seatIndex] = {
        id: `bot_${seatIndex}_${Date.now()}`,
        name: `${seat ? seat.name : 'Player'} (Bot)`,
        username: `${seat ? seat.name : 'Player'} (Bot)`,
        isBot: true,
        connected: true
      };
    }

    this.broadcastState(roomId);
    this.checkBotTurn(roomId);

    // Clean up empty room if no human sockets remain
    if (roomData.playerSockets.size === 0) {
      this.rooms.delete(roomId);
    }

    return { success: true };
  }

  addBot(hostSocket, roomId, seatIndex) {
    if (!this.rooms.has(roomId)) return false;
    const roomData = this.rooms.get(roomId);
    if (roomData.hostId !== hostSocket.id) return false;

    const game = roomData.game;
    if (game.state !== 'LOBBY') return false;

    const maxSeats = roomData.gameType === 'COUP' ? 6 : 4;
    if (seatIndex >= 0 && seatIndex < maxSeats && game.seats[seatIndex] === null) {
      const botNames = ['Hassan Bot', 'Reza Bot', 'Parvin Bot', 'Sara Bot', 'Ali Bot', 'Nima Bot'];
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

    const maxSeats = roomData.gameType === 'COUP' ? 6 : 4;
    if (seatIndex >= 0 && seatIndex < maxSeats && seatIndex !== 0) { // Can't remove host
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
    const botNames = ['Hassan Bot', 'Reza Bot', 'Parvin Bot', 'Sara Bot', 'Ali Bot', 'Nima Bot'];

    if (roomData.gameType === 'COUP') {
      const filledCount = game.seats.filter(s => s !== null).length;
      if (filledCount < 2) {
        // Auto add bot to seat 1 if solo player starting Coup
        if (game.seats[1] === null) {
          game.seats[1] = {
            id: `bot_1_${Date.now()}`,
            name: botNames[1],
            username: botNames[1],
            isBot: true,
            connected: true
          };
        }
      }
      game.startGame();
      this.broadcastState(roomId);
      this.checkBotTurn(roomId);
      return { success: true };
    } else {
      // Hokm: Auto fill open seats with AI bots if < 4 seats filled
      for (let s = 0; s < 4; s++) {
        if (game.seats[s] === null) {
          game.seats[s] = {
            id: `bot_${s}_${Date.now()}`,
            name: botNames[s % botNames.length],
            username: botNames[s % botNames.length],
            isBot: true,
            connected: true
          };
        }
      }
      game.startCutHakem();
      this.broadcastState(roomId);

      setTimeout(() => {
        game.startNewRound();
        this.broadcastState(roomId);
        this.checkBotTurn(roomId);
      }, 3000);

      return { success: true };
    }
  }

  // --- COUP GAMEPLAY ACTIONS ---
  coupDeclareAction(socket, roomId, actionType, targetSeat) {
    if (!this.rooms.has(roomId)) return { success: false, message: 'Room not found' };
    const roomData = this.rooms.get(roomId);
    if (roomData.gameType !== 'COUP') return { success: false, message: 'Not a Coup room' };

    const seat = roomData.playerSockets.get(socket.id);
    if (seat === undefined) return { success: false, message: 'Not in room' };

    const result = roomData.game.declareAction(seat, actionType, targetSeat);
    this.broadcastState(roomId);
    this.checkBotTurn(roomId);
    return result;
  }

  coupSubmitResponse(socket, roomId, responseType, claimRole) {
    if (!this.rooms.has(roomId)) return { success: false, message: 'Room not found' };
    const roomData = this.rooms.get(roomId);
    if (roomData.gameType !== 'COUP') return { success: false, message: 'Not a Coup room' };

    const seat = roomData.playerSockets.get(socket.id);
    if (seat === undefined) return { success: false, message: 'Not in room' };

    const result = roomData.game.submitResponse(seat, responseType, claimRole);
    this.broadcastState(roomId);
    this.checkBotTurn(roomId);
    return result;
  }

  coupSelectLoss(socket, roomId, cardId) {
    if (!this.rooms.has(roomId)) return { success: false, message: 'Room not found' };
    const roomData = this.rooms.get(roomId);
    if (roomData.gameType !== 'COUP') return { success: false, message: 'Not a Coup room' };

    const seat = roomData.playerSockets.get(socket.id);
    if (seat === undefined) return { success: false, message: 'Not in room' };

    const result = roomData.game.selectInfluenceToLose(seat, cardId);
    this.broadcastState(roomId);
    this.checkBotTurn(roomId);
    return result;
  }

  coupSelectExchange(socket, roomId, keptCardIds) {
    if (!this.rooms.has(roomId)) return { success: false, message: 'Room not found' };
    const roomData = this.rooms.get(roomId);
    if (roomData.gameType !== 'COUP') return { success: false, message: 'Not a Coup room' };

    const seat = roomData.playerSockets.get(socket.id);
    if (seat === undefined) return { success: false, message: 'Not in room' };

    const result = roomData.game.selectExchangeKeep(seat, keptCardIds);
    this.broadcastState(roomId);
    this.checkBotTurn(roomId);
    return result;
  }

  // --- HOKM GAMEPLAY ACTIONS ---
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

    return playResult;
  }

  checkBotTurn(roomId) {
    if (!this.rooms.has(roomId)) return;
    const roomData = this.rooms.get(roomId);
    const game = roomData.game;

    if (roomData.gameType === 'COUP') {
      // Trigger bot moves for Coup
      for (let s = 0; s < game.maxSeats; s++) {
        const seat = game.seats[s];
        if (seat && seat.isBot && game.isSeatAlive(s)) {
          setTimeout(() => {
            if (!this.rooms.has(roomId)) return;
            game.chooseBotMove(s);
            this.broadcastState(roomId);
          }, 1000 + Math.random() * 500);
        }
      }
    } else {
      // Hokm bots
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
        state.gameType = roomData.gameType;
        state.isHost = (roomData.hostUsername && seat ? roomData.hostUsername === seat.username : roomData.hostId === socketId);
        socket.emit('game_state', state);
      }
    }
  }
}

module.exports = { RoomManager };
