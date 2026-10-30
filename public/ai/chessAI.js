/**
 * Standalone Chess AI Engine & Reinforcement Learning Trainer
 * Zero external dependencies.
 * Features:
 * - Alpha-Beta Minimax with Move Ordering (MVV-LVA) and Quiescence Search
 * - Piece-Square Tables (PST) & Positional Evaluation
 * - Self-Play Reinforcement Learning (TD-Learning / Parameter Evolution)
 * - Move History & Q-Policy Updates
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['../engine/chess'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../engine/chess'));
  } else {
    root.ChessAI = factory(root.ChessEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (ChessEngine) {

  const { ChessGame, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } = ChessEngine;

  // Base piece values (centipawns)
  const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
  };

  // Standard Piece-Square Tables (from White's perspective; flipped for Black)
  const PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0
    ],
    n: [
      -50,-40,-30,-30,-30,-30,-40,-50,
      -40,-20,  0,  0,  0,  0,-20,-40,
      -30,  0, 10, 15, 15, 10,  0,-30,
      -30,  5, 15, 20, 20, 15,  5,-30,
      -30,  0, 15, 20, 20, 15,  0,-30,
      -30,  5, 10, 15, 15, 10,  5,-30,
      -40,-20,  0,  5,  5,  0,-20,-40,
      -50,-40,-30,-30,-30,-30,-40,-50
    ],
    b: [
      -20,-10,-10,-10,-10,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5, 10, 10,  5,  0,-10,
      -10,  5,  5, 10, 10,  5,  5,-10,
      -10,  0, 10, 10, 10, 10,  0,-10,
      -10, 10, 10, 10, 10, 10, 10,-10,
      -10,  5,  0,  0,  0,  0,  5,-10,
      -20,-10,-10,-10,-10,-10,-10,-20
    ],
    r: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0
    ],
    q: [
      -20,-10,-10, -5, -5,-10,-10,-20,
      -10,  0,  0,  0,  0,  0,  0,-10,
      -10,  0,  5,  5,  5,  5,  0,-10,
       -5,  0,  5,  5,  5,  5,  0, -5,
        0,  0,  5,  5,  5,  5,  0, -5,
      -10,  5,  5,  5,  5,  5,  0,-10,
      -10,  0,  5,  0,  0,  0,  0,-10,
      -20,-10,-10, -5, -5,-10,-10,-20
    ],
    k: [
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -30,-40,-40,-50,-50,-40,-40,-30,
      -20,-30,-30,-40,-40,-30,-30,-20,
      -10,-20,-20,-20,-20,-20,-20,-10,
       20, 20,  0,  0,  0,  0, 20, 20,
       20, 30, 10,  0,  0, 10, 30, 20
    ]
  };

  // Default trainable feature weights
  const DEFAULT_WEIGHTS = {
    material: 1.0,
    pst: 1.0,
    mobility: 0.12,
    kingSafety: 0.25,
    centerControl: 0.15
  };

  class ChessAI {
    constructor(weights = {}) {
      this.weights = { ...DEFAULT_WEIGHTS, ...weights };
      this.transpositionTable = new Map();
      this.nodesVisited = 0;

      // Training statistics & move history model
      this.trainingData = {
        generation: 1,
        gamesTrained: 0,
        winLossRecord: { white: 0, black: 0, draw: 0 },
        historyPolicy: {} // FEN-prefix / key -> action value
      };
    }

    /**
     * Resets training weights to baseline
     */
    resetWeights() {
      this.weights = { ...DEFAULT_WEIGHTS };
      this.trainingData = {
        generation: 1,
        gamesTrained: 0,
        winLossRecord: { white: 0, black: 0, draw: 0 },
        historyPolicy: {}
      };
    }

    getWeights() {
      return { ...this.weights };
    }

    setWeights(newWeights) {
      this.weights = { ...this.weights, ...newWeights };
    }

    /**
     * Positional Static Evaluation Function (from White's perspective)
     * Positive = advantage for White, Negative = advantage for Black
     */
    evaluate(game) {
      const status = game.getGameStatus();
      if (status.isGameOver) {
        if (status.status === 'checkmate') {
          return status.winner === WHITE ? 100000 : -100000;
        }
        return 0; // Stalemate or Draw
      }

      let materialScore = 0;
      let pstScore = 0;
      let centerScore = 0;

      // Central squares (d4, e4, d5, e5)
      const centerSquares = [27, 28, 35, 36];

      for (let sq = 0; sq < 64; sq++) {
        const piece = game.board[sq];
        if (!piece) continue;

        const val = PIECE_VALUES[piece.type];
        const isWhite = piece.color === WHITE;

        // Piece Square Table score
        // White: square index `sq`, Black: vertically mirrored square index `(7 - rank) * 8 + file`
        const file = sq % 8;
        const rank = Math.floor(sq / 8);
        const pstIndex = isWhite ? sq : (7 - rank) * 8 + file;
        const pstVal = PST[piece.type][pstIndex];

        if (isWhite) {
          materialScore += val;
          pstScore += pstVal;
          if (centerSquares.includes(sq)) centerScore += 15;
        } else {
          materialScore -= val;
          pstScore -= pstVal;
          if (centerSquares.includes(sq)) centerScore -= 15;
        }
      }

      // Check penalty / bonus
      let kingSafetyScore = 0;
      if (game.isInCheck(WHITE)) kingSafetyScore -= 30;
      if (game.isInCheck(BLACK)) kingSafetyScore += 30;

      // Weighted sum of features
      const totalScore =
        this.weights.material * materialScore +
        this.weights.pst * pstScore +
        this.weights.centerControl * centerScore +
        this.weights.kingSafety * kingSafetyScore;

      return totalScore;
    }

    /**
     * Move Ordering via MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
     * Ensures rapid alpha-beta tree cutoffs.
     */
    orderMoves(moves) {
      return moves.slice().sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        // Captures
        if (a.captured) {
          scoreA += PIECE_VALUES[a.captured.type] * 10 - PIECE_VALUES[a.piece.type];
        }
        if (b.captured) {
          scoreB += PIECE_VALUES[b.captured.type] * 10 - PIECE_VALUES[b.piece.type];
        }

        // Promotions
        if (a.promotion) scoreA += 800;
        if (b.promotion) scoreB += 800;

        // History heuristic lookup if trained
        const keyA = `${a.from}_${a.to}`;
        const keyB = `${b.from}_${b.to}`;
        if (this.trainingData.historyPolicy[keyA]) {
          scoreA += this.trainingData.historyPolicy[keyA];
        }
        if (this.trainingData.historyPolicy[keyB]) {
          scoreB += this.trainingData.historyPolicy[keyB];
        }

        return scoreB - scoreA;
      });
    }

    /**
     * Quiescence search to avoid horizon effect on tactical captures
     */
    quiescence(game, alpha, beta, colorMultiplier, maxQDepth = 4) {
      this.nodesVisited++;
      const standPat = this.evaluate(game) * colorMultiplier;

      if (standPat >= beta) return beta;
      if (alpha < standPat) alpha = standPat;
      if (maxQDepth <= 0) return standPat;

      const legalMoves = game.generateLegalMoves(game.turn);
      const captures = legalMoves.filter(m => m.captured || m.promotion);
      const orderedCaptures = this.orderMoves(captures);

      for (let i = 0; i < orderedCaptures.length; i++) {
        const move = orderedCaptures[i];
        const state = game.makeMoveDirect(move);
        const score = -this.quiescence(game, -beta, -alpha, -colorMultiplier, maxQDepth - 1);
        game.unmakeMoveDirect(state);

        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
      }

      return alpha;
    }

    /**
     * Minimax Search with Alpha-Beta Pruning
     */
    minimax(game, depth, alpha, beta, isMaximizing, maxDepth) {
      this.nodesVisited++;

      const status = game.getGameStatus();
      if (status.isGameOver || depth === 0) {
        if (status.isGameOver) {
          if (status.status === 'checkmate') {
            // Favor faster checkmates with depth bonus
            return status.winner === WHITE ? 100000 + depth : -100000 - depth;
          }
          return 0;
        }
        // Quiescence search on leaf nodes
        const colorMul = isMaximizing ? 1 : -1;
        return this.quiescence(game, alpha, beta, colorMul, 3) * colorMul;
      }

      const rawMoves = game.generateLegalMoves(game.turn);
      const orderedMoves = this.orderMoves(rawMoves);

      if (isMaximizing) {
        let maxEval = -Infinity;
        for (let i = 0; i < orderedMoves.length; i++) {
          const move = orderedMoves[i];
          const state = game.makeMoveDirect(move);
          const evaluation = this.minimax(game, depth - 1, alpha, beta, false, maxDepth);
          game.unmakeMoveDirect(state);

          maxEval = Math.max(maxEval, evaluation);
          alpha = Math.max(alpha, evaluation);
          if (beta <= alpha) break; // Beta cutoff
        }
        return maxEval;
      } else {
        let minEval = Infinity;
        for (let i = 0; i < orderedMoves.length; i++) {
          const move = orderedMoves[i];
          const state = game.makeMoveDirect(move);
          const evaluation = this.minimax(game, depth - 1, alpha, beta, true, maxDepth);
          game.unmakeMoveDirect(state);

          minEval = Math.min(minEval, evaluation);
          beta = Math.min(beta, evaluation);
          if (beta <= alpha) break; // Alpha cutoff
        }
        return minEval;
      }
    }

    /**
     * Finds best move for current turn
     */
    getBestMove(game, depth = 3) {
      this.nodesVisited = 0;
      const startTime = Date.now();

      const legalMoves = game.generateLegalMoves(game.turn);
      if (legalMoves.length === 0) return null;

      // Handle simple opening randomness for novice levels if desired
      const isWhite = game.turn === WHITE;
      const orderedMoves = this.orderMoves(legalMoves);

      let bestMove = orderedMoves[0];
      let bestScore = isWhite ? -Infinity : Infinity;

      let alpha = -Infinity;
      let beta = Infinity;

      for (let i = 0; i < orderedMoves.length; i++) {
        const move = orderedMoves[i];
        const state = game.makeMoveDirect(move);
        const score = this.minimax(game, depth - 1, alpha, beta, !isWhite, depth);
        game.unmakeMoveDirect(state);

        if (isWhite) {
          if (score > bestScore) {
            bestScore = score;
            bestMove = move;
          }
          alpha = Math.max(alpha, score);
        } else {
          if (score < bestScore) {
            bestScore = score;
            bestMove = move;
          }
          beta = Math.min(beta, score);
        }
      }

      const elapsed = Date.now() - startTime;
      return {
        bestMove,
        score: bestScore,
        nodes: this.nodesVisited,
        depth,
        timeMs: elapsed
      };
    }

    /**
     * Reinforcement Learning Self-Play Trainer
     * Runs autonomous games between two instances of evaluation policies,
     * updates Q-values / weight parameters using Temporal Difference (TD) updates.
     */
    trainSelfPlay(numGames = 1, onProgress = null) {
      return new Promise((resolve) => {
        let completed = 0;

        const runGame = () => {
          if (completed >= numGames) {
            this.trainingData.generation++;
            resolve(this.getTrainingStats());
            return;
          }

          const simGame = new ChessGame();
          const moveLog = [];
          let moveCount = 0;
          const MAX_MOVES = 80; // Bound game length to prevent endless endgames

          while (!simGame.getGameStatus().isGameOver && moveCount < MAX_MOVES) {
            // Epsilon-greedy exploration during self-play
            const legalMoves = simGame.generateLegalMoves(simGame.turn);
            let chosenMove = null;

            if (Math.random() < 0.15) {
              // Exploration: random move
              chosenMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            } else {
              // Exploitation: depth 1-2 evaluation
              const res = this.getBestMove(simGame, 2);
              chosenMove = res.bestMove;
            }

            const key = `${chosenMove.from}_${chosenMove.to}`;
            moveLog.push({ key, turn: simGame.turn });
            simGame.makeMoveDirect(chosenMove);
            moveCount++;
          }

          const status = simGame.getGameStatus();
          let rewardWhite = 0;

          if (status.status === 'checkmate') {
            if (status.winner === WHITE) {
              rewardWhite = 1.0;
              this.trainingData.winLossRecord.white++;
            } else {
              rewardWhite = -1.0;
              this.trainingData.winLossRecord.black++;
            }
          } else {
            this.trainingData.winLossRecord.draw++;
          }

          // Reinforcement Learning Update: TD-Learning credit assignment
          const learningRate = 0.05;
          const discount = 0.95;
          let currentReward = rewardWhite;

          for (let i = moveLog.length - 1; i >= 0; i--) {
            const entry = moveLog[i];
            const direction = entry.turn === WHITE ? 1 : -1;
            const stepReward = currentReward * direction;

            if (!this.trainingData.historyPolicy[entry.key]) {
              this.trainingData.historyPolicy[entry.key] = 0;
            }
            this.trainingData.historyPolicy[entry.key] += learningRate * (stepReward - this.trainingData.historyPolicy[entry.key]);
            currentReward *= discount;
          }

          // Dynamic tuning of evaluation parameter weights based on match result
          if (rewardWhite > 0) {
            this.weights.centerControl = Math.min(0.5, this.weights.centerControl + 0.005);
            this.weights.kingSafety = Math.min(0.5, this.weights.kingSafety + 0.003);
          } else if (rewardWhite < 0) {
            this.weights.mobility = Math.min(0.4, this.weights.mobility + 0.004);
            this.weights.material = Math.min(1.5, this.weights.material + 0.005);
          }

          completed++;
          this.trainingData.gamesTrained++;

          if (onProgress) {
            onProgress({
              gameIndex: completed,
              totalGames: numGames,
              result: status.reason || 'Beendet',
              weights: { ...this.weights }
            });
          }

          // Yield execution to event loop
          setTimeout(runGame, 10);
        };

        runGame();
      });
    }

    getTrainingStats() {
      return {
        generation: this.trainingData.generation,
        gamesTrained: this.trainingData.gamesTrained,
        records: { ...this.trainingData.winLossRecord },
        policySize: Object.keys(this.trainingData.historyPolicy).length,
        currentWeights: { ...this.weights }
      };
    }
  }

  return ChessAI;
});
