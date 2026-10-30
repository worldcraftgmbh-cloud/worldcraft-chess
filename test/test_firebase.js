const apiKey = "AIzaSyAgTanP3TWi7cPQmwzGmFA0mmfo6HFoGq0";
const projectId = "worldcraft-schach";
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  } else {
    console.log('PASS:', msg);
  }
}

async function runFirebaseTests() {
  console.log('--- TESTING FIRESTORE INTEGRATION ---');

  // 1. Read global_stats
  const statsRes = await fetch(`${baseUrl}/ai_knowledge/global_stats?key=${apiKey}`);
  assert(statsRes.ok, 'Successfully retrieved ai_knowledge/global_stats from Firestore');
  const statsData = await statsRes.json();
  console.log('Current global_stats:', JSON.stringify(statsData.fields || {}));

  // 2. Write a simulated position knowledge document
  const testPosId = 'rnbqkbnr_pppppppp_8_8_4P3_8_PPPP1PPP_RNBQKBNR__b__KQkq__-';
  const posUrl = `${baseUrl}/ai_knowledge/global_stats/positions/${testPosId}?key=${apiKey}`;

  const writeRes = await fetch(posUrl, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        fen: { stringValue: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' },
        moves: {
          mapValue: {
            fields: {
              'e7e5': { doubleValue: 1.0 },
              'c7c5': { doubleValue: 0.8 },
              'g8f6': { doubleValue: -0.5 }
            }
          }
        }
      }
    })
  });
  assert(writeRes.ok, 'Successfully wrote position knowledge with moves map to Firestore');

  // 3. Query back the position knowledge
  const getRes = await fetch(posUrl);
  assert(getRes.ok, 'Successfully queried position knowledge back');
  const getDoc = await getRes.json();
  const moves = getDoc.fields.moves.mapValue.fields;
  assert(moves['e7e5'].doubleValue === 1.0, 'Move e7e5 has score 1.0');
  assert(moves['c7c5'].doubleValue === 0.8, 'Move c7c5 has score 0.8');
  assert(moves['g8f6'].doubleValue === -0.5, 'Move g8f6 has negative score -0.5');

  // Clean up test position document
  await fetch(posUrl, { method: 'DELETE' });
  console.log('Cleaned up test position document.');

  // 4. Test Attack Logic & Aggressive Decision Filter
  console.log('--- TESTING ROYALE KI ATTACK & REWARD LOGIC ---');
  const ChessEngine = require('../public/engine/chess.js');
  const FirebaseService = require('../public/firebase/firebaseService.js');
  const fbService = new FirebaseService();

  const game = new ChessEngine.ChessGame();
  // Set up a sharp tactical position: White can play Qxf7# or quiet move a2a3
  // 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6
  game.makeMove(game.generateLegalMoves('w').find(m => fbService.moveToUci(m) === 'e2e4'));
  game.makeMove(game.generateLegalMoves('b').find(m => fbService.moveToUci(m) === 'e7e5'));
  game.makeMove(game.generateLegalMoves('w').find(m => fbService.moveToUci(m) === 'd1h5'));
  game.makeMove(game.generateLegalMoves('b').find(m => fbService.moveToUci(m) === 'b8c6'));
  game.makeMove(game.generateLegalMoves('w').find(m => fbService.moveToUci(m) === 'f1c4'));
  game.makeMove(game.generateLegalMoves('b').find(m => fbService.moveToUci(m) === 'g8f6'));

  const legalMoves = game.generateLegalMoves('w');
  const mateMove = legalMoves.find(m => fbService.moveToUci(m) === 'h5f7');
  const quietMove = legalMoves.find(m => fbService.moveToUci(m) === 'a2a3');

  assert(mateMove !== undefined, 'Found Qxf7 mate move');
  assert(quietMove !== undefined, 'Found quiet a2a3 move');

  const mateAttackScore = fbService.calculateAttackBonus(game, mateMove);
  const quietAttackScore = fbService.calculateAttackBonus(game, quietMove);

  assert(mateAttackScore > 1500, `Mate move attack score is very high (>1500, got ${mateAttackScore})`);
  assert(mateAttackScore > quietAttackScore + 1000, `Mate move heavily outranks quiet move (${mateAttackScore} vs ${quietAttackScore})`);

  // Test Aggressive Decision Filter when Firestore has similar scores:
  // quietMove has 3.0, mateMove has 2.8 (similar scores in top band)
  const simulatedKnowledge = {
    moves: {
      'a2a3': 3.0,
      'h5f7': 2.8
    }
  };

  // With explorationRate = 0 (exploitation mode), the aggressive filter must pick h5f7 because of attack bonus!
  const chosenMove = fbService.selectRoyaleAIMove(game, simulatedKnowledge, { explorationRate: 0 });
  const chosenUci = fbService.moveToUci(chosenMove);
  assert(chosenUci === 'h5f7', `Aggressive filter chose attacking move h5f7 over passive move a2a3 despite similar score (chose: ${chosenUci})`);

  // Test 15% Exploration Mode (explorationRate = 1.0)
  const exploredMove = fbService.selectRoyaleAIMove(game, simulatedKnowledge, { explorationRate: 1.0 });
  assert(exploredMove !== null, 'Exploration mode returned a valid legal move');
  const exploredAttackBonus = fbService.calculateAttackBonus(game, exploredMove);
  assert(exploredAttackBonus > 0, 'Explored move is calculated offensive move');

  console.log('ALL FIRESTORE INTEGRATION & ATTACK LOGIC TESTS PASSED!');
}

runFirebaseTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

