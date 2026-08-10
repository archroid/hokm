/**
 * Hokm & Coup Multi-Game Frontend Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // State variables
  let currentRoomId = localStorage.getItem('hokm_room_id') || null;
  let mySeatIndex = 0;
  let isHost = false;
  let gameState = null;
  let gameType = 'HOKM'; // 'HOKM' or 'COUP'
  let selectedGameMode = 'HOKM';
  let sessionToken = localStorage.getItem('hokm_session_token') || '';
  let currentUser = localStorage.getItem('hokm_user_name') || '';
  let authMode = 'login';
  let selectedExchangeCardIds = [];
  let pendingActionType = null;

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

  // Mode Selector Elements
  const modeCardHokm = document.getElementById('mode-card-hokm');
  const modeCardCoup = document.getElementById('mode-card-coup');

  // Lobby & Room Elements
  const inputRoomCode = document.getElementById('input-room-code');
  const btnCreateRoom = document.getElementById('btn-create-room');
  const btnJoinRoom = document.getElementById('btn-join-room');

  const viewLanding = document.getElementById('view-landing');
  const viewRoomLobby = document.getElementById('view-room-lobby');
  const viewGameTable = document.getElementById('view-game-table');
  const viewCoupTable = document.getElementById('view-coup-table');
  const gameHeader = document.getElementById('game-header');

  const displayRoomCode = document.getElementById('display-room-code');
  const lobbyCodeDisplay = document.getElementById('lobby-code-display');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnLeaveLobby = document.getElementById('btn-leave-lobby');
  const btnQuitGame = document.getElementById('btn-quit-game');
  const roomCodeBadge = document.getElementById('room-code-badge');
  const btnStartGame = document.getElementById('btn-start-game');

  function quitCurrentRoom() {
    if (!currentRoomId) {
      showView('view-landing');
      return;
    }
    if (confirm('Are you sure you want to leave the room?')) {
      socket.emit('leave_room', { roomId: currentRoomId }, () => {
        currentRoomId = null;
        localStorage.removeItem('hokm_room_id');
        showView('view-landing');
      });
    }
  }

  if (btnQuitGame) btnQuitGame.addEventListener('click', quitCurrentRoom);
  if (btnLeaveLobby) btnLeaveLobby.addEventListener('click', quitCurrentRoom);

  // Hokm Table Elements
  const scoreUs = document.getElementById('score-us');
  const scoreThem = document.getElementById('score-them');
  const tricksUs = document.getElementById('tricks-us');
  const tricksThem = document.getElementById('tricks-them');
  const trumpIconSymbol = document.getElementById('trump-icon-symbol');
  const modalTrumpSelect = document.getElementById('modal-trump-select');
  const modalRoundOver = document.getElementById('modal-round-over');
  const modalGameOver = document.getElementById('modal-game-over');
  const myHandContainer = document.getElementById('my-hand-container');
  const tableStatusMsg = document.getElementById('table-status-msg');

  // Coup Table Elements
  const coupStatusMsg = document.getElementById('coup-status-msg');
  const coupActionLog = document.getElementById('coup-action-log');
  const coupSeatsGrid = document.getElementById('coup-seats-grid');
  const coupTurnControls = document.getElementById('coup-turn-controls');
  const coupResponseControls = document.getElementById('coup-response-controls');
  const coupResponseTitle = document.getElementById('coup-response-title');
  const btnCoupPass = document.getElementById('btn-coup-pass');
  const btnCoupChallenge = document.getElementById('btn-coup-challenge');
  const btnCoupBlockToggle = document.getElementById('btn-coup-block-toggle');
  const coupBlockDropdown = document.getElementById('coup-block-dropdown');

  // Coup Modals
  const modalCoupTarget = document.getElementById('modal-coup-target');
  const coupTargetList = document.getElementById('coup-target-list');
  const btnCancelTarget = document.getElementById('btn-cancel-target');

  const modalCoupLoss = document.getElementById('modal-coup-loss');
  const coupLossCards = document.getElementById('coup-loss-cards');

  const modalCoupExchange = document.getElementById('modal-coup-exchange');
  const coupExchangeCards = document.getElementById('coup-exchange-cards');
  const btnConfirmExchange = document.getElementById('btn-confirm-exchange');

  // Check URL query parameters for auto-join room code
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    inputRoomCode.value = roomParam.toUpperCase();
    currentRoomId = roomParam.toUpperCase();
  }

  // --- GAME MODE TOGGLE ---
  modeCardHokm.addEventListener('click', () => {
    selectedGameMode = 'HOKM';
    modeCardHokm.classList.add('active');
    modeCardCoup.classList.remove('active');
  });

  modeCardCoup.addEventListener('click', () => {
    selectedGameMode = 'COUP';
    modeCardCoup.classList.add('active');
    modeCardHokm.classList.remove('active');
  });

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
        gameType = res.gameType || 'HOKM';
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

    socket.emit('create_room', { token: sessionToken, gameType: selectedGameMode }, (res) => {
      if (res.success) {
        currentRoomId = res.roomId;
        mySeatIndex = res.seatIndex;
        gameType = res.gameType || selectedGameMode;
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
        gameType = res.gameType || 'HOKM';
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

  // --- SOCKET GAME STATE LISTENER ---
  socket.on('game_state', (state) => {
    gameState = state;
    mySeatIndex = state.mySeat;
    isHost = state.isHost;
    currentRoomId = state.roomId;
    gameType = state.gameType || 'HOKM';
    saveRoomId(currentRoomId);

    displayRoomCode.textContent = currentRoomId;
    lobbyCodeDisplay.textContent = currentRoomId;

    if (state.state === 'LOBBY') {
      showView('view-room-lobby');
      renderLobby(state);
    } else if (gameType === 'COUP') {
      showView('view-coup-table');
      renderCoupGameTable(state);
    } else {
      showView('view-game-table');
      renderHokmGameTable(state);
    }
  });

  socket.on('chat_message', ({ seatIndex, senderName, message }) => {
    showChatBubble(seatIndex, message);
  });

  // --- RENDER LOBBY ---
  function renderLobby(state) {
    let filledCount = 0;
    const maxSeats = state.gameType === 'COUP' ? 6 : 4;

    for (let s = 0; s < 6; s++) {
      const cardEl = document.getElementById(`lobby-seat-${s}`);
      if (!cardEl) continue;

      if (s >= maxSeats) {
        cardEl.classList.add('hidden');
        continue;
      }
      cardEl.classList.remove('hidden');

      const seatData = state.seats[s];
      const nameEl = document.getElementById(`lobby-seat-${s}-name`);
      const actionEl = document.getElementById(`lobby-seat-${s}-action`);

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
      btnStartGame.disabled = false;
      document.getElementById('host-start-tip').textContent = 'Ready to play! Click Start Game anytime (Open seats will be auto-filled with AI bots).';
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

  // --- RENDER COUP GAME TABLE ---
  function renderCoupGameTable(state) {
    // Render Status Header & Action Log
    if (state.state === 'PLAYING') {
      const turnSeat = state.seats[state.currentTurn];
      const name = turnSeat ? turnSeat.name : 'Player';
      coupStatusMsg.textContent = state.currentTurn === mySeatIndex ? '⭐ IT IS YOUR TURN!' : `Waiting for ${name}'s move...`;
    } else if (state.state === 'ACTION_RESPONSE') {
      const actorName = state.seats[state.currentAction.actorSeat] ? state.seats[state.currentAction.actorSeat].name : 'Player';
      coupStatusMsg.textContent = `${actorName} declared ${state.currentAction.actionType}! Challenge or Block?`;
    } else if (state.state === 'BLOCK_RESPONSE') {
      const blockerName = state.seats[state.currentBlock.blockerSeat] ? state.seats[state.currentBlock.blockerSeat].name : 'Blocker';
      coupStatusMsg.textContent = `${blockerName} claimed ${state.currentBlock.claimedRole} to Block! Challenge Block?`;
    } else if (state.state === 'INFLUENCE_LOSS') {
      const loserName = state.seats[state.pendingLossPlayer.seatIndex] ? state.seats[state.pendingLossPlayer.seatIndex].name : 'Player';
      coupStatusMsg.textContent = `${loserName} must choose an influence card to reveal!`;
    } else if (state.state === 'CARD_EXCHANGE') {
      coupStatusMsg.textContent = `Ambassador Exchange in progress...`;
    } else if (state.state === 'GAME_OVER') {
      const winnerName = state.seats[state.winnerSeat] ? state.seats[state.winnerSeat].name : 'Player';
      coupStatusMsg.textContent = `👑 ${winnerName} WON THE COUP GAME!`;
    }

    // Action Log
    if (state.actionLog && state.actionLog.length > 0) {
      coupActionLog.textContent = state.actionLog[state.actionLog.length - 1];
    }

    // Render 6 Seats Grid
    coupSeatsGrid.innerHTML = '';
    state.seats.forEach((seat, idx) => {
      const seatCard = document.createElement('div');
      seatCard.className = `coup-seat-card ${state.currentTurn === idx && state.state === 'PLAYING' ? 'active-turn' : ''} ${!seat.isAlive ? 'dead-player' : ''}`;

      const offlineTag = (seat.connected === false && !seat.isBot) ? '<span class="offline-tag ms-2"><i class="fa-solid fa-wifi-slash"></i> Offline</span>' : '';
      const meBadge = idx === mySeatIndex ? ' <span class="badge text-gold">(You)</span>' : '';

      let cardsHtml = '';
      if (seat.cards && seat.cards.length > 0) {
        seat.cards.forEach(c => {
          if (c.revealed) {
            cardsHtml += `
              <div class="coup-card-item revealed-card">
                <div class="card-role-icon">${c.icon || '❌'}</div>
                <div class="card-role-name">${c.name || c.role}</div>
                <span class="badge bg-danger text-white mt-1" style="font-size:0.65rem;">REVEALED</span>
              </div>
            `;
          } else if (idx === mySeatIndex) {
            cardsHtml += `
              <div class="coup-card-item">
                <div class="card-role-icon">${c.icon || '❓'}</div>
                <div class="card-role-name" style="color:${c.color || '#fff'}">${c.name || c.role}</div>
              </div>
            `;
          } else {
            cardsHtml += `
              <div class="coup-card-item hidden-card">
                <div class="card-role-icon">🎴</div>
                <div class="card-role-name text-muted">Influence</div>
              </div>
            `;
          }
        });
      }

      seatCard.innerHTML = `
        <div class="coup-player-info">
          <span class="coup-player-name">${seat.name}${seat.isBot ? ' 🤖' : ''}${meBadge}${offlineTag}</span>
          <span class="coup-coin-badge">🪙 ${seat.coins}</span>
        </div>
        <div class="coup-cards-container">${cardsHtml}</div>
      `;

      coupSeatsGrid.appendChild(seatCard);
    });

    // Handle Turn Controls (Action Selection)
    const isMyTurn = state.currentTurn === mySeatIndex && state.state === 'PLAYING' && state.seats[mySeatIndex].isAlive;
    if (isMyTurn) {
      coupTurnControls.classList.remove('hidden');
    } else {
      coupTurnControls.classList.add('hidden');
    }

    // Handle Response Controls (Challenge / Block)
    const isResponsePhase = (state.state === 'ACTION_RESPONSE' || state.state === 'BLOCK_RESPONSE');
    let canRespond = false;
    if (isResponsePhase && state.seats[mySeatIndex] && state.seats[mySeatIndex].isAlive) {
      if (state.state === 'ACTION_RESPONSE' && state.currentAction.actorSeat !== mySeatIndex) {
        canRespond = true;
      } else if (state.state === 'BLOCK_RESPONSE' && state.currentBlock.blockerSeat !== mySeatIndex) {
        canRespond = true;
      }
    }

    if (canRespond) {
      coupResponseControls.classList.remove('hidden');
      coupResponseTitle.textContent = state.state === 'ACTION_RESPONSE'
        ? `Action Declared! Choose your response:`
        : `Block Declared! Challenge the Block?`;
    } else {
      coupResponseControls.classList.add('hidden');
    }

    // Handle Coup Modals
    handleCoupModals(state);
  }

  // --- COUP ACTION & RESPONSE BUTTON LISTENERS ---
  document.querySelectorAll('#coup-turn-controls .coup-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (!action) return;

      if (action === 'COUP' || action === 'ASSASSINATE' || action === 'STEAL') {
        pendingActionType = action;
        openTargetModal(action);
      } else {
        socket.emit('coup_declare_action', { roomId: currentRoomId, actionType: action });
      }
    });
  });

  function openTargetModal(action) {
    if (!gameState) return;
    coupTargetList.innerHTML = '';
    const aliveTargets = gameState.seats.filter(s => s && s.isAlive && s.seatIndex !== mySeatIndex);

    if (aliveTargets.length === 0) {
      alert('No valid target players available!');
      return;
    }

    aliveTargets.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'target-player-btn';
      btn.innerHTML = `
        <span style="font-size:1.1rem;">${t.name}</span>
        <span class="text-muted small">🪙 ${t.coins} Coins</span>
      `;
      btn.addEventListener('click', () => {
        socket.emit('coup_declare_action', { roomId: currentRoomId, actionType: pendingActionType, targetSeat: t.seatIndex });
        modalCoupTarget.classList.add('hidden');
      });
      coupTargetList.appendChild(btn);
    });

    modalCoupTarget.classList.remove('hidden');
  }

  btnCancelTarget.addEventListener('click', () => {
    modalCoupTarget.classList.add('hidden');
  });

  btnCoupPass.addEventListener('click', () => {
    socket.emit('coup_submit_response', { roomId: currentRoomId, responseType: 'PASS' });
  });

  btnCoupChallenge.addEventListener('click', () => {
    socket.emit('coup_submit_response', { roomId: currentRoomId, responseType: 'CHALLENGE' });
  });

  btnCoupBlockToggle.addEventListener('click', () => {
    coupBlockDropdown.classList.toggle('hidden');
  });

  document.querySelectorAll('.block-role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      coupBlockDropdown.classList.add('hidden');
      socket.emit('coup_submit_response', { roomId: currentRoomId, responseType: 'BLOCK', claimRole: role });
    });
  });

  function handleCoupModals(state) {
    // Influence Loss Modal
    if (state.state === 'INFLUENCE_LOSS' && state.pendingLossPlayer && state.pendingLossPlayer.seatIndex === mySeatIndex) {
      modalCoupLoss.classList.remove('hidden');
      coupLossCards.innerHTML = '';

      const mySeatInfo = state.seats[mySeatIndex];
      const unrevealedCards = mySeatInfo.cards.filter(c => !c.revealed);

      unrevealedCards.forEach(c => {
        const btn = document.createElement('button');
        btn.className = 'loss-card-btn';
        btn.innerHTML = `
          <span style="font-size:2rem;">${c.icon}</span>
          <span style="color:${c.color}">${c.name}</span>
        `;
        btn.addEventListener('click', () => {
          socket.emit('coup_select_loss', { roomId: currentRoomId, cardId: c.id });
          modalCoupLoss.classList.add('hidden');
        });
        coupLossCards.appendChild(btn);
      });
    } else {
      modalCoupLoss.classList.add('hidden');
    }

    // Exchange Modal
    if (state.state === 'CARD_EXCHANGE' && state.exchangeCards) {
      modalCoupExchange.classList.remove('hidden');
      coupExchangeCards.innerHTML = '';
      selectedExchangeCardIds = [];

      const choices = state.exchangeCards;
      const unrevealedCount = state.seats[mySeatIndex].cards.filter(c => !c.revealed).length;
      document.getElementById('exchange-modal-tip').textContent = `Choose exactly ${unrevealedCount} card(s) to KEEP:`;

      choices.forEach(c => {
        const cardDiv = document.createElement('div');
        cardDiv.className = 'exchange-card-item';
        cardDiv.innerHTML = `
          <span style="font-size:2rem;">${c.icon}</span>
          <span style="color:${c.color}">${c.name}</span>
        `;

        cardDiv.addEventListener('click', () => {
          if (selectedExchangeCardIds.includes(c.id)) {
            selectedExchangeCardIds = selectedExchangeCardIds.filter(id => id !== c.id);
            cardDiv.classList.remove('selected');
          } else if (selectedExchangeCardIds.length < unrevealedCount) {
            selectedExchangeCardIds.push(c.id);
            cardDiv.classList.add('selected');
          }
          btnConfirmExchange.disabled = selectedExchangeCardIds.length !== unrevealedCount;
        });

        coupExchangeCards.appendChild(cardDiv);
      });

      btnConfirmExchange.onclick = () => {
        socket.emit('coup_select_exchange', { roomId: currentRoomId, keptCardIds: selectedExchangeCardIds });
        modalCoupExchange.classList.add('hidden');
      };
    } else {
      modalCoupExchange.classList.add('hidden');
    }
  }

  // --- RENDER HOKM GAME TABLE ---
  function renderHokmGameTable(state) {
    const seatPositions = {
      bottom: mySeatIndex,
      right: (mySeatIndex + 1) % 4,
      top: (mySeatIndex + 2) % 4,
      left: (mySeatIndex + 3) % 4
    };

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

    const myTeam = mySeatIndex % 2;
    const oppTeam = 1 - myTeam;

    scoreUs.textContent = state.matchScores[myTeam];
    scoreThem.textContent = state.matchScores[oppTeam];
    tricksUs.textContent = `(${state.tricksWon[myTeam]})`;
    tricksThem.textContent = `(${state.tricksWon[oppTeam]})`;

    if (state.trumpSuit) {
      const suitInfo = getSuitSymbolAndColor(state.trumpSuit);
      trumpIconSymbol.textContent = suitInfo.symbol;
      trumpIconSymbol.className = `trump-icon ${suitInfo.colorClass}`;
    } else {
      trumpIconSymbol.textContent = '?';
      trumpIconSymbol.className = 'trump-icon';
    }

    renderCenterPlayedCards(state.currentTrick, seatPositions);

    const isMyTurn = state.currentTurn === mySeatIndex && state.state === 'PLAYING' && state.currentTrick.length < 4;
    renderHandCards(state.hand, state.validCardIds || [], isMyTurn, state.state);

    updateHokmStatusBanner(state);
    handleHokmModals(state);
  }

  function renderCenterPlayedCards(currentTrick, seatPositions) {
    const slots = {
      bottom: document.getElementById('played-slot-bottom'),
      top: document.getElementById('played-slot-top'),
      left: document.getElementById('played-slot-left'),
      right: document.getElementById('played-slot-right')
    };

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

  function updateHokmStatusBanner(state) {
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

  function handleHokmModals(state) {
    if (state.state === 'TRUMP_SELECTION' && state.hakemSeat === mySeatIndex) {
      modalTrumpSelect.classList.remove('hidden');
    } else {
      modalTrumpSelect.classList.add('hidden');
    }

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
    [viewLanding, viewRoomLobby, viewGameTable, viewCoupTable].forEach(v => v.classList.add('hidden'));

    if (viewId === 'view-landing') {
      viewLanding.classList.remove('hidden');
      gameHeader.classList.add('hidden');
    } else if (viewId === 'view-room-lobby') {
      viewRoomLobby.classList.remove('hidden');
      gameHeader.classList.add('hidden');
    } else if (viewId === 'view-game-table') {
      viewGameTable.classList.remove('hidden');
      gameHeader.classList.remove('hidden');
    } else if (viewId === 'view-coup-table') {
      viewCoupTable.classList.remove('hidden');
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
