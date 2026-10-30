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

  console.log('ALL FIRESTORE INTEGRATION TESTS PASSED!');
}

runFirebaseTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
