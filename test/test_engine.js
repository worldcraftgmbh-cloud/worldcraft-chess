const ChessEngine = require('../public/engine/chess.js');
const { ChessGame, WHITE, BLACK } = ChessEngine;

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  } else {
    console.log('PASS:', message);
  }
}

console.log('--- TESTING CHESS ENGINE ---');

// 1. Initial State
const game = new ChessGame();
assert(game.generateLegalMoves().length === 20, 'Initial legal moves should be 20 (16 pawn moves + 4 knight moves)');

// 2. Scholar's Mate test
// 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
assert(game.makeMove('e2e4') !== null, '1. e4');
assert(game.makeMove('e7e5') !== null, '1... e5');
assert(game.makeMove('d1h5') !== null, '2. Qh5');
assert(game.makeMove('b8c6') !== null, '2... Nc6');
assert(game.makeMove('f1c4') !== null, '3. Bc4');
assert(game.makeMove('g8f6') !== null, '3... Nf6');
const mateMove = game.makeMove('h5f7');
assert(mateMove !== null && mateMove.san === 'Qxf7#', "4. Qxf7# Scholar's mate");
const status = game.getGameStatus();
assert(status.isGameOver === true && status.status === 'checkmate' && status.winner === WHITE, 'Game over checkmate detected');

// 3. Castling test
const castleGame = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
const whiteMoves = castleGame.generateLegalMoves();
const kingsideCastle = whiteMoves.find(m => m.isCastling && m.castleSide === 'k');
const queensideCastle = whiteMoves.find(m => m.isCastling && m.castleSide === 'q');
assert(kingsideCastle && queensideCastle, 'Both kingside and queenside castling available for White');

// White castles kingside (e1 -> g1)
castleGame.makeMove('e1g1');
assert(castleGame.board[62].type === 'k' && castleGame.board[61].type === 'r', 'White castled: King on g1, Rook on f1');

// 4. En Passant test
const epGame = new ChessGame('8/8/8/3pP3/8/8/8/4K2k w - d6 0 1');
const epMoves = epGame.generateLegalMoves();
const epMove = epMoves.find(m => m.isEnPassant);
assert(epMove !== null, 'En passant move available');
epGame.makeMove({ from: epMove.from, to: epMove.to });
assert(epGame.board[epMove.to].type === 'p' && epGame.board[epMove.capturedSq] === null, 'En passant executed and captured pawn removed');

// 5. Pawn Promotion test
const promoGame = new ChessGame('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
const promoMoves = promoGame.generateLegalMoves().filter(m => m.piece.type === 'p');
assert(promoMoves.length === 4, 'Pawn on 7th rank has 4 promotion moves (Q, R, B, N)');
const qPromo = promoGame.makeMove({ from: 'e7', to: 'e8', promotion: 'q' });
assert(qPromo.san.includes('=Q') && promoGame.board[4].type === 'q', 'Pawn promoted to Queen');

// 6. Insufficient Material test
const imGame = new ChessGame('8/8/8/8/8/8/4K3/k7 w - - 0 1');
assert(imGame.isInsufficientMaterial(), 'K vs K is insufficient material');

// 7. Stalemate test
const staleGame = new ChessGame('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
const staleStatus = staleGame.getGameStatus();
assert(staleStatus.isGameOver && staleStatus.status === 'stalemate', 'Stalemate detected when no legal moves and not in check');

// 8. 50-Move Rule test
const fiftyGame = new ChessGame('8/8/8/8/8/8/4K3/k7 w - - 100 50');
assert(fiftyGame.isFiftyMoveRule(), '50-move rule (100 halfmoves) detected');

// 9. Threefold Repetition test
const repGame = new ChessGame();
repGame.makeMove('g1f3'); repGame.makeMove('g8f6');
repGame.makeMove('f3g1'); repGame.makeMove('f6g8');
repGame.makeMove('g1f3'); repGame.makeMove('g8f6');
repGame.makeMove('f3g1'); repGame.makeMove('f6g8');
assert(repGame.isThreefoldRepetition(), 'Threefold repetition detected upon third recurrence');

console.log('ALL ENGINE TESTS PASSED SUCCESSFULLY!');
