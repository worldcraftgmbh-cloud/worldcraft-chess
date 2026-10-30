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
     * - Taktische Matt-Suchfunktion: Sofort-Matt (+50000), unausweichliches Matt in 2 (+25000)
     * - Malus für Patt (-100000) und 3-fache Wiederholung (-50000) bei Materialvorteil
     * - Freibauern unaufhaltsam vorrücken (+800 bis +3500)
     * - Gegnerischen König an den Brettrand drängen (Mattnetz zuziehen)
     * - Endspiel-Resilienz bei Figurenunterzahl
     */
    calculateAttackBonus(game, move) {
      if (!game || !move) return 0;
      let score = 0;
      const turn = game.turn;
      const oppColor = (turn === 'w') ? 'b' : 'w';

      const fromRow = Math.floor(move.from / 8);
      const toRow = Math.floor(move.to / 8);
      const fromCol = move.from % 8;
      const toCol = move.to % 8;

      // 1. Material- & Figuren-Inventur
      const pieceValTable = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
      let myMaterial = 0;
      let oppMaterial = 0;
      let myKingSq = -1;
      let oppKingSq = -1;
      let ownPieceCount = 0;

      if (Array.isArray(game.board)) {
        for (let sq = 0; sq < 64; sq++) {
          const p = game.board[sq];
          if (p) {
            const val = pieceValTable[p.type] || 0;
            if (p.color === turn) {
              myMaterial += val;
              ownPieceCount++;
              if (p.type === 'k') myKingSq = sq;
            } else {
              oppMaterial += val;
              if (p.type === 'k') oppKingSq = sq;
            }
          }
        }
      }
      const hasMaterialAdvantage = (myMaterial > oppMaterial + 100);

      // 2. Taktische Stellungsanalyse nach Zugaussicht
      let givesCheck = false;
      let isImmediateMate = false;
      let isImmediateStalemate = false;
      let isForcedMateIn2 = false;
      let isThreefoldRepetition = false;

      if (typeof game.makeMoveDirect === 'function' && typeof game.unmakeMoveDirect === 'function') {
        const state = game.makeMoveDirect(move);
        const oppLegalMoves = game.generateLegalMoves(oppColor);
        givesCheck = Boolean(typeof game.isInCheck === 'function' && game.isInCheck(oppColor));

        if (givesCheck && oppLegalMoves.length === 0) {
          isImmediateMate = true;
        } else if (!givesCheck && oppLegalMoves.length === 0) {
          isImmediateStalemate = true;
        }

        if (typeof game.isThreefoldRepetition === 'function' && game.isThreefoldRepetition()) {
          isThreefoldRepetition = true;
        }

        // Taktische 2-Zug Matt-Suche: Wenn Schach gegeben wird, prüfe ob jeder gegnerische Ausweg zum Sofort-Matt führt
        if (givesCheck && oppLegalMoves.length > 0 && oppLegalMoves.length <= 6) {
          let allRepliesLeadToMate = true;
          for (let oi = 0; oi < oppLegalMoves.length; oi++) {
            const oppState = game.makeMoveDirect(oppLegalMoves[oi]);
            const followups = game.generateLegalMoves(turn);
            let hasImmediateMateFollowup = false;
            for (let fi = 0; fi < followups.length; fi++) {
              const fState = game.makeMoveDirect(followups[fi]);
              if (game.isInCheck(oppColor) && game.generateLegalMoves(oppColor).length === 0) {
                hasImmediateMateFollowup = true;
                game.unmakeMoveDirect(fState);
                break;
              }
              game.unmakeMoveDirect(fState);
            }
            game.unmakeMoveDirect(oppState);
            if (!hasImmediateMateFollowup) {
              allRepliesLeadToMate = false;
              break;
            }
          }
          if (allRepliesLeadToMate) {
            isForcedMateIn2 = true;
          }
        }

        // Gegnerischen König an den Rand drängen & Mattnetz zuziehen (bei Materialvorteil)
        if (hasMaterialAdvantage && oppKingSq !== -1) {
          const kRow = Math.floor(oppKingSq / 8);
          const kCol = oppKingSq % 8;
          const centerDist = Math.max(Math.abs(3.5 - kRow), Math.abs(3.5 - kCol));
          score += centerDist * 220; // Massiver Bonus je näher der gegnerische König am Rand/Ecke ist

          // Bewegungsradius des gegnerischen Königs einschnüren
          const oppKingLegalMoves = oppLegalMoves.filter(m => m.piece && m.piece.type === 'k').length;
          score += (8 - oppKingLegalMoves) * 80;

          // Eigener König rückt heran, um das Mattnetz zuzuziehen
          if (myKingSq !== -1) {
            const mRow = Math.floor(myKingSq / 8);
            const mCol = myKingSq % 8;
            const distBetweenKings = Math.max(Math.abs(mRow - kRow), Math.abs(mCol - kCol));
            score += (7 - distBetweenKings) * 120;
          }
        }

        game.unmakeMoveDirect(state);
      }

      // --- TAKTISCHE REGELN MIT HÖCHSTER PRIORITÄT ---
      if (isImmediateMate) {
        return 50000; // Unwiderruflich Matt in 1 -> MUSS gespielt werden!
      }
      if (isForcedMateIn2) {
        score += 25000; // Forciertes Matt in 2
      }

      // Harter Malus für Patt & 3-fache Wiederholung bei Führung (kein Remis akzeptieren!)
      if (hasMaterialAdvantage) {
        if (isImmediateStalemate) {
          score -= 100000; // NIEMALS Patt setzen bei Führung!
        }
        if (isThreefoldRepetition) {
          score -= 50000; // Keine Zugwiederholung bei Materialvorteil!
        }
      } else if (ownPieceCount <= 2 && isImmediateStalemate) {
        // Bei hoffnungslosem Rückstand ist Patt ein gewollter Rettungsanker
        score += 8000;
      }

      // 3. Schach bieten & Figuren schlagen
      if (givesCheck) {
        score += 1200;
      }

      if (move.captured || move.isEnPassant) {
        score += 900;
        const capturedType = move.captured ? (move.captured.type || '').toLowerCase() : 'p';
        const capturedVal = pieceValTable[capturedType] || 100;
        score += capturedVal * 2.5;
      }

      // 4. Freibauern & Bauernumwandlung aktiv forcieren
      const forwardAdvancement = (turn === 'w') ? (fromRow - toRow) : (toRow - fromRow);
      if (move.piece && move.piece.type === 'p') {
        // Freibauern-Prüfung: Gibt es gegnerische Bauern auf der gleichen oder Nachbarlinien vor ihm?
        let isPassedPawn = true;
        const startR = (turn === 'w') ? fromRow - 1 : fromRow + 1;
        const endR = (turn === 'w') ? 0 : 7;
        const stepR = (turn === 'w') ? -1 : 1;

        if (Array.isArray(game.board)) {
          for (let r = startR; (turn === 'w' ? r >= endR : r <= endR); r += stepR) {
            for (let c = Math.max(0, fromCol - 1); c <= Math.min(7, fromCol + 1); c++) {
              const p = game.board[r * 8 + c];
              if (p && p.color === oppColor && p.type === 'p') {
                isPassedPawn = false;
                break;
              }
            }
            if (!isPassedPawn) break;
          }
        }

        if (isPassedPawn) {
          score += 1000; // Freibauer erkannt!
          const distanceToGoal = (turn === 'w') ? toRow : (7 - toRow);
          score += (7 - distanceToGoal) * 350; // Je näher an der Grundreihe, desto unaufhaltsamer!
          if (hasMaterialAdvantage) score += 800;
        }

        if (move.promotion) {
          score += 3500; // Sofortige Damen-Umwandlung!
        } else {
          if (turn === 'w' && toRow <= 2) score += 600;
          if (turn === 'b' && toRow >= 5) score += 600;
        }
      }

      // 5. Raumgewinn & Vorrücken in gegnerische Spielfeldhälfte
      const isInOpponentHalf = (turn === 'w') ? (toRow <= 3) : (toRow >= 4);
      if (isInOpponentHalf) {
        score += 300;
      }
      if (forwardAdvancement > 0) {
        score += forwardAdvancement * 70;
      }

      // 6. Endspiel-Resilienz bei Unterzahl (1–2 eigene Figuren)
      if (ownPieceCount <= 2 && !hasMaterialAdvantage) {
        if (move.captured || move.isEnPassant) score += 1800;
      }

      return score;
    }

    /**
     * Wählt den besten Zug für die Royale KI Engine unter Berücksichtigung von:
     * 1. Taktische Matt-Sequenz (höchste Priorität)
     * 2. 15%-Exploration-Rate (kalkulierte offensive Züge testen)
     * 3. Firestore-Wissen mit aggressivem Entscheidungs-Filter bei ähnlichen Werten
     * 4. Offensiver Fallback bei unbekannten Stellungen
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

      // --- PRIORITÄT 0: SOFORT-MATT / UNAUSWEICHLICHES MATT ---
      const mateMove = scoredMoves.find(m => m.attackScore >= 20000);
      if (mateMove) {
        console.log(`[Royale KI] 👑 Taktische Matt-Sequenz gefunden! Sofortige Exekution: ${mateMove.uci} (Score: ${mateMove.attackScore})`);
        return mateMove.move;
      }

      // --- Modus A: 15% Exploration (kalkulierte offensive Züge testen) ---
      if (isExploring) {
        // Vermeide Züge mit hartem Malus (z. B. Patt-Blunder bei Führung)
        const viableMoves = scoredMoves.filter(m => m.attackScore > -10000);
        const poolToFilter = viableMoves.length > 0 ? viableMoves : scoredMoves;
        poolToFilter.sort((a, b) => b.attackScore - a.attackScore);
        const topAttack = poolToFilter[0].attackScore;
        const offensiveCandidates = poolToFilter.filter(item => item.attackScore >= Math.max(100, topAttack - 150));
        const pool = offensiveCandidates.length > 0 ? offensiveCandidates : poolToFilter.slice(0, Math.min(3, poolToFilter.length));
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        console.log(`[Royale KI] ⚔️ 15% Exploration: Teste kalkulierten Angriffszug: ${chosen.uci} (Attack-Score: ${chosen.attackScore})`);
        return chosen.move;
      }

      // --- Modus B: 85% Exploitation von Firestore-Wissen ---
      // Filtere Züge mit negativer Wertung oder hartem Malus (z. B. Patt-Falle)
      const positiveKnowledgeMoves = scoredMoves.filter(item =>
        !isNaN(item.firestoreScore) && item.firestoreScore > 0 && item.attackScore > -10000
      );

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
      const viableScored = scoredMoves.filter(m => m.attackScore > -10000);
      const movesToRank = viableScored.length > 0 ? viableScored : scoredMoves;
      movesToRank.sort((a, b) => b.attackScore - a.attackScore);
      const topAttack = movesToRank[0].attackScore;
      const topOffensive = movesToRank.filter(item => item.attackScore >= Math.max(100, topAttack - 150));
      const pool = topOffensive.length > 0 ? topOffensive : movesToRank;
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
          scoreDelta = (movingColor === winner) ? 10.0 : -5.0; // Sieg +10.0, Niederlage -5.0
        } else {
          scoreDelta = -2.0; // Remis als halbe Niederlage bestraft (-2.0)
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
