/**
 * Hokm Card Game Engine
 * Standard 4-player Persian Hokm rules with AI Bot support.
 */

const SUITS = ['S', 'H', 'D', 'C']; // Spades, Hearts, Diamonds, Clubs
const VALUES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 12=Q, 13=K, 14=A

class Card {
  constructor(suit, value) {
    this.suit = suit;
    this.value = value;
    this.id = `${suit}_${value}`;
  }
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const val of VALUES) {
      deck.push(new Card(suit, val));
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

class HokmGame {
  constructor(roomId) {
    this.roomId = roomId;
    // Seats: 0 (South), 1 (East), 2 (North), 3 (West)
    // Team 0: Seats 0 & 2, Team 1: Seats 1 & 3
    this.seats = [null, null, null, null];
    this.matchScores = [0, 0]; // Team 0, Team 1
    this.targetMatchScore = 7;

    this.state = 'LOBBY'; // LOBBY, CUTTING_HAKEM, TRUMP_SELECTION, PLAYING, ROUND_OVER, GAME_OVER
    this.hakemSeat = 0;
    this.dealerSeat = 3;
    this.trumpSuit = null;

    this.hands = [[], [], [], []];
    this.currentTrick = []; // [{ seat, card }]
    this.tricksWon = [0, 0]; // Team 0, Team 1
    this.currentTurn = 0;
    this.leadSuit = null;
    this.roundWinner = null;
    this.matchWinner = null;
    this.cutCardLog = [];
  }

  // Determine valid cards for a player given the current lead suit
  getValidCards(seatIndex) {
    if (this.state !== 'PLAYING' || this.currentTrick.length >= 4) {
      return [];
    }

    const hand = this.hands[seatIndex];
    if (!hand || hand.length === 0) return [];

    if (this.currentTrick.length === 0) {
      return hand; // Lead player can play any card
    }

    const leadSuit = this.leadSuit;
    const sameSuitCards = hand.filter(c => c.suit === leadSuit);
    if (sameSuitCards.length > 0) {
      return sameSuitCards; // Must follow suit
    }

    // If player does not have lead suit, can play any card
    return hand;
  }

  startCutHakem() {
    this.state = 'CUTTING_HAKEM';
    this.cutCardLog = [];
    let deck = shuffle(createDeck());
    let currentCutSeat = Math.floor(Math.random() * 4);

    for (let i = 0; i < deck.length; i++) {
      const card = deck[i];
      this.cutCardLog.push({ seat: currentCutSeat, card });
      if (card.value === 14) { // First Ace
        this.hakemSeat = currentCutSeat;
        this.dealerSeat = (currentCutSeat + 3) % 4;
        break;
      }
      currentCutSeat = (currentCutSeat + 1) % 4;
    }
  }

  startNewRound() {
    this.state = 'TRUMP_SELECTION';
    this.trumpSuit = null;
    this.currentTrick = [];
    this.tricksWon = [0, 0];
    this.leadSuit = null;

    const deck = shuffle(createDeck());

    // Deal 5 cards to each player first
    this.hands = [[], [], [], []];
    
    // First 5 cards dealt to Hakem, then to others
    for (let s = 0; s < 4; s++) {
      this.hands[s] = deck.slice(s * 5, (s + 1) * 5);
    }
    
    // Store remaining deck to deal after trump selection
    this.remainingDeck = deck.slice(20);
    this.currentTurn = this.hakemSeat;
  }

  setTrump(suit) {
    if (!SUITS.includes(suit)) return false;
    this.trumpSuit = suit;

    // Deal remaining 8 cards to each player (4 cards then 4 cards)
    for (let round = 0; round < 2; round++) {
      for (let s = 0; s < 4; s++) {
        const offset = (round * 4 * 4) + (s * 4);
        const fourCards = this.remainingDeck.slice(offset, offset + 4);
        this.hands[s].push(...fourCards);
      }
    }
    delete this.remainingDeck;

    // Sort all hands for neat presentation (Group by suit, then by value desc)
    for (let s = 0; s < 4; s++) {
      this.sortHand(s);
    }

    this.state = 'PLAYING';
    this.currentTurn = this.hakemSeat; // Hakem leads first trick
    return true;
  }

  sortHand(seatIndex) {
    const suitOrder = { 'S': 0, 'H': 1, 'C': 2, 'D': 3 };
    if (this.trumpSuit) {
      // Put trump suit first
      suitOrder[this.trumpSuit] = -1;
    }
    this.hands[seatIndex].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) {
        return suitOrder[a.suit] - suitOrder[b.suit];
      }
      return b.value - a.value;
    });
  }

  playCard(seatIndex, cardId) {
    if (this.state !== 'PLAYING') return { success: false, message: 'Game not in playing state' };
    if (this.currentTrick.length >= 4) return { success: false, message: 'Current trick is complete and clearing' };
    if (this.currentTurn !== seatIndex) return { success: false, message: 'Not your turn' };

    const hand = this.hands[seatIndex];
    const cardIndex = hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, message: 'Card not in hand' };

    const card = hand[cardIndex];
    const validCards = this.getValidCards(seatIndex);
    const isValid = validCards.some(c => c.id === cardId);

    if (!isValid) {
      return { success: false, message: 'Must follow led suit if possible' };
    }

    // Execute play
    hand.splice(cardIndex, 1);
    if (this.currentTrick.length === 0) {
      this.leadSuit = card.suit;
    }
    this.currentTrick.push({ seat: seatIndex, card });

    let trickComplete = false;
    let trickWinnerSeat = null;

    if (this.currentTrick.length === 4) {
      trickComplete = true;
      trickWinnerSeat = this.evaluateTrick();
      const winningTeam = trickWinnerSeat % 2;
      this.tricksWon[winningTeam]++;
      this.currentTurn = trickWinnerSeat;

      // Check end of round conditions (First to 7 tricks)
      if (this.tricksWon[0] >= 7 || this.tricksWon[1] >= 7 || (this.tricksWon[0] + this.tricksWon[1] === 13)) {
        this.finishRound();
      }
    } else {
      this.currentTurn = (this.currentTurn + 1) % 4;
    }

    return {
      success: true,
      card,
      trickComplete,
      trickWinnerSeat,
      state: this.state
    };
  }

  evaluateTrick() {
    let winningPlay = this.currentTrick[0];

    for (let i = 1; i < this.currentTrick.length; i++) {
      const play = this.currentTrick[i];
      const currentBestCard = winningPlay.card;
      const challengerCard = play.card;

      // Trump beats non-trump
      if (challengerCard.suit === this.trumpSuit && currentBestCard.suit !== this.trumpSuit) {
        winningPlay = play;
      }
      // Higher trump beats lower trump
      else if (challengerCard.suit === this.trumpSuit && currentBestCard.suit === this.trumpSuit) {
        if (challengerCard.value > currentBestCard.value) {
          winningPlay = play;
        }
      }
      // Followed suit higher value beats followed suit lower value (if current best is not trump)
      else if (challengerCard.suit === this.leadSuit && currentBestCard.suit === this.leadSuit) {
        if (challengerCard.value > currentBestCard.value) {
          winningPlay = play;
        }
      }
    }

    return winningPlay.seat;
  }

  finishRound() {
    this.state = 'ROUND_OVER';
    const team0Tricks = this.tricksWon[0];
    const team1Tricks = this.tricksWon[1];
    const hakemTeam = this.hakemSeat % 2;
    const nonHakemTeam = 1 - hakemTeam;

    let winningTeam = team0Tricks > team1Tricks ? 0 : 1;
    let pointsAwarded = 1;
    let resultType = 'NORMAL'; // NORMAL, KOT, HAKEM_KOT, BAM

    const winnerTricks = this.tricksWon[winningTeam];
    const loserTricks = this.tricksWon[1 - winningTeam];

    if (winnerTricks === 13) {
      pointsAwarded = 3;
      resultType = 'BAM';
    } else if (loserTricks === 0) {
      if (winningTeam === nonHakemTeam) {
        // Hakem team got 0 tricks! Hakem Kot!
        pointsAwarded = 3;
        resultType = 'HAKEM_KOT';
      } else {
        // Non-Hakem team got 0 tricks! Kot!
        pointsAwarded = 2;
        resultType = 'KOT';
      }
    }

    this.matchScores[winningTeam] += pointsAwarded;
    this.roundWinner = {
      winningTeam,
      pointsAwarded,
      resultType,
      tricksWon: [...this.tricksWon]
    };

    // Determine next Hakem
    if (winningTeam === hakemTeam) {
      // Hakem won round, stays Hakem
    } else {
      // Hakem lost, next player in sequence becomes Hakem
      this.hakemSeat = (this.hakemSeat + 1) % 4;
      this.dealerSeat = (this.hakemSeat + 3) % 4;
    }

    // Check Match Win (First team to 7 points)
    if (this.matchScores[0] >= this.targetMatchScore || this.matchScores[1] >= this.targetMatchScore) {
      this.state = 'GAME_OVER';
      this.matchWinner = this.matchScores[0] >= this.targetMatchScore ? 0 : 1;
    }
  }

  // AI Decision Logic for Bots
  chooseBotTrump(seatIndex) {
    const hand = this.hands[seatIndex];
    const suitCounts = { 'S': 0, 'H': 0, 'D': 0, 'C': 0 };
    const suitPower = { 'S': 0, 'H': 0, 'D': 0, 'C': 0 };

    hand.forEach(c => {
      suitCounts[c.suit]++;
      suitPower[c.suit] += c.value;
    });

    let bestSuit = 'S';
    let maxScore = -1;

    for (const suit of SUITS) {
      // Score based on count + card ranks
      const score = (suitCounts[suit] * 10) + suitPower[suit];
      if (score > maxScore) {
        maxScore = score;
        bestSuit = suit;
      }
    }

    return bestSuit;
  }

  chooseBotCard(seatIndex) {
    const hand = this.hands[seatIndex];
    const validCards = this.getValidCards(seatIndex);

    if (validCards.length === 1) return validCards[0];

    const isLead = this.currentTrick.length === 0;

    if (isLead) {
      // Lead strategy: Play high trump or Ace of non-trump
      const aces = validCards.filter(c => c.value === 14);
      if (aces.length > 0) return aces[0];

      // Otherwise play lowest card of longest suit
      return validCards.sort((a, b) => a.value - b.value)[0];
    }

    // Following turn:
    const myTeam = seatIndex % 2;

    // Check who is currently winning the trick
    let currentBestPlay = this.currentTrick[0];
    for (let i = 1; i < this.currentTrick.length; i++) {
      const play = this.currentTrick[i];
      const cur = currentBestPlay.card;
      const ch = play.card;

      if (ch.suit === this.trumpSuit && cur.suit !== this.trumpSuit) {
        currentBestPlay = play;
      } else if (ch.suit === this.trumpSuit && cur.suit === this.trumpSuit && ch.value > cur.value) {
        currentBestPlay = play;
      } else if (ch.suit === this.leadSuit && cur.suit === this.leadSuit && ch.value > cur.value) {
        currentBestPlay = play;
      }
    }

    const partnerWinning = (currentBestPlay.seat % 2 === myTeam);

    if (partnerWinning) {
      // Partner is winning: play lowest valid card
      return validCards.sort((a, b) => a.value - b.value)[0];
    } else {
      // Opponent winning: try to win trick with minimum necessary card
      const winningCards = validCards.filter(c => {
        if (c.suit === this.trumpSuit && currentBestPlay.card.suit !== this.trumpSuit) return true;
        if (c.suit === this.trumpSuit && currentBestPlay.card.suit === this.trumpSuit && c.value > currentBestPlay.card.value) return true;
        if (c.suit === this.leadSuit && currentBestPlay.card.suit === this.leadSuit && c.value > currentBestPlay.card.value) return true;
        return false;
      });

      if (winningCards.length > 0) {
        // Play lowest winning card
        return winningCards.sort((a, b) => a.value - b.value)[0];
      } else {
        // Can't win: throw away lowest non-trump card
        const nonTrumps = validCards.filter(c => c.suit !== this.trumpSuit);
        if (nonTrumps.length > 0) {
          return nonTrumps.sort((a, b) => a.value - b.value)[0];
        }
        return validCards.sort((a, b) => a.value - b.value)[0];
      }
    }
  }

  // Get sanitized state visible to a specific seat
  getPublicState(seatIndex = null) {
    return {
      roomId: this.roomId,
      state: this.state,
      hakemSeat: this.hakemSeat,
      dealerSeat: this.dealerSeat,
      trumpSuit: this.trumpSuit,
      matchScores: this.matchScores,
      tricksWon: this.tricksWon,
      currentTurn: this.currentTurn,
      leadSuit: this.leadSuit,
      currentTrick: this.currentTrick,
      roundWinner: this.roundWinner,
      matchWinner: this.matchWinner,
      cutCardLog: this.cutCardLog,
      seats: this.seats.map((s, idx) => ({
        seatIndex: idx,
        name: s ? s.name : 'Empty',
        username: s ? (s.username || s.name) : null,
        isBot: s ? s.isBot : false,
        connected: s ? (s.connected !== false) : false,
        id: s ? s.id : null,
        cardCount: this.hands[idx] ? this.hands[idx].length : 0
      })),
      hand: seatIndex !== null && this.hands[seatIndex] ? this.hands[seatIndex] : [],
      validCardIds: seatIndex !== null && seatIndex === this.currentTurn && this.state === 'PLAYING'
        ? this.getValidCards(seatIndex).map(c => c.id)
        : []
    };
  }
}

module.exports = { HokmGame, Card, SUITS, VALUES };
