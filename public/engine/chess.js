/**
 * Standalone FIDE Chess Engine (Zero External Dependencies)
 * Fully isomorphic: Runs seamlessly in Browser and Node.js
 * Supports complete FIDE rules: castling, en-passant, promotion,
 * check, checkmate, stalemate, 50-move rule, threefold repetition,
 * insufficient material, FEN import/export, and SAN move notation.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChessEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const WHITE = 'w';
  const BLACK = 'b';

  const PAWN = 'p';
  const KNIGHT = 'n';
  const BISHOP = 'b';
  const ROOK = 'r';
  const QUEEN = 'q';
  const KING = 'k';

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // Board square helper mapping: 0 = a8, 7 = h8, 56 = a1, 63 = h1
  function fileRankToSquare(file, rank) {
    return rank * 8 + file;
  }

  function squareToFileRank(square) {
    return {
      file: square % 8,
      rank: Math.floor(square / 8)
    };
  }

  function squareToAlgebraic(square) {
    if (square < 0 || square > 63) return '-';
    const f = square % 8;
    const r = 8 - Math.floor(square / 8);
    return String.fromCharCode(97 + f) + r;
  }

  function algebraicToSquare(alg) {
    if (!alg || alg.length < 2) return -1;
    const f = alg.charCodeAt(0) - 97;
    const r = 8 - parseInt(alg[1], 10);
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return r * 8 + f;
  }

  // Precomputed ray offsets for sliding pieces
  const ROOK_OFFSETS = [-8, 8, -1, 1];
  const BISHOP_OFFSETS = [-9, -7, 7, 9];
  const QUEEN_OFFSETS = [-8, 8, -1, 1, -9, -7, 7, 9];
  const KNIGHT_OFFSETS = [-17, -15, -10, -6, 6, 10, 15, 17];
  const KING_OFFSETS = [-9, -8, -7, -1, 1, 7, 8, 9];

  // Precalculated distance to board edges from each square [N, S, W, E, NW, NE, SW, SE]
  const DIST_TO_EDGE = new Array(64);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = rank * 8 + file;
      const north = rank;
      const south = 7 - rank;
      const west = file;
      const east = 7 - file;
      DIST_TO_EDGE[sq] = [
        north,
        south,
        west,
        east,
        Math.min(north, west),
        Math.min(north, east),
        Math.min(south, west),
        Math.min(south, east)
      ];
    }
  }

  class ChessGame {
    constructor(fen = START_FEN) {
      this.board = new Array(64).fill(null);
      this.turn = WHITE;
      this.castling = { w: { k: true, q: true }, b: { k: true, q: true } };
      this.enPassant = -1; // square index of en-passant target
      this.halfmoveClock = 0; // for 50-move rule
      this.fullmoveNumber = 1;

      this.moveHistory = [];
      this.positionHistory = []; // stores hashes or simplified FEN for 3-fold repetition
      this.capturedPieces = { w: [], b: [] }; // pieces captured by white, and by black

      this.loadFen(fen);
    }

    reset() {
      this.loadFen(START_FEN);
    }

    /**
     * Loads board position from FEN string
     */
    loadFen(fen) {
      const parts = fen.trim().split(/\s+/);
      const piecePlacement = parts[0];
      const activeColor = parts[1] || 'w';
      const castlingAvailability = parts[2] || '-';
      const enPassantTarget = parts[3] || '-';
      const halfmove = parts[4] || '0';
      const fullmove = parts[5] || '1';

      this.board = new Array(64).fill(null);
      let square = 0;

      for (let i = 0; i < piecePlacement.length; i++) {
        const c = piecePlacement[i];
        if (c === '/') {
          continue;
        } else if (c >= '1' && c <= '8') {
          square += parseInt(c, 10);
        } else {
          const color = (c === c.toUpperCase()) ? WHITE : BLACK;
          const type = c.toLowerCase();
          this.board[square] = { type, color };
          square++;
        }
      }

      this.turn = (activeColor === 'w') ? WHITE : BLACK;

      this.castling = {
        w: { k: castlingAvailability.includes('K'), q: castlingAvailability.includes('Q') },
        b: { k: castlingAvailability.includes('k'), q: castlingAvailability.includes('q') }
      };

      this.enPassant = enPassantTarget !== '-' ? algebraicToSquare(enPassantTarget) : -1;
      this.halfmoveClock = parseInt(halfmove, 10) || 0;
      this.fullmoveNumber = parseInt(fullmove, 10) || 1;

      this.moveHistory = [];
      this.positionHistory = [this.getPositionKey()];
      this.updateCapturedPiecesFromBoard();
      return true;
    }

    /**
     * Generates standard FEN string representing current position
     */
    getFen() {
      let fen = '';
      for (let rank = 0; rank < 8; rank++) {
        let emptyCount = 0;
        for (let file = 0; file < 8; file++) {
          const sq = rank * 8 + file;
          const piece = this.board[sq];
          if (!piece) {
            emptyCount++;
          } else {
            if (emptyCount > 0) {
              fen += emptyCount;
              emptyCount = 0;
            }
            const symbol = piece.color === WHITE ? piece.type.toUpperCase() : piece.type.toLowerCase();
            fen += symbol;
          }
        }
        if (emptyCount > 0) {
          fen += emptyCount;
        }
        if (rank < 7) {
          fen += '/';
        }
      }

      fen += ' ' + this.turn;

      let castling = '';
      if (this.castling.w.k) castling += 'K';
      if (this.castling.w.q) castling += 'Q';
      if (this.castling.b.k) castling += 'k';
      if (this.castling.b.q) castling += 'q';
      fen += ' ' + (castling || '-');

      fen += ' ' + (this.enPassant !== -1 ? squareToAlgebraic(this.enPassant) : '-');
      fen += ' ' + this.halfmoveClock;
      fen += ' ' + this.fullmoveNumber;

      return fen;
    }

    /**
     * Simplified position key for repetition check (pieces + turn + castling + ep)
     */
    getPositionKey() {
      let key = '';
      for (let i = 0; i < 64; i++) {
        const p = this.board[i];
        key += p ? (p.color === WHITE ? p.type.toUpperCase() : p.type) : '.';
      }
      key += '|' + this.turn;
      key += '|' + (this.castling.w.k ? 'K' : '') + (this.castling.w.q ? 'Q' : '') +
                    (this.castling.b.k ? 'k' : '') + (this.castling.b.q ? 'q' : '');
      key += '|' + this.enPassant;
      return key;
    }

    getPiece(square) {
      if (typeof square === 'string') square = algebraicToSquare(square);
      return this.board[square];
    }

    /**
     * Finds King position for given color
     */
    findKing(color) {
      for (let sq = 0; sq < 64; sq++) {
        const p = this.board[sq];
        if (p && p.type === KING && p.color === color) {
          return sq;
        }
      }
      return -1;
    }

    /**
     * Checks if a square is attacked by opposing color
     */
    isSquareAttacked(square, byColor) {
      const { file: targetFile, rank: targetRank } = squareToFileRank(square);

      // 1. Pawn attacks
      const pawnDir = byColor === WHITE ? 1 : -1; // White attacks upward (from higher rank index to lower rank index in 0-indexed)
      // If White attacks 'square', White pawns are at rank+1. If Black attacks, Black pawns are at rank-1.
      const pawnRank = targetRank + pawnDir;
      if (pawnRank >= 0 && pawnRank <= 7) {
        if (targetFile > 0) {
          const p = this.board[pawnRank * 8 + (targetFile - 1)];
          if (p && p.color === byColor && p.type === PAWN) return true;
        }
        if (targetFile < 7) {
          const p = this.board[pawnRank * 8 + (targetFile + 1)];
          if (p && p.color === byColor && p.type === PAWN) return true;
        }
      }

      // 2. Knight attacks
      for (let i = 0; i < 8; i++) {
        const dest = square + KNIGHT_OFFSETS[i];
        if (dest >= 0 && dest < 64) {
          const df = Math.abs((square % 8) - (dest % 8));
          const dr = Math.abs(Math.floor(square / 8) - Math.floor(dest / 8));
          if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) {
            const p = this.board[dest];
            if (p && p.color === byColor && p.type === KNIGHT) return true;
          }
        }
      }

      // 3. Orthogonal rays (Rook and Queen)
      for (let dir = 0; dir < 4; dir++) {
        const offset = ROOK_OFFSETS[dir];
        const maxDist = DIST_TO_EDGE[square][dir];
        for (let step = 1; step <= maxDist; step++) {
          const currentSq = square + offset * step;
          const piece = this.board[currentSq];
          if (piece) {
            if (piece.color === byColor && (piece.type === ROOK || piece.type === QUEEN)) {
              return true;
            }
            break; // Ray blocked
          }
        }
      }

      // 4. Diagonal rays (Bishop and Queen)
      for (let dir = 0; dir < 4; dir++) {
        const offset = BISHOP_OFFSETS[dir];
        const maxDist = DIST_TO_EDGE[square][4 + dir];
        for (let step = 1; step <= maxDist; step++) {
          const currentSq = square + offset * step;
          const piece = this.board[currentSq];
          if (piece) {
            if (piece.color === byColor && (piece.type === BISHOP || piece.type === QUEEN)) {
              return true;
            }
            break; // Ray blocked
          }
        }
      }

      // 5. Adjacent King attacks
      for (let i = 0; i < 8; i++) {
        const dest = square + KING_OFFSETS[i];
        if (dest >= 0 && dest < 64) {
          const df = Math.abs((square % 8) - (dest % 8));
          const dr = Math.abs(Math.floor(square / 8) - Math.floor(dest / 8));
          if (df <= 1 && dr <= 1) {
            const p = this.board[dest];
            if (p && p.color === byColor && p.type === KING) return true;
          }
        }
      }

      return false;
    }

    /**
     * Checks if current turn's king (or specified color's king) is in check
     */
    isInCheck(color = this.turn) {
      const kingSq = this.findKing(color);
      if (kingSq === -1) return false;
      const opponentColor = color === WHITE ? BLACK : WHITE;
      return this.isSquareAttacked(kingSq, opponentColor);
    }

    /**
     * Generate all pseudo-legal moves for a specific color (or this.turn)
     */
    generatePseudoMoves(color = this.turn) {
      const moves = [];
      const isWhite = color === WHITE;
      const pawnDir = isWhite ? -8 : 8;
      const startRank = isWhite ? 6 : 1;
      const promoRank = isWhite ? 0 : 7;

      for (let sq = 0; sq < 64; sq++) {
        const piece = this.board[sq];
        if (!piece || piece.color !== color) continue;

        const { file, rank } = squareToFileRank(sq);

        switch (piece.type) {
          case PAWN: {
            // Forward 1 square
            const f1 = sq + pawnDir;
            if (f1 >= 0 && f1 < 64 && !this.board[f1]) {
              const destRank = Math.floor(f1 / 8);
              if (destRank === promoRank) {
                // Promotion
                [QUEEN, ROOK, BISHOP, KNIGHT].forEach(p => {
                  moves.push({ from: sq, to: f1, piece, promotion: p });
                });
              } else {
                moves.push({ from: sq, to: f1, piece });
                // Forward 2 squares from starting rank
                if (rank === startRank) {
                  const f2 = sq + pawnDir * 2;
                  if (!this.board[f2]) {
                    moves.push({ from: sq, to: f2, piece, isDoublePawn: true });
                  }
                }
              }
            }

            // Diagonal captures (left and right)
            const captureOffsets = isWhite ? [-9, -7] : [7, 9];
            for (let i = 0; i < 2; i++) {
              const offset = captureOffsets[i];
              const dest = sq + offset;
              const { file: destFile, rank: destRank } = squareToFileRank(dest);
              if (Math.abs(destFile - file) === 1 && dest >= 0 && dest < 64) {
                const target = this.board[dest];
                if (target && target.color !== color) {
                  if (destRank === promoRank) {
                    [QUEEN, ROOK, BISHOP, KNIGHT].forEach(p => {
                      moves.push({ from: sq, to: dest, piece, captured: target, promotion: p });
                    });
                  } else {
                    moves.push({ from: sq, to: dest, piece, captured: target });
                  }
                } else if (dest === this.enPassant) {
                  // En-passant capture
                  const capturedPawnSq = isWhite ? dest + 8 : dest - 8;
                  const capturedPawn = this.board[capturedPawnSq];
                  if (capturedPawn && capturedPawn.type === PAWN && capturedPawn.color !== color) {
                    moves.push({ from: sq, to: dest, piece, captured: capturedPawn, isEnPassant: true, capturedSq: capturedPawnSq });
                  }
                }
              }
            }
            break;
          }

          case KNIGHT: {
            for (let i = 0; i < 8; i++) {
              const dest = sq + KNIGHT_OFFSETS[i];
              if (dest >= 0 && dest < 64) {
                const df = Math.abs((sq % 8) - (dest % 8));
                const dr = Math.abs(Math.floor(sq / 8) - Math.floor(dest / 8));
                if ((df === 1 && dr === 2) || (df === 2 && dr === 1)) {
                  const target = this.board[dest];
                  if (!target || target.color !== color) {
                    moves.push({ from: sq, to: dest, piece, captured: target || null });
                  }
                }
              }
            }
            break;
          }

          case BISHOP: {
            for (let dir = 0; dir < 4; dir++) {
              const offset = BISHOP_OFFSETS[dir];
              const maxDist = DIST_TO_EDGE[sq][4 + dir];
              for (let step = 1; step <= maxDist; step++) {
                const dest = sq + offset * step;
                const target = this.board[dest];
                if (!target) {
                  moves.push({ from: sq, to: dest, piece });
                } else {
                  if (target.color !== color) {
                    moves.push({ from: sq, to: dest, piece, captured: target });
                  }
                  break;
                }
              }
            }
            break;
          }

          case ROOK: {
            for (let dir = 0; dir < 4; dir++) {
              const offset = ROOK_OFFSETS[dir];
              const maxDist = DIST_TO_EDGE[sq][dir];
              for (let step = 1; step <= maxDist; step++) {
                const dest = sq + offset * step;
                const target = this.board[dest];
                if (!target) {
                  moves.push({ from: sq, to: dest, piece });
                } else {
                  if (target.color !== color) {
                    moves.push({ from: sq, to: dest, piece, captured: target });
                  }
                  break;
                }
              }
            }
            break;
          }

          case QUEEN: {
            // Combines rook and bishop offsets
            for (let dir = 0; dir < 8; dir++) {
              const offset = QUEEN_OFFSETS[dir];
              const maxDist = DIST_TO_EDGE[sq][dir];
              for (let step = 1; step <= maxDist; step++) {
                const dest = sq + offset * step;
                const target = this.board[dest];
                if (!target) {
                  moves.push({ from: sq, to: dest, piece });
                } else {
                  if (target.color !== color) {
                    moves.push({ from: sq, to: dest, piece, captured: target });
                  }
                  break;
                }
              }
            }
            break;
          }

          case KING: {
            for (let i = 0; i < 8; i++) {
              const dest = sq + KING_OFFSETS[i];
              if (dest >= 0 && dest < 64) {
                const df = Math.abs((sq % 8) - (dest % 8));
                const dr = Math.abs(Math.floor(sq / 8) - Math.floor(dest / 8));
                if (df <= 1 && dr <= 1) {
                  const target = this.board[dest];
                  if (!target || target.color !== color) {
                    moves.push({ from: sq, to: dest, piece, captured: target || null });
                  }
                }
              }
            }

            // Castling
            const oppColor = isWhite ? BLACK : WHITE;
            if (isWhite && sq === 60) {
              // Kingside (e1 -> g1)
              if (this.castling.w.k && !this.board[61] && !this.board[62]) {
                if (!this.isSquareAttacked(60, oppColor) &&
                    !this.isSquareAttacked(61, oppColor) &&
                    !this.isSquareAttacked(62, oppColor)) {
                  moves.push({ from: 60, to: 62, piece, isCastling: true, castleSide: 'k' });
                }
              }
              // Queenside (e1 -> c1)
              if (this.castling.w.q && !this.board[59] && !this.board[58] && !this.board[57]) {
                if (!this.isSquareAttacked(60, oppColor) &&
                    !this.isSquareAttacked(59, oppColor) &&
                    !this.isSquareAttacked(58, oppColor)) {
                  moves.push({ from: 60, to: 58, piece, isCastling: true, castleSide: 'q' });
                }
              }
            } else if (!isWhite && sq === 4) {
              // Kingside (e8 -> g8)
              if (this.castling.b.k && !this.board[5] && !this.board[6]) {
                if (!this.isSquareAttacked(4, oppColor) &&
                    !this.isSquareAttacked(5, oppColor) &&
                    !this.isSquareAttacked(6, oppColor)) {
                  moves.push({ from: 4, to: 6, piece, isCastling: true, castleSide: 'k' });
                }
              }
              // Queenside (e8 -> c8)
              if (this.castling.b.q && !this.board[3] && !this.board[2] && !this.board[1]) {
                if (!this.isSquareAttacked(4, oppColor) &&
                    !this.isSquareAttacked(3, oppColor) &&
                    !this.isSquareAttacked(2, oppColor)) {
                  moves.push({ from: 4, to: 2, piece, isCastling: true, castleSide: 'q' });
                }
              }
            }
            break;
          }
        }
      }

      return moves;
    }

    /**
     * Executes move tentatively on board
     */
    makeMoveDirect(move) {
      const state = {
        from: move.from,
        to: move.to,
        piece: move.piece,
        captured: move.captured || null,
        capturedSq: move.capturedSq || move.to,
        castling: {
          w: { ...this.castling.w },
          b: { ...this.castling.b }
        },
        enPassant: this.enPassant,
        halfmoveClock: this.halfmoveClock,
        fullmoveNumber: this.fullmoveNumber,
        isCastling: move.isCastling,
        isEnPassant: move.isEnPassant,
        promotion: move.promotion
      };

      // Handle piece move
      this.board[move.from] = null;
      if (move.promotion) {
        this.board[move.to] = { type: move.promotion, color: move.piece.color };
      } else {
        this.board[move.to] = move.piece;
      }

      // Handle En-Passant capture
      if (move.isEnPassant) {
        this.board[move.capturedSq] = null;
      }

      // Handle Castling rook move
      if (move.isCastling) {
        if (move.to === 62) { // White kingside
          this.board[61] = this.board[63];
          this.board[63] = null;
        } else if (move.to === 58) { // White queenside
          this.board[59] = this.board[56];
          this.board[56] = null;
        } else if (move.to === 6) { // Black kingside
          this.board[5] = this.board[7];
          this.board[7] = null;
        } else if (move.to === 2) { // Black queenside
          this.board[3] = this.board[0];
          this.board[0] = null;
        }
      }

      // Update castling rights if King or Rook moved
      if (move.piece.type === KING) {
        this.castling[move.piece.color].k = false;
        this.castling[move.piece.color].q = false;
      } else if (move.piece.type === ROOK) {
        if (move.from === 63) this.castling.w.k = false;
        else if (move.from === 56) this.castling.w.q = false;
        else if (move.from === 7) this.castling.b.k = false;
        else if (move.from === 0) this.castling.b.q = false;
      }

      // If a rook is captured on its original square
      if (move.to === 63) this.castling.w.k = false;
      else if (move.to === 56) this.castling.w.q = false;
      else if (move.to === 7) this.castling.b.k = false;
      else if (move.to === 0) this.castling.b.q = false;

      // Update En Passant target square
      if (move.isDoublePawn) {
        this.enPassant = (move.from + move.to) / 2;
      } else {
        this.enPassant = -1;
      }

      // Update halfmove clock (50-move rule)
      if (move.piece.type === PAWN || move.captured) {
        this.halfmoveClock = 0;
      } else {
        this.halfmoveClock++;
      }

      if (this.turn === BLACK) {
        this.fullmoveNumber++;
      }
      this.turn = this.turn === WHITE ? BLACK : WHITE;

      return state;
    }

    /**
     * Reverts tentative move
     */
    unmakeMoveDirect(state) {
      this.turn = this.turn === WHITE ? BLACK : WHITE;
      this.castling = state.castling;
      this.enPassant = state.enPassant;
      this.halfmoveClock = state.halfmoveClock;
      this.fullmoveNumber = state.fullmoveNumber;

      // Restore moving piece
      this.board[state.from] = state.piece;
      this.board[state.to] = null;

      // Restore captured piece
      if (state.captured) {
        this.board[state.capturedSq] = state.captured;
      }

      // Restore rook if castled
      if (state.isCastling) {
        if (state.to === 62) {
          this.board[63] = this.board[61];
          this.board[61] = null;
        } else if (state.to === 58) {
          this.board[56] = this.board[59];
          this.board[59] = null;
        } else if (state.to === 6) {
          this.board[7] = this.board[5];
          this.board[5] = null;
        } else if (state.to === 2) {
          this.board[0] = this.board[3];
          this.board[3] = null;
        }
      }
    }

    /**
     * Generates all strictly legal moves for current position
     */
    generateLegalMoves(color = this.turn) {
      const pseudoMoves = this.generatePseudoMoves(color);
      const legalMoves = [];

      for (let i = 0; i < pseudoMoves.length; i++) {
        const move = pseudoMoves[i];
        const state = this.makeMoveDirect(move);

        // Check if moving side's king is under attack after move
        const inCheck = this.isInCheck(color);
        this.unmakeMoveDirect(state);

        if (!inCheck) {
          legalMoves.push(move);
        }
      }

      return legalMoves;
    }

    /**
     * Makes a move in the game, records history, and returns move info or null if illegal
     */
    makeMove(moveInput) {
      // Can take object { from, to, promotion } or algebraic string "e2e4", "e7e8q"
      let parsed = null;
      if (typeof moveInput === 'string') {
        const fromSq = algebraicToSquare(moveInput.substring(0, 2));
        const toSq = algebraicToSquare(moveInput.substring(2, 4));
        const promo = moveInput.length > 4 ? moveInput[4].toLowerCase() : null;
        parsed = { from: fromSq, to: toSq, promotion: promo };
      } else {
        parsed = {
          from: typeof moveInput.from === 'string' ? algebraicToSquare(moveInput.from) : moveInput.from,
          to: typeof moveInput.to === 'string' ? algebraicToSquare(moveInput.to) : moveInput.to,
          promotion: moveInput.promotion ? moveInput.promotion.toLowerCase() : null
        };
      }

      const legalMoves = this.generateLegalMoves(this.turn);
      const matched = legalMoves.find(m => {
        if (m.from !== parsed.from || m.to !== parsed.to) return false;
        if (m.promotion) {
          return m.promotion === (parsed.promotion || 'q'); // default queen promo if unspecified
        }
        return true;
      });

      if (!matched) {
        return null; // Illegal move!
      }

      // Capture position before move
      const fenBefore = this.getFen();

      // Generate Standard Algebraic Notation (SAN) before mutating position
      const san = this.moveToSan(matched, legalMoves);

      // Perform move
      const state = this.makeMoveDirect(matched);

      // Update captured piece lists
      if (state.captured) {
        const capturingColor = matched.piece.color;
        this.capturedPieces[capturingColor].push(state.captured);
      }

      const moveRecord = {
        ...matched,
        san,
        fenBefore,
        fenAfter: this.getFen(),
        captured: state.captured
      };

      this.moveHistory.push(moveRecord);
      this.positionHistory.push(this.getPositionKey());

      return moveRecord;
    }

    /**
     * Converts move to Standard Algebraic Notation (SAN) like 'Nf3', 'exd5', 'O-O', 'Qh5#'
     */
    moveToSan(move, legalMoves) {
      if (move.isCastling) {
        return (move.to === 62 || move.to === 6) ? 'O-O' : 'O-O-O';
      }

      let san = '';
      const piece = move.piece;

      if (piece.type === PAWN) {
        if (move.captured || move.isEnPassant) {
          san += squareToAlgebraic(move.from)[0] + 'x' + squareToAlgebraic(move.to);
        } else {
          san += squareToAlgebraic(move.to);
        }
        if (move.promotion) {
          san += '=' + move.promotion.toUpperCase();
        }
      } else {
        san += piece.type.toUpperCase();

        // Disambiguation: check if multiple pieces of same type can move to same square
        const duplicates = legalMoves.filter(m =>
          m.piece.type === piece.type &&
          m.to === move.to &&
          m.from !== move.from
        );

        if (duplicates.length > 0) {
          const fromFile = squareToFileRank(move.from).file;
          const fromRank = squareToFileRank(move.from).rank;
          const sameFile = duplicates.some(m => squareToFileRank(m.from).file === fromFile);
          const sameRank = duplicates.some(m => squareToFileRank(m.from).rank === fromRank);

          if (!sameFile) {
            san += squareToAlgebraic(move.from)[0]; // file disambiguation
          } else if (!sameRank) {
            san += squareToAlgebraic(move.from)[1]; // rank disambiguation
          } else {
            san += squareToAlgebraic(move.from); // full square disambiguation
          }
        }

        if (move.captured) {
          san += 'x';
        }
        san += squareToAlgebraic(move.to);
      }

      // Check if move gives check or checkmate
      const state = this.makeMoveDirect(move);
      const isOpponentInCheck = this.isInCheck(this.turn);
      if (isOpponentInCheck) {
        const oppLegalMoves = this.generateLegalMoves(this.turn);
        if (oppLegalMoves.length === 0) {
          san += '#';
        } else {
          san += '+';
        }
      }
      this.unmakeMoveDirect(state);

      return san;
    }

    /**
     * Checks threefold repetition
     */
    isThreefoldRepetition() {
      const currentKey = this.getPositionKey();
      let count = 0;
      for (let i = 0; i < this.positionHistory.length; i++) {
        if (this.positionHistory[i] === currentKey) {
          count++;
          if (count >= 3) return true;
        }
      }
      return false;
    }

    /**
     * Checks 50-move rule (100 half-moves)
     */
    isFiftyMoveRule() {
      return this.halfmoveClock >= 100;
    }

    /**
     * Checks insufficient material for checkmate
     * FIDE criteria:
     * - K vs K
     * - K+B vs K
     * - K+N vs K
     * - K+B vs K+B (same colored squares)
     */
    isInsufficientMaterial() {
      const pieces = [];
      for (let sq = 0; sq < 64; sq++) {
        const p = this.board[sq];
        if (p) {
          pieces.push({ sq, type: p.type, color: p.color });
        }
      }

      if (pieces.length === 2) {
        // Only two kings
        return true;
      }

      if (pieces.length === 3) {
        // King + Minor vs King
        const minor = pieces.find(p => p.type !== KING);
        if (minor && (minor.type === BISHOP || minor.type === KNIGHT)) {
          return true;
        }
      }

      if (pieces.length === 4) {
        // King + Bishop vs King + Bishop (same square colors)
        const bishops = pieces.filter(p => p.type === BISHOP);
        if (bishops.length === 2 && bishops[0].color !== bishops[1].color) {
          const colorSq1 = (Math.floor(bishops[0].sq / 8) + (bishops[0].sq % 8)) % 2;
          const colorSq2 = (Math.floor(bishops[1].sq / 8) + (bishops[1].sq % 8)) % 2;
          if (colorSq1 === colorSq2) {
            return true;
          }
        }
      }

      return false;
    }

    /**
     * Evaluates current game status
     * Returns: {
     *   isGameOver: boolean,
     *   status: 'in_progress' | 'checkmate' | 'stalemate' | 'threefold_repetition' | 'fifty_move_rule' | 'insufficient_material',
     *   winner: 'w' | 'b' | null,
     *   reason: string
     * }
     */
    getGameStatus() {
      const legalMoves = this.generateLegalMoves(this.turn);
      const inCheck = this.isInCheck(this.turn);

      if (legalMoves.length === 0) {
        if (inCheck) {
          return {
            isGameOver: true,
            status: 'checkmate',
            winner: this.turn === WHITE ? BLACK : WHITE,
            reason: `Schachmatt! ${this.turn === WHITE ? 'Schwarz' : 'Weiß'} gewinnt.`
          };
        } else {
          return {
            isGameOver: true,
            status: 'stalemate',
            winner: null,
            reason: 'Remis durch Patt.'
          };
        }
      }

      if (this.isThreefoldRepetition()) {
        return {
          isGameOver: true,
          status: 'threefold_repetition',
          winner: null,
          reason: 'Remis durch dreifache Stellungswiederholung.'
        };
      }

      if (this.isFiftyMoveRule()) {
        return {
          isGameOver: true,
          status: 'fifty_move_rule',
          winner: null,
          reason: 'Remis durch 50-Züge-Regel.'
        };
      }

      if (this.isInsufficientMaterial()) {
        return {
          isGameOver: true,
          status: 'insufficient_material',
          winner: null,
          reason: 'Remis durch unzureichendes Material.'
        };
      }

      return {
        isGameOver: false,
        status: inCheck ? 'check' : 'in_progress',
        winner: null,
        reason: inCheck ? 'Schach!' : 'Partie läuft.'
      };
    }

    /**
     * Updates captured pieces array based on current pieces on board vs full 16 starting pieces
     */
    updateCapturedPiecesFromBoard() {
      const totalInitial = {
        w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
        b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
      };

      const current = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
      };

      for (let sq = 0; sq < 64; sq++) {
        const p = this.board[sq];
        if (p) current[p.color][p.type]++;
      }

      this.capturedPieces = { w: [], b: [] }; // pieces captured by white (black pieces missing), and vice-versa
      for (const color of [WHITE, BLACK]) {
        const opp = color === WHITE ? BLACK : WHITE;
        for (const type of [PAWN, KNIGHT, BISHOP, ROOK, QUEEN]) {
          const missing = Math.max(0, totalInitial[opp][type] - current[opp][type]);
          for (let i = 0; i < missing; i++) {
            this.capturedPieces[color].push({ type, color: opp });
          }
        }
      }
    }

    /**
     * Exports full game to PGN format
     */
    exportPgn(headers = {}) {
      let pgn = '';
      const defaultHeaders = {
        Event: 'Online Schach Match',
        Site: 'Web Canvas Schach',
        Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
        Round: '1',
        White: 'Spieler Weiß',
        Black: 'Spieler Schwarz',
        Result: '*'
      };

      const finalHeaders = { ...defaultHeaders, ...headers };
      const status = this.getGameStatus();
      if (status.isGameOver) {
        if (status.winner === WHITE) finalHeaders.Result = '1-0';
        else if (status.winner === BLACK) finalHeaders.Result = '0-1';
        else finalHeaders.Result = '1/2-1/2';
      }

      for (const [k, v] of Object.entries(finalHeaders)) {
        pgn += `[${k} "${v}"]\n`;
      }
      pgn += '\n';

      for (let i = 0; i < this.moveHistory.length; i++) {
        if (i % 2 === 0) {
          pgn += `${Math.floor(i / 2) + 1}. `;
        }
        pgn += `${this.moveHistory[i].san} `;
      }
      pgn += finalHeaders.Result;
      return pgn;
    }
  }

  return {
    ChessGame,
    WHITE,
    BLACK,
    PAWN,
    KNIGHT,
    BISHOP,
    ROOK,
    QUEEN,
    KING,
    START_FEN,
    squareToAlgebraic,
    algebraicToSquare,
    fileRankToSquare,
    squareToFileRank
  };
});
