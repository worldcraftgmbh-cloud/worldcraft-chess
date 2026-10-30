const ChessEngine = require('../public/engine/chess.js');
const ChessAI = require('../public/ai/chessAI.js');

const { ChessGame, WHITE, BLACK } = ChessEngine;

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  } else {
    console.log('PASS:', message);
  }
}

console.log('--- TESTING CHESS AI ---');

const ai = new ChessAI();
const game = new ChessGame();

// Test 1: Initial evaluation
const initEval = ai.evaluate(game);
assert(Math.abs(initEval) < 50, `Initial position evaluation is balanced (score: ${initEval})`);

// Test 2: AI finds Mate-in-1
// Setup: White Queen on h5, White Bishop on c4, Black King on e8, pawns e5, f7
const mateGame = new ChessGame('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
const bestMoveRes = ai.getBestMove(mateGame, 2);
assert(bestMoveRes !== null && bestMoveRes.bestMove !== null, 'AI found best move');
const mateMoveSan = mateGame.moveToSan(bestMoveRes.bestMove, mateGame.generateLegalMoves());
assert(mateMoveSan === 'Qxf7#', `AI found mate-in-1 Qxf7# (played: ${mateMoveSan})`);

// Test 3: Self-play training run
console.log('Running 2 self-play simulated training games...');
ai.trainSelfPlay(2, (progress) => {
  console.log(` Training progress: Game ${progress.gameIndex}/${progress.totalGames} -> ${progress.result}`);
}).then((stats) => {
  assert(stats.gamesTrained === 2, '2 games successfully trained');
  assert(stats.policySize > 0, `Q-Policy updated with ${stats.policySize} state-action pairs`);
  console.log('ALL CHESS AI TESTS PASSED SUCCESSFULLY!');
});
