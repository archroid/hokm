/**
 * Coup (کودتا) Game Engine
 * Standard Coup rules for 2 to 6 players with AI Bot support.
 */

const ROLES = {
  DUKE: { name: 'Duke', icon: '👑', desc: 'Tax (+3 coins). Blocks Foreign Aid.', color: '#f59e0b' },
  ASSASSIN: { name: 'Assassin', icon: '🗡️', desc: 'Assassinate (Pay 3 coins). Blocked by Contessa.', color: '#ef4444' },
  CAPTAIN: { name: 'Captain', icon: '⚔️', desc: 'Steal (Take 2 coins). Blocks Steal.', color: '#3b82f6' },
  AMBASSADOR: { name: 'Ambassador', icon: '📜', desc: 'Exchange (Draw 2 cards). Blocks Steal.', color: '#10b981' },
  CONTESSA: { name: 'Contessa', icon: '🛡️', desc: 'Blocks Assassination.', color: '#ec4899' }
};

const ACTION_TYPES = {
  INCOME: { name: 'Income', cost: 0, blockable: false, challengeable: false, role: null },
  FOREIGN_AID: { name: 'Foreign Aid', cost: 0, blockable: true, challengeable: false, role: null },
  COUP: { name: 'Coup', cost: 7, blockable: false, challengeable: false, role: null },
  TAX: { name: 'Tax', cost: 0, blockable: false, challengeable: true, role: 'DUKE' },
  ASSASSINATE: { name: 'Assassinate', cost: 3, blockable: true, challengeable: true, role: 'ASSASSIN' },
  STEAL: { name: 'Steal', cost: 0, blockable: true, challengeable: true, role: 'CAPTAIN' },
  EXCHANGE: { name: 'Exchange', cost: 0, blockable: false, challengeable: true, role: 'AMBASSADOR' }
};

class Card {
  constructor(role, id) {
    this.role = role;
    this.id = id;
    this.revealed = false;
  }
}

function createDeck() {
  const deck = [];
  const roles = Object.keys(ROLES);
  let idCounter = 1;

  // 3 of each card role = 15 cards total
  for (const role of roles) {
    for (let i = 0; i < 3; i++) {
      deck.push(new Card(role, `card_${role}_${idCounter++}`));
    }
  }
  return deck;
}

function shuffle(deck) {
  const array = [...deck];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

class CoupGame {
  constructor(roomId, maxSeats = 6) {
    this.roomId = roomId;
    this.gameType = 'COUP';
    this.maxSeats = maxSeats;
    this.seats = new Array(maxSeats).fill(null);
    this.coins = new Array(maxSeats).fill(0);
    this.influences = new Array(maxSeats).fill(null); // Array of Card objects per seat

    this.state = 'LOBBY'; // LOBBY, PLAYING, ACTION_RESPONSE, BLOCK_RESPONSE, CARD_EXCHANGE, INFLUENCE_LOSS, GAME_OVER
    this.currentTurn = 0;
    this.deck = [];
    this.winnerSeat = null;

    // Action execution context
    this.currentAction = null; // { actorSeat, actionType, targetSeat, claimedRole }
    this.currentBlock = null;  // { blockerSeat, claimedRole }
    this.pendingResponses = new Map(); // seatIndex -> 'PASS' | 'CHALLENGE' | 'BLOCK'
    this.pendingLossPlayer = null; // { seatIndex, reason, returnToState, callback }
    this.exchangeCards = null; // { seatIndex, choices: [Card] }
    this.actionLog = [];
  }

  log(msg) {
    this.actionLog.push(msg);
    if (this.actionLog.length > 30) this.actionLog.shift();
  }

  getAliveSeats() {
    const alive = [];
    for (let i = 0; i < this.maxSeats; i++) {
      if (this.seats[i] && this.influences[i] && this.influences[i].some(c => !c.revealed)) {
        alive.push(i);
      }
    }
    return alive;
  }

  isSeatAlive(seatIndex) {
    return this.influences[seatIndex] && this.influences[seatIndex].some(c => !c.revealed);
  }

  startGame() {
    this.deck = shuffle(createDeck());
    this.coins = new Array(this.maxSeats).fill(0);
    this.influences = new Array(this.maxSeats).fill(null);
    this.actionLog = [];

    // Deal 2 coins & 2 influence cards to each connected seat
    for (let i = 0; i < this.maxSeats; i++) {
      if (this.seats[i]) {
        this.coins[i] = 2;
        this.influences[i] = [this.deck.pop(), this.deck.pop()];
      }
    }

    this.state = 'PLAYING';
    const alive = this.getAliveSeats();
    this.currentTurn = alive[Math.floor(Math.random() * alive.length)];
    this.log(`Game started! ${this.seats[this.currentTurn].name} goes first.`);
  }

  nextTurn() {
    this.currentAction = null;
    this.currentBlock = null;
    this.pendingResponses.clear();
    this.pendingLossPlayer = null;

    const alive = this.getAliveSeats();
    if (alive.length === 1) {
      this.state = 'GAME_OVER';
      this.winnerSeat = alive[0];
      this.log(`👑 ${this.seats[this.winnerSeat].name} WON THE GAME!`);
      return;
    }

    // Advance turn to next alive player
    let next = (this.currentTurn + 1) % this.maxSeats;
    while (!this.isSeatAlive(next)) {
      next = (next + 1) % this.maxSeats;
    }
    this.currentTurn = next;
    this.state = 'PLAYING';
    this.log(`It is now ${this.seats[this.currentTurn].name}'s turn.`);
  }

  declareAction(actorSeat, actionType, targetSeat = null) {
    if (this.state !== 'PLAYING' || this.currentTurn !== actorSeat) {
      return { success: false, message: 'Not your turn or invalid state' };
    }

    const config = ACTION_TYPES[actionType];
    if (!config) return { success: false, message: 'Invalid action' };

    // Mandatory Coup if 10+ coins
    if (this.coins[actorSeat] >= 10 && actionType !== 'COUP') {
      return { success: false, message: 'Must perform Coup when holding 10 or more coins!' };
    }

    if (this.coins[actorSeat] < config.cost) {
      return { success: false, message: `Need at least ${config.cost} coins for ${config.name}` };
    }

    if ((actionType === 'COUP' || actionType === 'ASSASSINATE' || actionType === 'STEAL') && (targetSeat === null || targetSeat === undefined || targetSeat === actorSeat || !this.isSeatAlive(targetSeat))) {
      return { success: false, message: 'Invalid target player selected' };
    }

    // Deduct cost immediately
    this.coins[actorSeat] -= config.cost;

    this.currentAction = {
      actorSeat,
      actionType,
      targetSeat,
      claimedRole: config.role
    };

    this.log(`${this.seats[actorSeat].name} declared ${config.name}${targetSeat !== null ? ' on ' + this.seats[targetSeat].name : ''}.`);

    // Handle instant actions vs response actions
    if (actionType === 'INCOME') {
      this.coins[actorSeat] += 1;
      this.nextTurn();
      return { success: true, instant: true };
    } else if (actionType === 'COUP') {
      this.requireInfluenceLoss(targetSeat, 'COUP', () => {
        this.nextTurn();
      });
      return { success: true, instant: true };
    } else {
      // Waiting for challenges / blocks
      this.state = 'ACTION_RESPONSE';
      this.pendingResponses.clear();
      return { success: true, instant: false };
    }
  }

  submitResponse(seatIndex, responseType, claimRole = null) {
    if (this.state !== 'ACTION_RESPONSE' && this.state !== 'BLOCK_RESPONSE') {
      return { success: false, message: 'Not in response phase' };
    }
    if (!this.isSeatAlive(seatIndex)) {
      return { success: false, message: 'You are eliminated' };
    }

    if (this.state === 'ACTION_RESPONSE') {
      if (seatIndex === this.currentAction.actorSeat) {
        return { success: false, message: 'Actor cannot challenge/block own action' };
      }

      if (responseType === 'CHALLENGE') {
        if (!ACTION_TYPES[this.currentAction.actionType].challengeable) {
          return { success: false, message: 'This action cannot be challenged' };
        }
        return this.processChallenge(seatIndex, this.currentAction.actorSeat, this.currentAction.claimedRole, () => {
          // If challenge passed (actor had card), execute action!
          this.executeAction();
        }, () => {
          // If challenge failed (actor lied), action is cancelled!
          this.nextTurn();
        });
      } else if (responseType === 'BLOCK') {
        if (!ACTION_TYPES[this.currentAction.actionType].blockable) {
          return { success: false, message: 'This action cannot be blocked' };
        }
        // Validate valid block roles
        if (this.currentAction.actionType === 'FOREIGN_AID' && claimRole !== 'DUKE') return { success: false, message: 'Only Duke blocks Foreign Aid' };
        if (this.currentAction.actionType === 'ASSASSINATE' && claimRole !== 'CONTESSA') return { success: false, message: 'Only Contessa blocks Assassinate' };
        if (this.currentAction.actionType === 'STEAL' && claimRole !== 'CAPTAIN' && claimRole !== 'AMBASSADOR') return { success: false, message: 'Only Captain/Ambassador blocks Steal' };

        this.currentBlock = { blockerSeat: seatIndex, claimedRole: claimRole };
        this.log(`${this.seats[seatIndex].name} declared Block claiming ${ROLES[claimRole].name}!`);
        this.state = 'BLOCK_RESPONSE';
        this.pendingResponses.clear();
        return { success: true };
      } else if (responseType === 'PASS') {
        this.pendingResponses.set(seatIndex, 'PASS');
        this.checkAllResponsesPassed();
        return { success: true };
      }
    } else if (this.state === 'BLOCK_RESPONSE') {
      if (seatIndex === this.currentBlock.blockerSeat) {
        return { success: false, message: 'Blocker cannot challenge own block' };
      }

      if (responseType === 'CHALLENGE') {
        return this.processChallenge(seatIndex, this.currentBlock.blockerSeat, this.currentBlock.claimedRole, () => {
          // Blocker was truthful: block succeeds, action fails!
          this.log(`Block succeeded! ${ACTION_TYPES[this.currentAction.actionType].name} is blocked.`);
          this.nextTurn();
        }, () => {
          // Blocker lied: block fails, action succeeds!
          this.log(`Block failed! Proceeding with ${ACTION_TYPES[this.currentAction.actionType].name}.`);
          this.executeAction();
        });
      } else if (responseType === 'PASS') {
        this.pendingResponses.set(seatIndex, 'PASS');
        this.checkAllResponsesPassed();
        return { success: true };
      }
    }

    return { success: false, message: 'Invalid response' };
  }

  checkAllResponsesPassed() {
    const alive = this.getAliveSeats();
    let pendingCount = 0;

    for (const seat of alive) {
      if (this.state === 'ACTION_RESPONSE' && seat === this.currentAction.actorSeat) continue;
      if (this.state === 'BLOCK_RESPONSE' && seat === this.currentBlock.blockerSeat) continue;

      if (!this.pendingResponses.has(seat)) {
        pendingCount++;
      }
    }

    if (pendingCount === 0) {
      // Everyone passed!
      if (this.state === 'ACTION_RESPONSE') {
        this.executeAction();
      } else if (this.state === 'BLOCK_RESPONSE') {
        this.log(`Block accepted. Action is blocked.`);
        this.nextTurn();
      }
    }
  }

  processChallenge(challengerSeat, challengedSeat, claimedRole, onSuccessCallback, onFailureCallback) {
    this.log(`${this.seats[challengerSeat].name} CHALLENGED ${this.seats[challengedSeat].name}'s claim of ${ROLES[claimedRole].name}!`);

    const seatCards = this.influences[challengedSeat];
    const matchingCardIndex = seatCards.findIndex(c => !c.revealed && c.role === claimedRole);

    if (matchingCardIndex !== -1) {
      // Challenged player HAS the card! (Challenger loses influence, challenged gets new card)
      this.log(`${this.seats[challengedSeat].name} REVEALED ${ROLES[claimedRole].name}! Challenge FAILED.`);
      
      // Return revealed card to deck and draw new card
      const oldCard = seatCards[matchingCardIndex];
      this.deck.push(new Card(oldCard.role, `card_${oldCard.role}_${Date.now()}`));
      this.deck = shuffle(this.deck);
      seatCards[matchingCardIndex] = this.deck.pop();

      // Challenger loses influence
      this.requireInfluenceLoss(challengerSeat, 'FAILED_CHALLENGE', () => {
        onSuccessCallback();
      });
      return { success: true, challengeOutcome: 'CHALLENGER_LOST' };
    } else {
      // Challenged player DOES NOT have card! (Challenged player loses influence)
      this.log(`${this.seats[challengedSeat].name} COULD NOT SHOW ${ROLES[claimedRole].name}! Challenge SUCCEEDED.`);

      this.requireInfluenceLoss(challengedSeat, 'LIABLE_CHALLENGE', () => {
        onFailureCallback();
      });
      return { success: true, challengeOutcome: 'CHALLENGED_LOST' };
    }
  }

  requireInfluenceLoss(seatIndex, reason, callback) {
    const unrevealed = this.influences[seatIndex].filter(c => !c.revealed);
    if (unrevealed.length === 1) {
      // Auto reveal last card
      unrevealed[0].revealed = true;
      this.log(`${this.seats[seatIndex].name} lost their last influence (${ROLES[unrevealed[0].role].name}) and is ELIMINATED!`);
      callback();
    } else {
      this.state = 'INFLUENCE_LOSS';
      this.pendingLossPlayer = { seatIndex, reason, callback };
    }
  }

  selectInfluenceToLose(seatIndex, cardId) {
    if (this.state !== 'INFLUENCE_LOSS' || !this.pendingLossPlayer || this.pendingLossPlayer.seatIndex !== seatIndex) {
      return { success: false, message: 'Not your turn to reveal card' };
    }

    const card = this.influences[seatIndex].find(c => c.id === cardId && !c.revealed);
    if (!card) return { success: false, message: 'Invalid card selected' };

    card.revealed = true;
    this.log(`${this.seats[seatIndex].name} revealed influence: ${ROLES[card.role].name}`);

    const cb = this.pendingLossPlayer.callback;
    this.pendingLossPlayer = null;
    cb();
    return { success: true };
  }

  executeAction() {
    const { actorSeat, actionType, targetSeat } = this.currentAction;

    if (actionType === 'FOREIGN_AID') {
      this.coins[actorSeat] += 2;
      this.log(`${this.seats[actorSeat].name} gained 2 coins from Foreign Aid.`);
      this.nextTurn();
    } else if (actionType === 'TAX') {
      this.coins[actorSeat] += 3;
      this.log(`${this.seats[actorSeat].name} collected 3 coins from Tax (Duke).`);
      this.nextTurn();
    } else if (actionType === 'STEAL') {
      const stolen = Math.min(2, this.coins[targetSeat]);
      this.coins[targetSeat] -= stolen;
      this.coins[actorSeat] += stolen;
      this.log(`${this.seats[actorSeat].name} stole ${stolen} coins from ${this.seats[targetSeat].name}.`);
      this.nextTurn();
    } else if (actionType === 'ASSASSINATE') {
      this.requireInfluenceLoss(targetSeat, 'ASSASSINATE', () => {
        this.nextTurn();
      });
    } else if (actionType === 'EXCHANGE') {
      // Draw 2 cards from deck for Ambassador choice
      const unrevealedOwn = this.influences[actorSeat].filter(c => !c.revealed);
      const drawn = [this.deck.pop(), this.deck.pop()];
      this.exchangeCards = {
        seatIndex: actorSeat,
        choices: [...unrevealedOwn, ...drawn]
      };
      this.state = 'CARD_EXCHANGE';
      this.log(`${this.seats[actorSeat].name} is choosing 2 cards from Exchange.`);
    }
  }

  selectExchangeKeep(seatIndex, keptCardIds) {
    if (this.state !== 'CARD_EXCHANGE' || !this.exchangeCards || this.exchangeCards.seatIndex !== seatIndex) {
      return { success: false, message: 'Not your exchange phase' };
    }

    const unrevealedCount = this.influences[seatIndex].filter(c => !c.revealed).length;
    if (!Array.isArray(keptCardIds) || keptCardIds.length !== unrevealedCount) {
      return { success: false, message: `Must keep exactly ${unrevealedCount} cards` };
    }

    const choices = this.exchangeCards.choices;
    const keptCards = [];
    const returnedCards = [];

    for (const c of choices) {
      if (keptCardIds.includes(c.id)) {
        keptCards.push(c);
      } else {
        returnedCards.push(c);
      }
    }

    if (keptCards.length !== unrevealedCount) {
      return { success: false, message: 'Invalid card selection' };
    }

    // Update unrevealed cards in hand
    const revealedOwn = this.influences[seatIndex].filter(c => c.revealed);
    this.influences[seatIndex] = [...revealedOwn, ...keptCards];

    // Return unkept cards to deck and shuffle
    this.deck.push(...returnedCards);
    this.deck = shuffle(this.deck);

    this.exchangeCards = null;
    this.log(`${this.seats[seatIndex].name} completed Exchange.`);
    this.nextTurn();
    return { success: true };
  }

  // AI Bot Logic for Coup
  chooseBotMove(botSeat) {
    if (!this.isSeatAlive(botSeat)) return;

    if (this.state === 'PLAYING' && this.currentTurn === botSeat) {
      const myCoins = this.coins[botSeat];
      const aliveTargets = this.getAliveSeats().filter(s => s !== botSeat);

      if (myCoins >= 10) {
        // Mandatory Coup
        const target = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
        this.declareAction(botSeat, 'COUP', target);
      } else if (myCoins >= 7 && Math.random() < 0.6) {
        // Coup
        const target = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
        this.declareAction(botSeat, 'COUP', target);
      } else if (myCoins >= 3 && Math.random() < 0.4) {
        // Assassinate
        const target = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
        this.declareAction(botSeat, 'ASSASSINATE', target);
      } else {
        // Choose Tax, Foreign Aid, Steal, or Income
        const actions = ['TAX', 'FOREIGN_AID', 'INCOME'];
        if (aliveTargets.length > 0) actions.push('STEAL');
        const chosen = actions[Math.floor(Math.random() * actions.length)];

        let target = null;
        if (chosen === 'STEAL') {
          target = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
        }
        this.declareAction(botSeat, chosen, target);
      }
    } else if (this.state === 'ACTION_RESPONSE' || this.state === 'BLOCK_RESPONSE') {
      // Bot response to action/block
      if (Math.random() < 0.15 && this.state === 'ACTION_RESPONSE' && this.currentAction.actionType === 'FOREIGN_AID') {
        this.submitResponse(botSeat, 'BLOCK', 'DUKE');
      } else if (Math.random() < 0.15 && this.state === 'ACTION_RESPONSE' && this.currentAction.actionType === 'ASSASSINATE' && this.currentAction.targetSeat === botSeat) {
        this.submitResponse(botSeat, 'BLOCK', 'CONTESSA');
      } else if (Math.random() < 0.15 && this.state === 'ACTION_RESPONSE' && this.currentAction.actionType === 'STEAL' && this.currentAction.targetSeat === botSeat) {
        this.submitResponse(botSeat, 'BLOCK', 'CAPTAIN');
      } else {
        this.submitResponse(botSeat, 'PASS');
      }
    } else if (this.state === 'INFLUENCE_LOSS' && this.pendingLossPlayer && this.pendingLossPlayer.seatIndex === botSeat) {
      const unrevealed = this.influences[botSeat].filter(c => !c.revealed);
      if (unrevealed.length > 0) {
        this.selectInfluenceToLose(botSeat, unrevealed[0].id);
      }
    } else if (this.state === 'CARD_EXCHANGE' && this.exchangeCards && this.exchangeCards.seatIndex === botSeat) {
      const unrevealedCount = this.influences[botSeat].filter(c => !c.revealed).length;
      const choices = this.exchangeCards.choices;
      const selectedIds = choices.slice(0, unrevealedCount).map(c => c.id);
      this.selectExchangeKeep(botSeat, selectedIds);
    }
  }

  // Get sanitized public state for a given seat
  getPublicState(seatIndex = null) {
    return {
      roomId: this.roomId,
      gameType: 'COUP',
      state: this.state,
      currentTurn: this.currentTurn,
      coins: this.coins,
      actionLog: this.actionLog,
      currentAction: this.currentAction,
      currentBlock: this.currentBlock,
      winnerSeat: this.winnerSeat,
      pendingLossPlayer: this.pendingLossPlayer ? { seatIndex: this.pendingLossPlayer.seatIndex, reason: this.pendingLossPlayer.reason } : null,
      exchangeCards: (seatIndex !== null && this.exchangeCards && this.exchangeCards.seatIndex === seatIndex)
        ? this.exchangeCards.choices.map(c => ({ id: c.id, role: c.role, ...ROLES[c.role] }))
        : null,
      seats: this.seats.map((s, idx) => ({
        seatIndex: idx,
        name: s ? s.name : 'Empty',
        username: s ? (s.username || s.name) : null,
        isBot: s ? s.isBot : false,
        connected: s ? (s.connected !== false) : false,
        id: s ? s.id : null,
        coins: this.coins[idx] || 0,
        isAlive: this.isSeatAlive(idx),
        cards: this.influences[idx] ? this.influences[idx].map(c => {
          if (c.revealed || idx === seatIndex) {
            return { id: c.id, role: c.role, revealed: c.revealed, ...ROLES[c.role] };
          } else {
            return { id: c.id, role: 'HIDDEN', revealed: false };
          }
        }) : []
      }))
    };
  }

  resetToLobby() {
    this.state = 'LOBBY';
    this.coins = new Array(this.maxSeats).fill(0);
    this.influences = new Array(this.maxSeats).fill(null);
    this.deck = [];
    this.winnerSeat = null;
    this.currentAction = null;
    this.currentBlock = null;
    this.pendingResponses.clear();
    this.pendingLossPlayer = null;
    this.exchangeCards = null;
    this.actionLog = [];
  }
}

module.exports = { CoupGame, ROLES, ACTION_TYPES };
