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
     * Updates Firestore after game completion:
     * - Winning side moves get +Score (e.g. +1.0)
     * - Losing side moves get -Score (e.g. -1.0)
     * - Draws get slight adjustment
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
          scoreDelta = (movingColor === winner) ? 1.0 : -1.0;
        } else {
          scoreDelta = 0.1; // Mild reward for draw stability
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
