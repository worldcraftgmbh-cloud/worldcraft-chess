/**
 * Firebase Firestore Service for Global AI Learning & Persistence
 * Project: worldcraft-schach
 *
 * Implements:
 * - Real-time global stats listener (total_games, ai_wins, player_wins, draws, total_positions)
 * - Position knowledge querying (best scored move for a FEN state)
 * - Post-game credit assignment (rewards for winning moves, penalties for losing moves)
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FirebaseService = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const firebaseConfig = {
    apiKey: "AIzaSyAgTanP3TWi7cPQmwzGmFA0mmfo6HFoGq0",
    authDomain: "worldcraft-schach.firebaseapp.com",
    projectId: "worldcraft-schach",
    storageBucket: "worldcraft-schach.firebasestorage.app",
    messagingSenderId: "140634400169",
    appId: "1:140634400169:web:3ca2cebbc93c7db0f410b8",
    measurementId: "G-3QXVHBL7S3"
  };

  class FirebaseService {
    constructor() {
      this.app = null;
      this.db = null;
      this.isInitialized = false;
      this.cachedStats = {
        total_games: 0,
        ai_wins: 0,
        player_wins: 0,
        draws: 0,
        total_positions: 0
      };

      this.init();
    }

    init() {
      try {
        if (typeof firebase !== 'undefined') {
          if (!firebase.apps.length) {
            this.app = firebase.initializeApp(firebaseConfig);
          } else {
            this.app = firebase.app();
          }
          this.db = firebase.firestore();
          this.isInitialized = true;
          console.log('[FirebaseService] Firestore successfully initialized.');
        } else {
          console.warn('[FirebaseService] Firebase SDK not loaded on window.');
        }
      } catch (err) {
        console.warn('[FirebaseService] Initialization error:', err);
      }
    }

    /**
     * Converts a standard chess FEN into a clean, safe Firestore document ID.
     * Replaces slashes with underscores and normalizes piece placement + active turn + castling rights.
     */
    fenToPositionKey(fen) {
      if (!fen) return 'start';
      const parts = fen.trim().split(/\s+/);
      const piecePlacement = parts[0].replace(/\//g, '_');
      const activeColor = parts[1] || 'w';
      const castling = parts[2] || '-';
      const ep = parts[3] || '-';
      return `${piecePlacement}__${activeColor}__${castling}__${ep}`;
    }

    /**
     * Converts move object to standard UCI string (e.g. 'e2e4', 'e7e8q')
     */
    moveToUci(move) {
      if (typeof move === 'string') return move;
      const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      const fromF = files[move.from % 8] + (8 - Math.floor(move.from / 8));
      const toF = files[move.to % 8] + (8 - Math.floor(move.to / 8));
      const promo = move.promotion ? move.promotion.toLowerCase() : '';
      return `${fromF}${toF}${promo}`;
    }

    /**
     * Listens to live updates of `global_stats` in collection `ai_knowledge`
     */
    subscribeGlobalStats(callback) {
      if (!this.isInitialized || !this.db) {
        if (callback) callback(this.cachedStats);
        return () => {};
      }

      const docRef = this.db.collection('ai_knowledge').doc('global_stats');
      return docRef.onSnapshot((snap) => {
        if (snap.exists) {
          const data = snap.data();
          this.cachedStats = {
            total_games: Number(data.total_games || 0),
            ai_wins: Number(data.ai_wins || 0),
            player_wins: Number(data.player_wins || 0),
            draws: Number(data.draws || 0),
            total_positions: Number(data.total_positions || 0)
          };
          if (callback) callback(this.cachedStats);
        } else {
          // Initialize global_stats doc if missing
          docRef.set({
            total_games: 0,
            ai_wins: 0,
            player_wins: 0,
            draws: 0,
            total_positions: 0
          }, { merge: true });
        }
      }, (err) => {
        console.warn('[FirebaseService] Error listening to global_stats:', err);
      });
    }

    /**
     * Queries Firestore for knowledge of the current board position.
     * Returns: { moves: { [uciMove]: score } } or null if unknown
     */
    async getPositionKnowledge(fen) {
      if (!this.isInitialized || !this.db) return null;

      const posKey = this.fenToPositionKey(fen);
      try {
        // Look up position in subcollection ai_knowledge/global_stats/positions
        const subDoc = await this.db
          .collection('ai_knowledge')
          .doc('global_stats')
          .collection('positions')
          .doc(posKey)
          .get();

        if (subDoc.exists) {
          return subDoc.data();
        }

        // Check top-level positions collection fallback
        const topDoc = await this.db.collection('positions').doc(posKey).get();
        if (topDoc.exists) {
          return topDoc.data();
        }

        return null;
      } catch (err) {
        console.warn('[FirebaseService] Error fetching position knowledge:', err);
        return null;
      }
    }

    /**
     * Calculates an Attack Priority Score for a given legal move:
     * - Priorität 1: Züge, die Schach bieten oder gegnerische Figuren schlagen.
     * - Priorität 2: Züge, die Figuren in die gegnerische Spielfeldhälfte vorrücken (Raumgewinn).
     * - Priorität 3: Bauernumwandlung aktiv forcieren.
     */
    calculateAttackBonus(game, move) {
      if (!game || !move) return 0;
      let score = 0;
      const turn = game.turn;
      const oppColor = (turn === 'w') ? 'b' : 'w';

      const fromRow = Math.floor(move.from / 8);
      const toRow = Math.floor(move.to / 8);

      // 1. Priorität 1: Schach bieten (Check)
      let givesCheck = false;
      if (typeof game.makeMoveDirect === 'function' && typeof game.unmakeMoveDirect === 'function') {
        const state = game.makeMoveDirect(move);
        givesCheck = Boolean(typeof game.isInCheck === 'function' && game.isInCheck(oppColor));
        game.unmakeMoveDirect(state);
      }
      if (givesCheck) {
        score += 1000;
      }

      // Priorität 1: Gegners Figuren schlagen (Capture)
      if (move.captured || move.isEnPassant) {
        score += 800;
        const capturedType = move.captured ? (move.captured.type || '').toLowerCase() : 'p';
        const pieceValues = { q: 90, r: 50, b: 35, n: 35, p: 15, k: 0 };
        score += (pieceValues[capturedType] || 15) * 5;
      }

      // 2. Priorität 3: Bauernumwandlung aktiv forcieren
      if (move.promotion) {
        score += 1200; // Unmittelbare Damen-Beförderung
      } else if (move.piece && move.piece.type === 'p') {
        // Bauer rückt tief vor
        if (turn === 'w') {
          if (toRow === 1) score += 600; // 7. Reihe
          else if (toRow === 2) score += 300; // 6. Reihe
        } else {
          if (toRow === 6) score += 600; // 2. Reihe
          else if (toRow === 5) score += 300; // 3. Reihe
        }
      }

      // 3. Priorität 2: Züge, die Figuren in die gegnerische Spielfeldhälfte vorrücken (Raumgewinn)
      const isInOpponentHalf = (turn === 'w') ? (toRow <= 3) : (toRow >= 4);
      if (isInOpponentHalf) {
        score += 250;
      }

      const forwardAdvancement = (turn === 'w') ? (fromRow - toRow) : (toRow - fromRow);
      if (forwardAdvancement > 0) {
        score += forwardAdvancement * 60;
      }

      return score;
    }

    /**
     * Wählt den besten Zug für die Royale KI Engine unter Berücksichtigung von:
     * 1. 15%-Exploration-Rate (kalkulierte offensive Züge testen)
     * 2. Firestore-Wissen mit aggressivem Entscheidungs-Filter bei ähnlichen Werten
     * 3. Offensiver Fallback bei unbekannten Stellungen
     */
    selectRoyaleAIMove(game, knowledge, options = {}) {
      const legalMoves = game.generateLegalMoves(game.turn);
      if (!legalMoves || legalMoves.length === 0) return null;

      const explorationRate = (typeof options.explorationRate === 'number') ? options.explorationRate : 0.15;
      const isExploring = Math.random() < explorationRate;

      // Vorab Attack-Score für alle legalen Züge ermitteln
      const scoredMoves = legalMoves.map(m => {
        const uci = this.moveToUci(m);
        const attackScore = this.calculateAttackBonus(game, m);
        let firestoreScore = -Infinity;
        if (knowledge && knowledge.moves && knowledge.moves[uci] !== undefined) {
          firestoreScore = Number(knowledge.moves[uci]);
        }
        return { move: m, uci, attackScore, firestoreScore };
      });

      // --- Modus A: 15% Exploration (kalkulierte offensive Züge testen) ---
      if (isExploring) {
        scoredMoves.sort((a, b) => b.attackScore - a.attackScore);
        const topAttack = scoredMoves[0].attackScore;
        const offensiveCandidates = scoredMoves.filter(item => item.attackScore >= Math.max(100, topAttack - 150));
        const pool = offensiveCandidates.length > 0 ? offensiveCandidates : scoredMoves.slice(0, Math.min(3, scoredMoves.length));
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        console.log(`[Royale KI] ⚔️ 15% Exploration: Teste kalkulierten Angriffszug: ${chosen.uci} (Attack-Score: ${chosen.attackScore})`);
        return chosen.move;
      }

      // --- Modus B: 85% Exploitation von Firestore-Wissen ---
      const positiveKnowledgeMoves = scoredMoves.filter(item => !isNaN(item.firestoreScore) && item.firestoreScore > 0);

      if (positiveKnowledgeMoves.length > 0) {
        let maxFirestoreScore = -Infinity;
        positiveKnowledgeMoves.forEach(item => {
          if (item.firestoreScore > maxFirestoreScore) maxFirestoreScore = item.firestoreScore;
        });

        // "Ähnliche Werte": Alle Züge innerhalb eines engen Korridors
        const threshold = Math.max(0.01, maxFirestoreScore - 0.75);
        const candidateBand = positiveKnowledgeMoves.filter(item => item.firestoreScore >= threshold);

        // Aggressiver Entscheidungs-Filter: Bei ähnlichen Werten immer den offensiveren Zug bevorzugen!
        candidateBand.sort((a, b) => {
          if (b.attackScore !== a.attackScore) {
            return b.attackScore - a.attackScore; // Höhere Angriffspriorität gewinnt
          }
          return b.firestoreScore - a.firestoreScore;
        });

        const bestAttackScore = candidateBand[0].attackScore;
        const topOffensiveBand = candidateBand.filter(item => item.attackScore === bestAttackScore);
        const chosen = topOffensiveBand[Math.floor(Math.random() * topOffensiveBand.length)];

        console.log(`[Royale KI] 🎯 Firestore-Wissen angewendet (Aggressiver Filter): ${chosen.uci} (Firestore: ${chosen.firestoreScore.toFixed(2)}, Attack-Bonus: ${chosen.attackScore})`);
        return chosen.move;
      }

      // --- Modus C: Unbekannte Stellung -> kalkulierter offensiver Zug statt rein passivem Zufallszug ---
      scoredMoves.sort((a, b) => b.attackScore - a.attackScore);
      const topAttack = scoredMoves[0].attackScore;
      const topOffensive = scoredMoves.filter(item => item.attackScore >= Math.max(100, topAttack - 150));
      const pool = topOffensive.length > 0 ? topOffensive : scoredMoves;
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      console.log(`[Royale KI] 🚀 Unbekannte Stellung -> offensiv orientierter Zug: ${chosen.uci} (Attack: ${chosen.attackScore})`);
      return chosen.move;
    }

    /**
     * Updates Firestore after game completion:
     * - Sieg: +3.0 Punkte (extrem belohnen)
     * - Remis: nur noch +0.05 Punkte (drastisch abwerten, Mauern unattraktiv machen)
     * - Niederlage: -1.0 Punkte
     * - Updates total_games, ai_wins, player_wins, draws, total_positions
     */
    async recordGameOutcome(gameRecord) {
      if (!this.isInitialized || !this.db) {
        console.warn('[FirebaseService] Firestore is not initialized or offline.');
        return;
      }

      const { moveHistory, winner, isDraw, aiColor } = gameRecord;
      if (!moveHistory || moveHistory.length === 0) return;

      const inc = firebase.firestore.FieldValue.increment;

      // 1. Prepare global_stats update
      const statsRef = this.db.collection('ai_knowledge').doc('global_stats');
      const statsUpdate = {
        total_games: inc(1),
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      };

      if (isDraw) {
        statsUpdate.draws = inc(1);
      } else if (winner === aiColor) {
        statsUpdate.ai_wins = inc(1);
      } else {
        statsUpdate.player_wins = inc(1);
      }

      // 2. Aggregate and deduplicate position moves within this game
      const posMap = new Map();

      for (let i = 0; i < moveHistory.length; i++) {
        const item = moveHistory[i];
        if (!item || !item.fenBefore) continue;

        const posKey = this.fenToPositionKey(item.fenBefore);
        const moveUci = this.moveToUci(item);
        const movingColor = item.piece ? item.piece.color : (i % 2 === 0 ? 'w' : 'b');

        let scoreDelta = 0;
        if (!isDraw && winner) {
          scoreDelta = (movingColor === winner) ? 3.0 : -1.0; // Sieg +3.0, Niederlage -1.0
        } else {
          scoreDelta = 0.05; // Remis nur noch +0.05 (drastisch abgewertet gegen Mauern)
        }

        if (!posMap.has(posKey)) {
          posMap.set(posKey, {
            fen: item.fenBefore,
            moves: {}
          });
        }
        const entry = posMap.get(posKey);
        entry.moves[moveUci] = (entry.moves[moveUci] || 0) + scoreDelta;
      }

      // 3. Write all positions and fully await all operations
      const positionsColl = this.db.collection('ai_knowledge').doc('global_stats').collection('positions');
      const topPositionsColl = this.db.collection('positions');

      let newPositionsCount = 0;
      const writePromises = [];

      for (const [posKey, data] of posMap.entries()) {
        const docRef = positionsColl.doc(posKey);
        const topDocRef = topPositionsColl.doc(posKey);

        const moveIncrements = {};
        for (const [uci, delta] of Object.entries(data.moves)) {
          moveIncrements[uci] = inc(delta);
        }

        const task = (async () => {
          try {
            const snap = await docRef.get();
            if (!snap.exists) {
              newPositionsCount++;
            }
            const updatePayload = {
              fen: data.fen,
              lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
              moves: moveIncrements
            };

            await Promise.all([
              docRef.set(updatePayload, { merge: true }),
              topDocRef.set(updatePayload, { merge: true })
            ]);
          } catch (e) {
            console.warn('[FirebaseService] Error persisting position knowledge:', posKey, e);
          }
        })();

        writePromises.push(task);
      }

      // Guarantee all position writes are completed before continuing!
      await Promise.all(writePromises);

      // 4. Update stats including new unique positions
      if (newPositionsCount > 0) {
        statsUpdate.total_positions = inc(newPositionsCount);
      }
      await statsRef.set(statsUpdate, { merge: true });

      console.log(`[FirebaseService] Match persistiert: ${posMap.size} Stellungen aktualisiert (+${newPositionsCount} neu). Total games incremented.`);
    }
  }

  return FirebaseService;
});
