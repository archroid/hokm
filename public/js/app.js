/**
 * Hokm Online Frontend Application Logic with User Accounts & Reconnection Support
 */

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State variables
  let currentRoomId = localStorage.getItem('hokm_room_id') || null;
  let mySeatIndex = 0;
  let isHost = false;
  let gameState = null;
  let sessionToken = localStorage.getItem('hokm_session_token') || '';
  let currentUser = localStorage.getItem('hokm_user_name') || '';
  let authMode = 'login'; // 'login' or 'register'

  // Auth Elements
  const authSection = document.getElementById('auth-section');
  const roomActionsSection = document.getElementById('room-actions-section');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const inputUsername = document.getElementById('input-username');
  const inputPassword = document.getElementById('input-password');
  const btnSubmitAuth = document.getElementById('btn-submit-auth');
  const authAlert = document.getElementById('auth-alert');
  const loggedUserDisplay = document.getElementById('logged-user-display');
  const headerUserName = document.getElementById('header-user-name');
  const btnLogout = document.getElementById('btn-logout');

  // Lobby & Room Elements
  const inputRoomCode = document.getElementById('input-room-code');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');

  const viewLanding = document.getElementById('view-landing');
  const viewRoomLobby = document.getElementById('view-room-lobby');
  const viewGameTable = document.getElementById('view-game-table');
  const gameHeader = document.getElementById('game-header');

  const displayRoomCode = document.getElementById('display-room-code');
  const lobbyCodeDisplay = document.getElementById('lobby-code-display');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const roomCodeBadge = document.getElementById('room-code-badge');
  const btnStartGame = document.getElementById('btn-start-game');

  const trumpDisplay = document.getElementById('trump-display');
  const trumpIconSymbol = document.getElementById('trump-icon-symbol');
  const scoreUs = document.getElementById('score-us');
  const scoreThem = document.getElementById('score-them');
  const tricksUs = document.getElementById('tricks-us');
  const tricksThem = document.getElementById('tricks-them');

  const modalTrumpSelect = document.getElementById('modal-trump-select');
  const modalRoundOver = document.getElementById('modal-round-over');
  const modalGameOver = document.getElementById('modal-game-over');

  const myHandContainer = document.getElementById('my-hand-container');
  const tableStatusMsg = document.getElementById('table-status-msg');

  // Check URL query parameters for auto-join room code (e.g. ?room=ABCD)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    inputRoomCode.value = roomParam.toUpperCase();
    currentRoomId = roomParam.toUpperCase();
  }

  // --- AUTHENTICATION HANDLERS ---
  tabLogin.addEventListener('click', () => switchAuthTab('login'));
  tabRegister.addEventListener('click', () => switchAuthTab('register'));

  function switchAuthTab(mode) {
    authMode = mode;
    hideAuthAlert();
    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      btnSubmitAuth.innerHTML = `<i class="fa-solid fa-right-to-bracket me-2"></i> Login to Play`;
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      btnSubmitAuth.innerHTML = `<i class="fa-solid fa-user-plus me-2"></i> Create Account`;
    }
  }

  btnSubmitAuth.addEventListener('click', handleAuthSubmit);
  inputPassword.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleAuthSubmit();
  });

  function handleAuthSubmit() {
    const username = inputUsername.value.trim();
    const password = inputPassword.value;

    if (!username || !password) {
      showAuthAlert('Please enter both username and password.', 'error');
      return;
    }

    const eventName = authMode === 'login' ? 'auth_login' : 'auth_register';

    btnSubmitAuth.disabled = true;
    socket.emit(eventName, { username, password }, (res) => {
      btnSubmitAuth.disabled = false;
      if (res && res.success) {
        onAuthSuccess(res.token, res.username);
      } else {
        showAuthAlert(res ? res.message : 'Authentication failed.', 'error');
      }
    });
  }

  function onAuthSuccess(token, username) {
    sessionToken = token;
    currentUser = username;
    localStorage.setItem('hokm_session_token', token);
    localStorage.setItem('hokm_user_name', username);

    loggedUserDisplay.textContent = username;
    headerUserName.textContent = username;

    authSection.classList.add('hidden');
    roomActionsSection.classList.remove('hidden');
    hideAuthAlert();

    // Auto attempt room reconnect if room ID exists
    if (currentRoomId) {
      attemptRoomReconnect(currentRoomId);
    }
  }

  btnLogout.addEventListener('click', () => {
    sessionToken = '';
    currentUser = '';
    currentRoomId = null;
    localStorage.removeItem('hokm_session_token');
    localStorage.removeItem('hokm_user_name');
    localStorage.removeItem('hokm_room_id');

    headerUserName.textContent = 'Player';
    roomActionsSection.classList.add('hidden');
    authSection.classList.remove('hidden');
    inputPassword.value = '';
    showView('view-landing');
  });

  function showAuthAlert(msg, type = 'error') {
    authAlert.textContent = msg;
    authAlert.className = `auth-alert ${type}`;
    authAlert.classList.remove('hidden');
  }

  function hideAuthAlert() {
    authAlert.classList.add('hidden');
  }

  // Auto-verify session on startup
  if (sessionToken) {
    socket.emit('auth_verify_session', { token: sessionToken }, (res) => {
      if (res && res.valid) {
        onAuthSuccess(sessionToken, res.username);
      } else {
        // Invalid session token, clear
        sessionToken = '';
        localStorage.removeItem('hokm_session_token');
      }
    });
  }

  // Socket reconnect listener
  socket.on('connect', () => {
    if (sessionToken && currentRoomId) {
      attemptRoomReconnect(currentRoomId);
    }
  });

  function attemptRoomReconnect(roomId) {
    if (!sessionToken) return;
    socket.emit('reconnect_room', { token: sessionToken, roomId }, (res) => {
      if (res && res.success) {
        currentRoomId = res.roomId;
        mySeatIndex = res.seatIndex;
        updateUrlRoomCode(currentRoomId);
        saveRoomId(currentRoomId);
      }
    });
  }

  // --- LOBBY ACTIONS ---
  btnCreateRoom.addEventListener('click', () => {
    if (!sessionToken) {
      alert('Please login or create an account first.');
      return;
    }

    socket.emit('create_room', { token: sessionToken }, (res) => {
      if (res.success) {
        currentRoomId = res.roomId;
        mySeatIndex = res.seatIndex;
        isHost = true;
        saveRoomId(currentRoomId);
        updateUrlRoomCode(currentRoomId);
        showView('view-room-lobby');
      } else {
        alert(res.message || 'Could not create room.');
      }
    });
  });

  btnJoinRoom.addEventListener('click', () => {
    if (!sessionToken) {
      alert('Please login or create an account first.');
      return;
    }
    const code = inputRoomCode.value.trim().toUpperCase();
    if (!code) {
      alert('Please enter a valid 4-letter room code.');
      return;
    }

    socket.emit('join_room', { roomId: code, token: sessionToken }, (res) => {
      if (res.success) {
        currentRoomId = res.roomId;
        mySeatIndex = res.seatIndex;
        saveRoomId(currentRoomId);
        updateUrlRoomCode(currentRoomId);
        showView('view-room-lobby');
      } else {
        alert(res.message || 'Could not join room.');
      }
    });
  });

  function saveRoomId(roomId) {
    localStorage.setItem('hokm_room_id', roomId);
  }

  function updateUrlRoomCode(code) {
    const newUrl = window.location.protocol + '//' + window.location.host + window.location.pathname + '?room=' + code;
    window.history.pushState({ path: newUrl }, '', newUrl);
  }

  function copyInviteLink() {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
      alert('Invite link copied to clipboard!');
    });
  }

  btnCopyLink.addEventListener('click', copyInviteLink);
  roomCodeBadge.addEventListener('click', copyInviteLink);

  btnStartGame.addEventListener('click', () => {
    if (!currentRoomId) return;
    socket.emit('start_game', { roomId: currentRoomId }, (res) => {
      if (!res.success) alert(res.message);
    });
  });

  // --- SOCKET EVENT LISTENERS ---
  socket.on('game_state', (state) => {
    gameState = state;
    mySeatIndex = state.mySeat;
    isHost = state.isHost;
    currentRoomId = state.roomId;
    saveRoomId(currentRoomId);

    displayRoomCode.textContent = currentRoomId;
    lobbyCodeDisplay.textContent = currentRoomId;

    if (state.state === 'LOBBY') {
      showView('view-room-lobby');
      renderLobby(state);
    } else {
      showView('view-game-table');
      renderGameTable(state);
    }
  });

  socket.on('chat_message', ({ seatIndex, senderName, message }) => {
    showChatBubble(seatIndex, message);
  });

  // --- RENDER LOBBY ---
  function renderLobby(state) {
    let filledCount = 0;

    for (let s = 0; s < 4; s++) {
      const seatData = state.seats[s];
      const nameEl = document.getElementById(`lobby-seat-${s}-name`);
      const actionEl = document.getElementById(`lobby-seat-${s}-action`);
      const cardEl = document.getElementById(`lobby-seat-${s}`);

      if (seatData) {
        filledCount++;
        cardEl.classList.add('filled');

        const offlineSuffix = seatData.connected === false ? ' ⚠️ (Offline)' : '';
        nameEl.textContent = seatData.name + (seatData.isBot ? ' 🤖' : '') + offlineSuffix;

        if (isHost && s !== 0) {
          actionEl.innerHTML = `<button class="btn btn-sm btn-outline text-muted" onclick="removeSeat(${s})"><i class="fa-solid fa-user-minus"></i> Remove</button>`;
        } else {
          actionEl.innerHTML = seatData.connected === false
            ? `<span class="badge text-danger"><i class="fa-solid fa-wifi-slash me-1"></i> Disconnected</span>`
            : `<span class="badge text-gold"><i class="fa-solid fa-check me-1"></i> Ready</span>`;
        }
      } else {
        cardEl.classList.remove('filled');
        nameEl.textContent = 'Empty Seat';

        if (isHost) {
          actionEl.innerHTML = `<button class="btn btn-sm btn-gold" onclick="addBot(${s})"><i class="fa-solid fa-robot me-1"></i> Add Bot</button>`;
        } else {
          actionEl.innerHTML = `<span class="text-muted small">Waiting...</span>`;
        }
      }
    }

    if (isHost) {
      btnStartGame.disabled = filledCount < 4;
      document.getElementById('host-start-tip').textContent = filledCount < 4
        ? 'Fill all 4 seats (or add bots) to start.'
        : 'Ready to play! Click Start Hokm Game.';
    } else {
      btnStartGame.style.display = 'none';
      document.getElementById('host-start-tip').textContent = 'Waiting for host to start the game...';
    }
  }

  // Global helper window functions for bot buttons
  window.addBot = function(seatIndex) {
    socket.emit('add_bot', { roomId: currentRoomId, seatIndex });
  };
  window.removeSeat = function(seatIndex) {
    socket.emit('remove_seat', { roomId: currentRoomId, seatIndex });
  };

  // --- RENDER GAME TABLE ---
  function renderGameTable(state) {
    // Relative seat mapping:
    // Bottom: mySeat
    // Right: (mySeat + 1) % 4
    // Top: (mySeat + 2) % 4
    // Left: (mySeat + 3) % 4
    const seatPositions = {
      bottom: mySeatIndex,
      right: (mySeatIndex + 1) % 4,
      top: (mySeatIndex + 2) % 4,
      left: (mySeatIndex + 3) % 4
    };

    // Update Seat Badges & Names
    for (const [pos, seatIdx] of Object.entries(seatPositions)) {
      const seatInfo = state.seats[seatIdx];
      const seatEl = document.getElementById(`player-seat-${pos}`);
      const nameEl = document.getElementById(`name-${pos}`);
      const crownEl = document.getElementById(`crown-${pos}`);
      const cardsEl = document.getElementById(`cards-${pos}`);
      const offlineEl = document.getElementById(`offline-${pos}`);

      if (seatInfo) {
        nameEl.textContent = seatInfo.name + (seatInfo.isBot ? ' 🤖' : '');
        if (cardsEl) cardsEl.textContent = seatInfo.cardCount;

        if (offlineEl) {
          if (seatInfo.connected === false && !seatInfo.isBot) {
            offlineEl.classList.remove('hidden');
          } else {
            offlineEl.classList.add('hidden');
          }
        }
      }

      if (crownEl) {
        if (state.hakemSeat === seatIdx) {
          crownEl.classList.remove('hidden');
        } else {
          crownEl.classList.add('hidden');
        }
      }

      if (seatEl) {
        if (state.currentTurn === seatIdx && state.state === 'PLAYING') {
          seatEl.classList.add('active-turn');
        } else {
          seatEl.classList.remove('active-turn');
        }
      }
    }

    // Update Scores
    const myTeam = mySeatIndex % 2;
    const oppTeam = 1 - myTeam;

    scoreUs.textContent = state.matchScores[myTeam];
    scoreThem.textContent = state.matchScores[oppTeam];
    tricksUs.textContent = `(${state.tricksWon[myTeam]})`;
    tricksThem.textContent = `(${state.tricksWon[oppTeam]})`;

    // Update Trump Suit Display
    if (state.trumpSuit) {
      const suitInfo = getSuitSymbolAndColor(state.trumpSuit);
      trumpIconSymbol.textContent = suitInfo.symbol;
      trumpIconSymbol.className = `trump-icon ${suitInfo.colorClass}`;
    } else {
      trumpIconSymbol.textContent = '?';
      trumpIconSymbol.className = 'trump-icon';
    }

    // Render Played Cards in Table Center
    renderCenterPlayedCards(state.currentTrick, seatPositions);

    // Render Hand
    const isMyTurn = state.currentTurn === mySeatIndex && state.state === 'PLAYING' && state.currentTrick.length < 4;
    renderHandCards(state.hand, state.validCardIds || [], isMyTurn, state.state);

    // Update Status Banner
    updateStatusBanner(state);

    // Handle Modals
    handleModals(state);
  }

  function renderCenterPlayedCards(currentTrick, seatPositions) {
    const slots = {
      bottom: document.getElementById('played-slot-bottom'),
      top: document.getElementById('played-slot-top'),
      left: document.getElementById('played-slot-left'),
      right: document.getElementById('played-slot-right')
    };

    // Clear previous
    for (const slot of Object.values(slots)) {
      slot.innerHTML = '';
    }

    currentTrick.forEach(play => {
      let targetPos = null;
      for (const [pos, seatIdx] of Object.entries(seatPositions)) {
        if (seatIdx === play.seat) {
          targetPos = pos;
          break;
        }
      }

      if (targetPos && slots[targetPos]) {
        const cardEl = createCardElement(play.card);
        slots[targetPos].appendChild(cardEl);
      }
    });
  }

  function renderHandCards(hand, validCardIds, isMyTurn, gameStateType) {
    myHandContainer.innerHTML = '';

    hand.forEach(card => {
      const cardEl = createCardElement(card);
      const isValid = validCardIds.includes(card.id);

      if (isMyTurn && isValid) {
        cardEl.classList.add('playable');
        cardEl.addEventListener('click', () => {
          window.soundCtrl.playCardSlide();
          socket.emit('play_card', { roomId: currentRoomId, cardId: card.id });
        });
      } else if (gameStateType === 'TRUMP_SELECTION') {
        cardEl.classList.add('trump-preview');
      } else {
        cardEl.classList.add('disabled');
      }

      myHandContainer.appendChild(cardEl);
    });
  }

  function createCardElement(card) {
    const div = document.createElement('div');
    const suitInfo = getSuitSymbolAndColor(card.suit);
    const rankLabel = getRankLabel(card.value);

    div.className = `card-item ${suitInfo.colorClass}`;
    div.dataset.id = card.id;

    div.innerHTML = `
      <div class="card-top-corner">
        <span class="card-rank">${rankLabel}</span>
        <span class="card-suit-sm">${suitInfo.symbol}</span>
      </div>
      <div class="card-center-suit">${suitInfo.symbol}</div>
      <div class="card-bottom-corner">
        <span class="card-rank">${rankLabel}</span>
        <span class="card-suit-sm">${suitInfo.symbol}</span>
      </div>
    `;

    return div;
  }

  function getSuitSymbolAndColor(suit) {
    switch (suit) {
      case 'S': return { symbol: '♠', colorClass: 'suit-black' };
      case 'H': return { symbol: '♥', colorClass: 'suit-red' };
      case 'D': return { symbol: '♦', colorClass: 'suit-red' };
      case 'C': return { symbol: '♣', colorClass: 'suit-black' };
      default: return { symbol: '?', colorClass: 'suit-black' };
    }
  }

  function getRankLabel(val) {
    if (val === 14) return 'A';
    if (val === 13) return 'K';
    if (val === 12) return 'Q';
    if (val === 11) return 'J';
    return val.toString();
  }

  function updateStatusBanner(state) {
    if (state.state === 'CUTTING_HAKEM') {
      const lastCut = state.cutCardLog[state.cutCardLog.length - 1];
      if (lastCut) {
        const playerName = state.seats[lastCut.seat] ? state.seats[lastCut.seat].name : 'Player';
        tableStatusMsg.textContent = `Cutting for Hakem: ${playerName} got ${getRankLabel(lastCut.card.value)} of ${lastCut.card.suit}`;
      } else {
        tableStatusMsg.textContent = 'Cutting cards for Hakem...';
      }
    } else if (state.state === 'TRUMP_SELECTION') {
      const hakemName = state.seats[state.hakemSeat] ? state.seats[state.hakemSeat].name : 'Hakem';
      tableStatusMsg.textContent = `${hakemName} is choosing Trump (Hokm)...`;
    } else if (state.state === 'PLAYING') {
      const turnSeat = state.seats[state.currentTurn];
      const turnName = turnSeat ? turnSeat.name : 'Player';
      if (state.currentTurn === mySeatIndex) {
        tableStatusMsg.textContent = '⭐ IT IS YOUR TURN!';
      } else if (turnSeat && turnSeat.connected === false) {
        tableStatusMsg.textContent = `Waiting for ${turnName} (Disconnected)...`;
      } else {
        tableStatusMsg.textContent = `Waiting for ${turnName}...`;
      }
    } else if (state.state === 'ROUND_OVER') {
      tableStatusMsg.textContent = 'Round Complete!';
    } else if (state.state === 'GAME_OVER') {
      tableStatusMsg.textContent = 'Match Over!';
    }
  }

  function handleModals(state) {
    // Trump Selection Modal
    if (state.state === 'TRUMP_SELECTION' && state.hakemSeat === mySeatIndex) {
      modalTrumpSelect.classList.remove('hidden');
    } else {
      modalTrumpSelect.classList.add('hidden');
    }

    // Round Over Modal
    if (state.state === 'ROUND_OVER' && state.roundWinner) {
      modalRoundOver.classList.remove('hidden');
      const myTeam = mySeatIndex % 2;
      const isWinner = state.roundWinner.winningTeam === myTeam;

      document.getElementById('round-result-title').textContent = isWinner ? '🎉 ROUND WON!' : 'ROUND LOST';
      document.getElementById('round-result-badge').textContent = `${state.roundWinner.resultType}: +${state.roundWinner.pointsAwarded} Point(s)`;
      document.getElementById('round-result-desc').textContent = `Score: Team 1 (${state.roundWinner.tricksWon[0]} tricks) - Team 2 (${state.roundWinner.tricksWon[1]} tricks)`;
    } else {
      modalRoundOver.classList.add('hidden');
    }

    // Game Over Modal
    if (state.state === 'GAME_OVER' && state.matchWinner !== null) {
      modalGameOver.classList.remove('hidden');
      const myTeam = mySeatIndex % 2;
      const isMatchWinner = state.matchWinner === myTeam;

      if (isMatchWinner) {
        window.soundCtrl.playMatchWin();
        document.getElementById('game-over-title').textContent = '👑 VICTORY!';
        document.getElementById('game-over-desc').textContent = `Congratulations! Your team won the match ${state.matchScores[0]} - ${state.matchScores[1]}!`;
      } else {
        document.getElementById('game-over-title').textContent = 'GAME OVER';
        document.getElementById('game-over-desc').textContent = `The opposing team won the match ${state.matchScores[0]} - ${state.matchScores[1]}.`;
      }
    } else {
      modalGameOver.classList.add('hidden');
    }
  }

  // Trump Button Selection Listeners
  document.querySelectorAll('.suit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const suit = btn.dataset.suit;
      window.soundCtrl.playTrumpDeclare();
      socket.emit('declare_trump', { roomId: currentRoomId, suit });
      modalTrumpSelect.classList.add('hidden');
    });
  });

  // Quick Chat Listeners
  document.querySelectorAll('.chat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const message = btn.dataset.msg;
      socket.emit('send_chat', { roomId: currentRoomId, message });
    });
  });

  function showChatBubble(seatIndex, message) {
    const popup = document.createElement('div');
    popup.className = 'chat-bubble-popup';
    popup.textContent = message;

    // Position bubble over seat
    const seatPositions = {
      bottom: mySeatIndex,
      right: (mySeatIndex + 1) % 4,
      top: (mySeatIndex + 2) % 4,
      left: (mySeatIndex + 3) % 4
    };

    let targetPos = 'bottom';
    for (const [pos, idx] of Object.entries(seatPositions)) {
      if (idx === seatIndex) {
        targetPos = pos;
        break;
      }
    }

    const seatEl = document.getElementById(`player-seat-${targetPos}`);
    if (seatEl) {
      const rect = seatEl.getBoundingClientRect();
      popup.style.left = `${rect.left + rect.width / 2 - 40}px`;
      popup.style.top = `${rect.top - 30}px`;
      document.body.appendChild(popup);

      setTimeout(() => {
        popup.remove();
      }, 2500);
    }
  }

  // View Switcher
  function showView(viewId) {
    [viewLanding, viewRoomLobby, viewGameTable].forEach(v => v.classList.add('hidden'));

    if (viewId === 'view-landing') {
      viewLanding.classList.remove('hidden');
      gameHeader.classList.add('hidden');
    } else if (viewId === 'view-room-lobby') {
      viewRoomLobby.classList.remove('hidden');
      gameHeader.classList.add('hidden');
    } else if (viewId === 'view-game-table') {
      viewGameTable.classList.remove('hidden');
      gameHeader.classList.remove('hidden');
    }
  }

  // Sound Toggle
  document.getElementById('sound-toggle-btn').addEventListener('click', () => {
    window.soundCtrl.muted = !window.soundCtrl.muted;
    const soundIcon = document.getElementById('sound-icon');
    if (window.soundCtrl.muted) {
      soundIcon.className = 'fa-solid fa-volume-xmark';
    } else {
      soundIcon.className = 'fa-solid fa-volume-high';
    }
  });
});
