/**
 * Web Worker for Asynchronous Chess AI Evaluation & Training
 * Prevents UI freezes and frame drops during deep alpha-beta search
 */

importScripts('../engine/chess.js', 'chessAI.js');

let aiInstance = null;

self.onmessage = function (e) {
  const data = e.data;
  if (!data) return;

  switch (data.type) {
    case 'init': {
      aiInstance = new self.ChessAI(data.weights || {});
      self.postMessage({ type: 'initialized' });
      break;
    }

    case 'search': {
      if (!aiInstance) aiInstance = new self.ChessAI(data.weights || {});
      const game = new self.ChessEngine.ChessGame(data.fen);
      const depth = data.depth || 3;
      const result = aiInstance.getBestMove(game, depth);

      self.postMessage({
        type: 'searchResult',
        requestId: data.requestId,
        result
      });
      break;
    }

    case 'train': {
      if (!aiInstance) aiInstance = new self.ChessAI();
      const numGames = data.games || 5;

      aiInstance.trainSelfPlay(numGames, (prog) => {
        self.postMessage({
          type: 'trainProgress',
          progress: prog
        });
      }).then((stats) => {
        self.postMessage({
          type: 'trainComplete',
          stats
        });
      });
      break;
    }

    case 'getStats': {
      if (!aiInstance) aiInstance = new self.ChessAI();
      self.postMessage({
        type: 'stats',
        stats: aiInstance.getTrainingStats()
      });
      break;
    }

    case 'setWeights': {
      if (!aiInstance) aiInstance = new self.ChessAI();
      aiInstance.setWeights(data.weights);
      self.postMessage({ type: 'weightsUpdated', weights: aiInstance.getWeights() });
      break;
    }

    default:
      console.warn('Unknown AI worker command:', data.type);
  }
};
