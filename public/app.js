/**
 * Main Application Controller for Royal Chess
 * Coordinates Game Engine, Canvas Renderer, AI Worker, Audio, and Multiplayer
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Core Subsystems
  const game = new ChessEngine.ChessGame();
  const sound = new SoundManager();
  const canvas = document.getElementById('chessCanvas');
  const renderer = new BoardRenderer(canvas, game);

  // Initialize Firebase Firestore Service for Global AI Learning & Stats
  const firebaseService = new FirebaseService();

  // Subscribe to live global stats in header
  firebaseService.subscribeGlobalStats((stats) => {
    const gamesEl = document.getElementById('globalGamesCount');
    const posEl = document.getElementById('globalPositionsCount');
    if (gamesEl) gamesEl.innerText = stats.total_games.toLocaleString();
    if (posEl) posEl.innerText = stats.total_positions.toLocaleString();

    document.querySelectorAll('.stat-pill').forEach(el => {
      el.classList.add('flash-update');
      setTimeout(() => el.classList.remove('flash-update'), 1000);
    });
  });

  // Initialize Web Worker for AI
  let aiWorker = null;
  try {
    aiWorker = new Worker('ai/aiWorker.js');
    aiWorker.postMessage({ type: 'init' });
  } catch (e) {
    console.warn('Web Worker not supported or blocked in local file mode, using main thread AI fallback', e);
  }
  const fallbackAI = new ChessAI();

  // Initialize WebSocket Multiplayer Client
  const socket = new ClientSocket({
    onConnect: () => updateConnectionStatus(true),
    onDisconnect: () => updateConnectionStatus(false),
    onPing: (ms) => updatePing(ms),
    onRoomCreated: (data) => handleRoomCreated(data),
    onMatchStart: (data) => handleMatchStart(data),
    onMove: (data) => handleRemoteMove(data),
    onGameOver: (data) => handleRemoteGameOver(data),
    onError: (msg) => alert(msg)
  });
  socket.connect();

  // App State: Permanenter Entwickler- & Trainingsmodus ("Testphase")
  // Fester Standard-Spieler: Name "Jeremy", Rolle "admin", Start-ELO 1500
  const savedUser = JSON.parse(localStorage.getItem('worldcraft_player_profile') || '{}');
  const state = {
    gameMode: 'ai', // 'ai' | 'pass_and_play' | 'multiplayer'
    aiDifficulty: 'firebase_rl', // 'firebase_rl' (default) | '3' | '1'
    playerColor: 'w',
    isThinking: false,
    pendingPromotionMove: null,
    whiteTime: 600,
    blackTime: 600,
    clockTimer: null,
    historyIndex: -1,
    currentUser: {
      id: savedUser.id || 'user_jeremy_admin',
      name: 'Jeremy',
      role: 'admin',
      rating: 1500,
      rankedMatches: savedUser.rankedMatches || { played: 0, wins: 0, losses: 0, draws: 0 },
      aiMatches: savedUser.aiMatches || { played: 0, wins: 0, losses: 0, draws: 0 }
    },
    isTrainingActive: false,
    trainingCancelled: false
  };

  // Enforce Jeremy Admin profile in permanent testphase
  state.currentUser.name = 'Jeremy';
  state.currentUser.role = 'admin';
  if (!state.currentUser.rating) state.currentUser.rating = 1500;
  saveUserProfile();

  function saveUserProfile() {
    localStorage.setItem('worldcraft_player_profile', JSON.stringify(state.currentUser));
    localStorage.setItem('worldcraft_user_role', state.currentUser.role);
    localStorage.setItem('worldcraft_user_rating', state.currentUser.rating);
  }

  function updateProfileDisplay() {
    const whiteRatingEl = document.getElementById('whitePlayerRating');
    const blackRatingEl = document.getElementById('blackPlayerRating');
    const userRankedEloEl = document.getElementById('userRankedElo');
    const userRankedStatsEl = document.getElementById('userRankedStats');
    const userAiMatchesCountEl = document.getElementById('userAiMatchesCount');
    const userAiStatsEl = document.getElementById('userAiStats');
    const modeBadgeEl = document.getElementById('currentModeBadge');
    const opponentTitleEl = document.getElementById('opponentTitle');
    const whiteAvatarEl = document.getElementById('whiteAvatar');
    if (whitePlayerNameEl && state.currentUser.name) {
      whitePlayerNameEl.innerText = state.currentUser.name;
    }
    if (whiteAvatarEl && state.currentUser.name) {
      whiteAvatarEl.innerText = state.currentUser.name.charAt(0).toUpperCase();
    }
    if (whiteRatingEl) {
      whiteRatingEl.innerText = `${state.currentUser.rating} ELO`;
    }
    if (userRankedEloEl) {
      userRankedEloEl.innerText = `${state.currentUser.rating} ELO`;
    }
    if (userRankedStatsEl) {
      const rm = state.currentUser.rankedMatches;
      userRankedStatsEl.innerText = `${rm.wins}S / ${rm.losses}N (${rm.played} Spiele)`;
    }
    if (userAiMatchesCountEl) {
      userAiMatchesCountEl.innerText = `${state.currentUser.aiMatches.played} Partien`;
    }
    if (userAiStatsEl) {
      const am = state.currentUser.aiMatches;
      userAiStatsEl.innerText = `${am.wins}S / ${am.losses}N / ${am.draws}R`;
    }

    if (state.gameMode === 'ai') {
      if (blackRatingEl) blackRatingEl.innerText = 'Trainingspartner (Ungewertet)';
      if (modeBadgeEl) modeBadgeEl.innerText = 'Trainingsspiel (Ungewertet)';
      if (opponentTitleEl) opponentTitleEl.innerText = 'BOT (Trainingspartner)';
    } else if (state.gameMode === 'multiplayer') {
      if (blackRatingEl) blackRatingEl.innerText = 'Online-Gegner';
      if (modeBadgeEl) modeBadgeEl.innerText = 'Gewertet (Ranked)';
      if (opponentTitleEl) opponentTitleEl.innerText = 'ONLINE';
    } else {
      if (blackRatingEl) blackRatingEl.innerText = 'Lokal (Ungewertet)';
      if (modeBadgeEl) modeBadgeEl.innerText = 'Pass & Play';
      if (opponentTitleEl) opponentTitleEl.innerText = 'LOKAL';
    }
  }

  // 2. Wire Move Callback from Canvas Renderer
  renderer.onMoveAttempt = (move) => {
    // If AI is currently calculating/thinking, prevent user interactions
    if (state.isThinking) {
      return;
    }

    // If not player's turn in multiplayer or AI mode
    if (state.gameMode === 'multiplayer' && game.turn !== state.playerColor) {
      return;
    }
    if (state.gameMode === 'ai' && game.turn !== state.playerColor) {
      return;
    }

    // Check if move is a Pawn Promotion
    const piece = move.piece;
    const destRank = Math.floor(move.to / 8);
    const isPromo = piece && piece.type === 'p' && (destRank === 0 || destRank === 7);

    if (isPromo && !move.userSelectedPromotion) {
      // Pause move execution immediately and open promotion selection modal
      state.pendingPromotionMove = { ...move, userSelectedPromotion: true };
      openPromotionModal(piece.color);
      return;
    }

    executePlayerMove(move);
  };

  function executePlayerMove(move) {
    if (state.gameMode === 'multiplayer') {
      socket.sendMove(move);
      return;
    }

    const res = game.makeMove(move);
    if (!res) return;

    onMoveSuccess(res);

    // If playing against AI, trigger AI response with natural delay
    if (state.gameMode === 'ai' && !game.getGameStatus().isGameOver) {
      triggerAIMove();
    }
  }

  function onMoveSuccess(res) {
    renderer.setLastMove(res.from, res.to);
    renderer.clearSelection();
    renderer.draw();

    // Play appropriate procedural sound
    if (game.isInCheck(game.turn)) {
      sound.playCheck();
    } else if (res.captured || res.isEnPassant) {
      sound.playCapture();
    } else if (res.isCastling) {
      sound.playCastle();
    } else {
      sound.playMove();
    }

    updateUI();

    const status = game.getGameStatus();
    if (status.isGameOver) {
      handleGameOver(status);
    }
  }

  // 3. AI Move Execution with Firebase Global Reinforcement Learning
  let aiThinkInterval = null;

  async function triggerAIMove() {
    state.isThinking = true;
    renderer.isLocked = true;

    // Dynamic thinking duration: randomized between 700ms and 1600ms (applies to forced moves as well)
    const minThinkingTime = 700 + Math.floor(Math.random() * 900);
    const startTime = Date.now();

    // Animated thinking status indicator
    let dotCount = 0;
    const turnEl = document.getElementById('turnBadge');
    turnEl.style.color = 'var(--accent-gold)';
    turnEl.innerText = 'Royale KI Engine überlegt';

    if (aiThinkInterval) clearInterval(aiThinkInterval);
    aiThinkInterval = setInterval(() => {
      dotCount = (dotCount + 1) % 4;
      turnEl.innerText = `Royale KI Engine überlegt${'.'.repeat(dotCount)}`;
    }, 280);

    const finalizeAIMove = (bestMove) => {
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, minThinkingTime - elapsed);

      setTimeout(() => {
        if (aiThinkInterval) {
          clearInterval(aiThinkInterval);
          aiThinkInterval = null;
        }
        state.isThinking = false;
        renderer.isLocked = false;
        if (bestMove) {
          const aiRes = game.makeMove(bestMove);
          if (aiRes) onMoveSuccess(aiRes);
        }
      }, remainingDelay);
    };

    const legalMoves = game.generateLegalMoves(game.turn);
    if (legalMoves.length === 0) {
      if (aiThinkInterval) clearInterval(aiThinkInterval);
      state.isThinking = false;
      renderer.isLocked = false;
      return;
    }

    // A: Firebase Firestore Learning Mode (Default & requested)
    if (state.aiDifficulty === 'firebase_rl') {
      const currentFen = game.getFen();
      let chosenMove = null;

      try {
        const knowledge = await firebaseService.getPositionKnowledge(currentFen);
        // Aktives Angriffsspiel: 15% Exploration + Aggressiver Entscheidungs-Filter bei ähnlichen Werten
        chosenMove = firebaseService.selectRoyaleAIMove(game, knowledge, { explorationRate: 0.15 });
      } catch (err) {
        console.warn('[Royale KI] Fehler bei Firestore-Abfrage:', err);
      }

      if (!chosenMove) {
        chosenMove = firebaseService.selectRoyaleAIMove(game, null, { explorationRate: 0.15 });
      }

      finalizeAIMove(chosenMove);
      return;
    }

    // B: Fallback Classical Minimax calculation if chosen by user
    const depth = parseInt(state.aiDifficulty, 10) || 3;
    const fen = game.getFen();
    if (aiWorker) {
      const reqId = Date.now();
      const onMsg = (e) => {
        if (e.data.type === 'searchResult' && e.data.requestId === reqId) {
          aiWorker.removeEventListener('message', onMsg);
          finalizeAIMove(e.data.result ? e.data.result.bestMove : null);
        }
      };
      aiWorker.addEventListener('message', onMsg);
      aiWorker.postMessage({ type: 'search', fen, depth, requestId: reqId });
    } else {
      setTimeout(() => {
        const res = fallbackAI.getBestMove(game, depth);
        finalizeAIMove(res ? res.bestMove : null);
      }, 50);
    }
  }

  // 4. Clocks Management
  function startClocks() {
    stopClocks();
    state.clockTimer = setInterval(() => {
      const status = game.getGameStatus();
      if (status.isGameOver) {
        stopClocks();
        return;
      }

      if (game.turn === 'w') {
        state.whiteTime = Math.max(0, state.whiteTime - 1);
        if (state.whiteTime === 0) handleTimeout('b');
      } else {
        state.blackTime = Math.max(0, state.blackTime - 1);
        if (state.blackTime === 0) handleTimeout('w');
      }
      updateClocksDisplay();
    }, 1000);
  }

  function stopClocks() {
    if (state.clockTimer) {
      clearInterval(state.clockTimer);
      state.clockTimer = null;
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function updateClocksDisplay() {
    const whiteEl = document.getElementById('whiteClock');
    const blackEl = document.getElementById('blackClock');

    whiteEl.innerText = formatTime(state.whiteTime);
    blackEl.innerText = formatTime(state.blackTime);

    whiteEl.classList.toggle('active-turn', game.turn === 'w');
    blackEl.classList.toggle('active-turn', game.turn === 'b');

    whiteEl.classList.toggle('low-time', state.whiteTime < 30);
    blackEl.classList.toggle('low-time', state.blackTime < 30);
  }

  function handleTimeout(winner) {
    stopClocks();
    if (aiThinkInterval) {
      clearInterval(aiThinkInterval);
      aiThinkInterval = null;
    }
    state.isThinking = false;
    renderer.isLocked = false;
    sound.playGameEnd();

    let timeoutMsg = `Zeit abgelaufen! ${winner === 'w' ? 'Weiß' : 'Schwarz'} gewinnt.`;
    if (state.gameMode === 'ai') {
      state.currentUser.aiMatches.played++;
      if (winner === state.playerColor) {
        state.currentUser.aiMatches.wins++;
      } else {
        state.currentUser.aiMatches.losses++;
      }
      saveUserProfile();
      updateProfileDisplay();
      timeoutMsg += `\n\n🛡️ Trainingsspiel: Deine 1500 ELO bleibt unverändert.\nKI-Matches Bilanz: ${state.currentUser.aiMatches.wins}S / ${state.currentUser.aiMatches.losses}N / ${state.currentUser.aiMatches.draws}R.`;
    }

    openGameOverModal('Zeitüberschreitung', timeoutMsg);

    // Persist game outcome to Firebase Firestore
    firebaseService.recordGameOutcome({
      moveHistory: game.moveHistory,
      winner,
      isDraw: false,
      aiColor: state.playerColor === 'w' ? 'b' : 'w'
    });
  }

  function handleGameOver(status) {
    stopClocks();
    if (aiThinkInterval) {
      clearInterval(aiThinkInterval);
      aiThinkInterval = null;
    }
    state.isThinking = false;
    renderer.isLocked = false;
    sound.playGameEnd();

    let title = 'Partie Beendet';
    let message = status.reason || '';

    if (status.status === 'stalemate') {
      title = 'Unentschieden durch Patt';
      message = 'Unentschieden: Der Spieler am Zug steht nicht im Schach, besitzt aber keinen legalen Zug mehr.';
    } else if (status.status === 'checkmate') {
      title = 'Schachmatt!';
      message = status.reason;
    } else if (status.status === 'threefold_repetition') {
      title = 'Unentschieden';
      message = 'Remis durch dreifache Stellungswiederholung.';
    } else if (status.status === 'fifty_move_rule') {
      title = 'Unentschieden';
      message = 'Remis durch 50-Züge-Regel.';
    } else if (status.status === 'insufficient_material') {
      title = 'Unentschieden';
      message = 'Remis durch unzureichendes Material zur Mattsetzung.';
    }

    const isDraw = status.status === 'stalemate' || status.status === 'threefold_repetition' ||
                   status.status === 'fifty_move_rule' || status.status === 'insufficient_material';
    const winner = status.winner;

    // ELO-Schutz vor Farming (Trainingsmodus vs KI)
    if (state.gameMode === 'ai') {
      state.currentUser.aiMatches.played++;
      if (isDraw) {
        state.currentUser.aiMatches.draws++;
      } else if (winner === state.playerColor) {
        state.currentUser.aiMatches.wins++;
      } else {
        state.currentUser.aiMatches.losses++;
      }
      saveUserProfile();
      updateProfileDisplay();
      message += `\n\n🛡️ Trainingsspiel: Deine menschliche Start-ELO (1500) bleibt geschützt.\nKI-Matches Bilanz: ${state.currentUser.aiMatches.wins}S / ${state.currentUser.aiMatches.losses}N / ${state.currentUser.aiMatches.draws}R.`;
    }

    openGameOverModal(title, message);

    // Persist game outcome to Firebase Firestore
    firebaseService.recordGameOutcome({
      moveHistory: game.moveHistory,
      winner,
      isDraw,
      aiColor: state.playerColor === 'w' ? 'b' : 'w'
    });
  }

  // 5. UI Updates: Captures, Move History, Status
  function updateUI() {
    // Turn badge
    const turnEl = document.getElementById('turnBadge');
    if (game.turn === 'w') {
      turnEl.innerText = 'Weiß am Zug';
      turnEl.style.color = '#F2ECDB';
    } else {
      turnEl.innerText = 'Schwarz am Zug';
      turnEl.style.color = '#B8A898';
    }

    // Material difference & captured pieces
    const PIECE_VALS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let scoreW = 0;
    let scoreB = 0;

    game.capturedPieces.w.forEach(p => scoreW += PIECE_VALS[p.type]);
    game.capturedPieces.b.forEach(p => scoreB += PIECE_VALS[p.type]);

    const diff = scoreW - scoreB;
    document.getElementById('whiteMaterialDiff').innerText = diff > 0 ? `+${diff}` : '';
    document.getElementById('blackMaterialDiff').innerText = diff < 0 ? `+${Math.abs(diff)}` : '';

    renderCapturedIcons('whiteCaptured', game.capturedPieces.w);
    renderCapturedIcons('blackCaptured', game.capturedPieces.b);

    // Update Move History Table
    renderMoveHistory();
  }

  function renderCapturedIcons(containerId, pieces) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const sorted = pieces.slice().sort((a, b) => {
      const order = { q: 1, r: 2, b: 3, n: 4, p: 5 };
      return order[a.type] - order[b.type];
    });

    sorted.forEach(p => {
      const span = document.createElement('span');
      span.className = 'captured-piece-icon';
      span.innerText = getPieceSymbol(p.color, p.type);
      container.appendChild(span);
    });
  }

  function getPieceSymbol(color, type) {
    const symbols = {
      w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
      b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
    };
    return symbols[color][type];
  }

  function renderMoveHistory() {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = '';

    const moves = game.moveHistory;
    for (let i = 0; i < moves.length; i += 2) {
      const tr = document.createElement('tr');
      const roundNum = Math.floor(i / 2) + 1;

      const tdNum = document.createElement('td');
      tdNum.innerText = `${roundNum}.`;
      tdNum.style.color = 'var(--text-muted)';
      tr.appendChild(tdNum);

      const tdWhite = document.createElement('td');
      tdWhite.className = 'move-san';
      tdWhite.innerText = moves[i].san;
      tr.appendChild(tdWhite);

      const tdBlack = document.createElement('td');
      tdBlack.className = 'move-san';
      tdBlack.innerText = moves[i + 1] ? moves[i + 1].san : '';
      tr.appendChild(tdBlack);

      tbody.appendChild(tr);
    }

    const container = document.getElementById('historyContainer');
    container.scrollTop = container.scrollHeight;
  }

  // 6. Promotion Dialog Handling
  function openPromotionModal(color) {
    const modal = document.getElementById('promotionModal');
    const optionsContainer = document.getElementById('promotionOptions');
    optionsContainer.innerHTML = '';

    const promos = [
      { type: 'q', name: 'Dame' },
      { type: 'r', name: 'Turm' },
      { type: 'b', name: 'Läufer' },
      { type: 'n', name: 'Springer' }
    ];

    promos.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'promo-piece-btn';
      btn.title = opt.name;

      const img = document.createElement('img');
      img.src = renderer.pieceImages[`${color}${opt.type}`]?.src || '';
      btn.appendChild(img);

      btn.onclick = () => {
        modal.classList.remove('active');
        if (state.pendingPromotionMove) {
          const fullMove = {
            ...state.pendingPromotionMove,
            promotion: opt.type,
            userSelectedPromotion: true
          };
          state.pendingPromotionMove = null;
          executePlayerMove(fullMove);
        }
      };
      optionsContainer.appendChild(btn);
    });

    modal.classList.add('active');
  }

  function openGameOverModal(title, message) {
    if (!message) {
      message = title;
      title = 'Partie Beendet';
    }
    const titleEl = document.getElementById('gameOverTitle');
    if (titleEl) titleEl.innerText = title;
    document.getElementById('gameOverText').innerText = message;
    document.getElementById('gameOverModal').classList.add('active');
  }

  // 7. Multiplayer Handlers
  function handleRoomCreated(data) {
    document.getElementById('multiStatus').innerText = `Raum erstellt: ${data.roomId}. Warte auf Gegner...`;
    document.getElementById('joinRoomInput').value = data.roomId;
    state.playerColor = data.color;
    if (data.color === 'b') {
      renderer.options.flipped = true;
      renderer.draw();
    }
  }

  function handleMatchStart(data) {
    document.getElementById('multiStatus').innerText = `Partie gestartet! Gegner: ${data.white.id === socket.currentRoom ? data.black.name : data.white.name}`;
    game.loadFen(data.fen);
    renderer.clearSelection();
    renderer.draw();

    document.getElementById('whitePlayerName').innerText = data.white.name;
    document.getElementById('whitePlayerRating').innerText = `${data.white.rating} ELO`;
    document.getElementById('blackPlayerName').innerText = data.black.name;
    document.getElementById('blackPlayerRating').innerText = `${data.black.rating} ELO`;

    state.whiteTime = data.timeControl.base;
    state.blackTime = data.timeControl.base;
    startClocks();
    updateUI();
  }

  function handleRemoteMove(data) {
    game.loadFen(data.fen);
    renderer.setLastMove(data.move.from, data.move.to);
    renderer.draw();

    state.whiteTime = data.whiteTime;
    state.blackTime = data.blackTime;
    updateClocksDisplay();

    if (data.move.captured) sound.playCapture();
    else if (data.move.isCastling) sound.playCastle();
    else sound.playMove();

    updateUI();
  }

  function handleRemoteGameOver(data) {
    stopClocks();
    sound.playGameEnd();
    openGameOverModal(data.message);
    loadLeaderboard(); // Refresh ratings
  }

  function updateConnectionStatus(connected) {
    const dot = document.getElementById('connDot');
    const text = document.getElementById('connText');
    if (connected) {
      dot.className = 'status-dot';
      text.innerText = 'Online';
    } else {
      dot.className = 'status-dot disconnected';
      text.innerText = 'Lokal / Offline';
    }
  }

  function updatePing(ms) {
    document.getElementById('pingBadge').innerText = `${ms} ms`;
  }

  // 8. Reinforcement Learning Lab Controls
  document.getElementById('btnStartTraining').onclick = () => {
    const games = parseInt(document.getElementById('trainGamesInput').value, 10) || 5;
    const progressFill = document.getElementById('trainProgressFill');
    const trainStatusText = document.getElementById('trainStatusText');

    trainStatusText.innerText = `Trainiere ${games} Selbstspiel-Partien...`;
    progressFill.style.width = '0%';

    if (aiWorker) {
      const onTrainProgress = (e) => {
        if (e.data.type === 'trainProgress') {
          const prog = e.data.progress;
          const pct = Math.round((prog.gameIndex / prog.totalGames) * 100);
          progressFill.style.width = `${pct}%`;
          trainStatusText.innerText = `Partie ${prog.gameIndex}/${prog.totalGames}: ${prog.result}`;
          updateWeightsUI(prog.weights);
        } else if (e.data.type === 'trainComplete') {
          aiWorker.removeEventListener('message', onTrainProgress);
          trainStatusText.innerText = `Training abgeschlossen! ${e.data.stats.gamesTrained} Partien absolviert.`;
          document.getElementById('policySizeBadge').innerText = `${e.data.stats.policySize} Stellungen`;
        }
      };
      aiWorker.addEventListener('message', onTrainProgress);
      aiWorker.postMessage({ type: 'train', games });
    } else {
      // Main thread
      fallbackAI.trainSelfPlay(games, (prog) => {
        const pct = Math.round((prog.gameIndex / prog.totalGames) * 100);
        progressFill.style.width = `${pct}%`;
        trainStatusText.innerText = `Partie ${prog.gameIndex}/${prog.totalGames}: ${prog.result}`;
        updateWeightsUI(prog.weights);
      }).then((stats) => {
        trainStatusText.innerText = `Training abgeschlossen!`;
        document.getElementById('policySizeBadge').innerText = `${stats.policySize} Stellungen`;
      });
    }
  };

  function updateWeightsUI(weights) {
    document.getElementById('weightMaterial').innerText = weights.material.toFixed(2);
    document.getElementById('weightPst').innerText = weights.pst.toFixed(2);
    document.getElementById('weightMobility').innerText = weights.mobility.toFixed(2);
    document.getElementById('weightKing').innerText = weights.kingSafety.toFixed(2);
    document.getElementById('weightCenter').innerText = weights.centerControl.toFixed(2);
  }

  // Weights Export / Import
  document.getElementById('btnExportWeights').onclick = () => {
    const w = fallbackAI.getWeights();
    const blob = new Blob([JSON.stringify(w, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess_ai_weights_gen.json`;
    a.click();
  };

  document.getElementById('btnResetWeights').onclick = () => {
    fallbackAI.resetWeights();
    updateWeightsUI(fallbackAI.getWeights());
    if (aiWorker) aiWorker.postMessage({ type: 'setWeights', weights: fallbackAI.getWeights() });
    alert('KI-Gewichte erfolgreich auf Werkseinstellungen zurückgesetzt.');
  };

  // 9. Leaderboard Fetch & Rendering
  async function loadLeaderboard() {
    const region = document.getElementById('leaderboardRegionSelect').value;
    try {
      const res = await fetch(`/api/leaderboard?region=${encodeURIComponent(region)}`);
      if (!res.ok) return;
      const list = await res.json();

      const container = document.getElementById('leaderboardList');
      container.innerHTML = '';

      list.forEach(p => {
        const row = document.createElement('div');
        row.className = 'leaderboard-row';

        const rankClass = p.rank === 1 ? 'rank-1' : (p.rank === 2 ? 'rank-2' : (p.rank === 3 ? 'rank-3' : ''));

        row.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="rank-badge ${rankClass}">#${p.rank}</span>
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${p.title ? `<span class="player-title">${p.title}</span>` : ''}
                <strong style="font-size:0.9rem;">${p.name}</strong>
              </div>
              <span style="font-size:0.75rem; color:var(--text-muted);">${p.region} (${p.country})</span>
            </div>
          </div>
          <div style="text-align:right;">
            <span style="font-weight:700; color:var(--accent-gold); font-size:0.95rem;">${p.rating}</span>
            <div style="font-size:0.7rem; color:var(--text-muted);">${p.wins}S / ${p.losses}N (${p.winRate}%)</div>
          </div>
        `;
        container.appendChild(row);
      });
    } catch (e) {
      console.warn('Leaderboard API offline or running standalone without server:', e);
    }
  }

  document.getElementById('leaderboardRegionSelect').onchange = () => loadLeaderboard();

  // 10. Toolbar & General Event Listeners
  document.getElementById('btnFlip').onclick = () => renderer.flipBoard();

  document.getElementById('btnNewGame').onclick = () => {
    openGameStartModal();
  };

  document.getElementById('btnResign').onclick = () => {
    if (confirm('Möchtest du die Partie wirklich aufgeben?')) {
      if (state.gameMode === 'multiplayer') {
        socket.resign();
      } else {
        const winner = game.turn === 'w' ? 'Schwarz' : 'Weiß';
        handleGameOver({
          status: 'resignation',
          winner: game.turn === 'w' ? 'b' : 'w',
          reason: `${game.turn === 'w' ? 'Weiß' : 'Schwarz'} hat aufgegeben. ${winner} gewinnt.`
        });
      }
    }
  };

  document.getElementById('btnSoundToggle').onclick = (e) => {
    sound.enabled = !sound.enabled;
    e.currentTarget.style.color = sound.enabled ? 'var(--accent-gold)' : 'var(--text-muted)';
  };

  document.getElementById('btnExportPgn').onclick = () => {
    const pgn = game.exportPgn();
    navigator.clipboard.writeText(pgn).then(() => {
      alert('PGN in die Zwischenablage kopiert:\n\n' + pgn);
    });
  };

  // Tab Switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'tabLeaderboard') {
        loadLeaderboard();
      }
    };
  });

  // Game Mode Switching
  document.getElementById('gameModeSelect').onchange = (e) => {
    state.gameMode = e.target.value;
    const aiBox = document.getElementById('aiSettingsBox');
    const multiBox = document.getElementById('multiSettingsBox');

    aiBox.style.display = state.gameMode === 'ai' ? 'block' : 'none';
    multiBox.style.display = state.gameMode === 'multiplayer' ? 'block' : 'none';

    updateProfileDisplay();
  };

  document.getElementById('aiDifficultySelect').onchange = (e) => {
    state.aiDifficulty = e.target.value;
  };

  // Multiplayer Buttons
  document.getElementById('btnCreateRoom').onclick = () => {
    const name = document.getElementById('multiPlayerName').value || state.currentUser.name || 'Meister_Weiß';
    socket.createRoom(null, name, 'w', { base: 600, inc: 0 });
  };

  document.getElementById('btnJoinRoom').onclick = () => {
    const code = document.getElementById('joinRoomInput').value.trim();
    const name = document.getElementById('multiPlayerName').value || state.currentUser.name || 'Meister_Gast';
    if (!code) {
      alert('Bitte gib einen Raum-Code ein!');
      return;
    }
    socket.joinRoom(code, null, name);
  };

  document.getElementById('btnQuickMatch').onclick = () => {
    const name = document.getElementById('multiPlayerName').value || state.currentUser.name || 'Meister_Schnell';
    document.getElementById('multiStatus').innerText = 'Suche nach passendem Gegner im ELO-Bereich...';
    socket.quickMatch(null, name, state.currentUser.rating || 1500, { base: 600, inc: 0 });
  };

  document.getElementById('btnModalNewGame').onclick = () => {
    document.getElementById('gameOverModal').classList.remove('active');
    openGameStartModal();
  };

  // 11. Interaktives Regel-Kompendium ("Regelbuch")
  const rulebookModal = document.getElementById('rulebookModal');
  const openRulebook = () => {
    if (rulebookModal) {
      rulebookModal.classList.add('active');
      // Ensure the first tab is selected and shown
      const firstBtn = rulebookModal.querySelector('.rule-tab-btn');
      const firstPane = document.getElementById('ruleTabPieces');
      if (firstBtn && firstPane) {
        rulebookModal.querySelectorAll('.rule-tab-btn').forEach(b => b.classList.remove('active'));
        rulebookModal.querySelectorAll('.rule-tab-pane').forEach(p => p.classList.remove('active'));
        firstBtn.classList.add('active');
        firstPane.classList.add('active');
      }
    }
  };
  const closeRulebook = () => {
    if (rulebookModal) rulebookModal.classList.remove('active');
  };

  document.getElementById('btnRulebook')?.addEventListener('click', openRulebook);
  document.getElementById('btnHeaderRulebook')?.addEventListener('click', openRulebook);
  document.getElementById('btnCloseRulebook')?.addEventListener('click', closeRulebook);

  rulebookModal?.addEventListener('click', (e) => {
    if (e.target === rulebookModal) {
      closeRulebook();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRulebook();
      closeAdminTraining();
      closeGameStartModal();
      document.getElementById('promotionModal')?.classList.remove('active');
      document.getElementById('gameOverModal')?.classList.remove('active');
    }
  });

  document.querySelectorAll('.rule-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.rule-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.rule-tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPane = document.getElementById(btn.getAttribute('data-ruletab'));
      if (targetPane) targetPane.classList.add('active');
    };
  });

  // 12. Admin KI-Trainingszentrum (Trainer-Bot vs. Royale KI Engine)
  const adminTrainingModal = document.getElementById('adminTrainingModal');
  const btnHeaderAdminTraining = document.getElementById('btnHeaderAdminTraining');
  const btnCloseAdminTraining = document.getElementById('btnCloseAdminTraining');
  const adminStatusText = document.getElementById('adminStatusText');

  function checkAdminStatus() {
    // Permanenter Entwickler- & Trainingsmodus ("Testphase"): Admin immer aktiv
    state.currentUser.role = 'admin';
    if (btnHeaderAdminTraining) {
      btnHeaderAdminTraining.style.display = 'inline-flex';
    }
    if (adminStatusText) {
      adminStatusText.innerText = 'Admin-Modus: Aktiviert';
      adminStatusText.classList.add('active');
    }
  }

  adminStatusText?.addEventListener('click', () => {
    checkAdminStatus();
  });

  // Listen to player name changes in multiplayer settings
  document.getElementById('multiPlayerName')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    if (val) {
      state.currentUser.name = val;
      if (val.toLowerCase() === 'admin') {
        state.currentUser.role = 'admin';
      }
      saveUserProfile();
      checkAdminStatus();
      updateProfileDisplay();
    }
  });

  const openAdminTraining = () => {
    if (adminTrainingModal) adminTrainingModal.classList.add('active');
  };
  const closeAdminTraining = () => {
    if (adminTrainingModal) adminTrainingModal.classList.remove('active');
  };

  btnHeaderAdminTraining?.addEventListener('click', openAdminTraining);
  btnCloseAdminTraining?.addEventListener('click', closeAdminTraining);
  adminTrainingModal?.addEventListener('click', (e) => {
    if (e.target === adminTrainingModal) closeAdminTraining();
  });

  // Mode A button
  document.getElementById('btnAdminModeA')?.addEventListener('click', () => {
    closeAdminTraining();
    state.gameMode = 'ai';
    document.getElementById('gameModeSelect').value = 'ai';
    document.getElementById('aiSettingsBox').style.display = 'block';
    document.getElementById('multiSettingsBox').style.display = 'none';
    updateProfileDisplay();
    openGameStartModal();
  });

  // Mode B round selection
  let selectedRounds = 10;
  document.querySelectorAll('.admin-round-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.admin-round-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRounds = parseInt(btn.dataset.rounds, 10);
      document.getElementById('adminCustomRounds').value = selectedRounds;
    };
  });

  document.getElementById('adminCustomRounds')?.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      selectedRounds = Math.min(500, val);
      document.querySelectorAll('.admin-round-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.rounds, 10) === selectedRounds);
      });
    }
  });

  // Compact Minimizable Dashboard at Board Edge
  const compactDashboard = document.getElementById('compactTrainingDashboard');
  const compactRoundText = document.getElementById('compactRoundText');
  const compactProgressFill = document.getElementById('compactProgressFill');
  const compactScoreTrainer = document.getElementById('compactScoreTrainer');
  const compactScoreRoyale = document.getElementById('compactScoreRoyale');
  const compactScoreDraws = document.getElementById('compactScoreDraws');
  const compactLogText = document.getElementById('compactLogText');
  const btnToggleCompact = document.getElementById('btnToggleCompactTrain');
  const btnCompactCancel = document.getElementById('btnCompactCancel');
  const btnStartBot = document.getElementById('btnStartBotTraining');

  btnToggleCompact?.addEventListener('click', () => {
    compactDashboard.classList.toggle('minimized');
    const isMin = compactDashboard.classList.contains('minimized');
    btnToggleCompact.innerText = isMin ? '+' : '–';
  });

  btnCompactCancel?.addEventListener('click', () => {
    if (state.isTrainingActive) {
      state.trainingCancelled = true;
      if (compactLogText) compactLogText.innerText = '⚠️ Abbruch angefordert...';
      btnCompactCancel.disabled = true;
      btnCompactCancel.innerText = 'Stoppt...';
    }
  });

  function updateCompactLog(msg) {
    if (compactLogText) {
      compactLogText.innerText = msg;
    }
  }

  // Bot-vs-Bot Training Loop (Modus B)
  btnStartBot?.addEventListener('click', async () => {
    if (state.isTrainingActive) return;

    // Automatically close the big modal so it's not in the way!
    closeAdminTraining();

    state.isTrainingActive = true;
    state.trainingCancelled = false;
    btnStartBot.disabled = true;
    btnStartBot.innerText = 'Training läuft...';
    if (btnCompactCancel) {
      btnCompactCancel.disabled = false;
      btnCompactCancel.innerText = '⏹️ Stop';
    }

    // Show compact dashboard at board edge
    if (compactDashboard) {
      compactDashboard.classList.remove('minimized');
      compactDashboard.classList.add('active');
    }

    const totalRounds = selectedRounds;
    const visMode = document.querySelector('input[name="adminVisMode"]:checked')?.value || 'live';
    const isLive = visMode === 'live';

    let scores = { trainer: 0, royale: 0, draws: 0 };
    if (compactScoreTrainer) compactScoreTrainer.innerText = '0';
    if (compactScoreRoyale) compactScoreRoyale.innerText = '0';
    if (compactScoreDraws) compactScoreDraws.innerText = '0';
    if (compactProgressFill) compactProgressFill.style.width = '0%';

    updateCompactLog(`🚀 Start: ${totalRounds} Partien (${isLive ? 'Live' : 'Max-Speed'})...`);

    for (let round = 1; round <= totalRounds; round++) {
      if (state.trainingCancelled) {
        updateCompactLog(`🛑 Training vorzeitig abgebrochen.`);
        break;
      }

      // Alternating colors
      const trainerColor = (round % 2 === 1) ? 'w' : 'b';
      const royaleColor = (trainerColor === 'w') ? 'b' : 'w';

      if (compactRoundText) {
        compactRoundText.innerText = `Partie ${round}/${totalRounds} (${trainerColor === 'w' ? 'Trainer ⚪ vs 🤖 ⚫' : '🤖 ⚪ vs Trainer ⚫'})`;
      }
      if (compactProgressFill) {
        compactProgressFill.style.width = `${Math.round(((round - 1) / totalRounds) * 100)}%`;
      }

      const trainingGame = isLive ? game : new ChessEngine.ChessGame();
      if (isLive) {
        trainingGame.reset();
        renderer.setLastMove(null, null);
        renderer.clearSelection();
        renderer.draw();
        updateUI();
      }

      let moveCount = 0;
      const MAX_MOVES = 160;

      while (!trainingGame.getGameStatus().isGameOver && moveCount < MAX_MOVES) {
        if (state.trainingCancelled) break;

        const currentTurn = trainingGame.turn;
        const isTrainerTurn = (currentTurn === trainerColor);
        let chosenMove = null;

        if (isTrainerTurn) {
          // Profi-Trainer: Strong Minimax at depth 3
          const searchRes = fallbackAI.getBestMove(trainingGame, 3);
          chosenMove = searchRes ? searchRes.bestMove : null;
        } else {
          // Royale KI Engine: Consult Firestore knowledge with aggressive attack filter & 15% exploration
          const fen = trainingGame.getFen();
          let knowledge = null;
          try {
            knowledge = await firebaseService.getPositionKnowledge(fen);
          } catch (e) {
            // ignore network jitter
          }

          chosenMove = firebaseService.selectRoyaleAIMove(trainingGame, knowledge, { explorationRate: 0.15 });
        }

        if (!chosenMove) break;

        const res = trainingGame.makeMove(chosenMove);
        if (!res) break;

        moveCount++;

        if (isLive) {
          renderer.setLastMove(res.from, res.to);
          renderer.draw();
          updateUI();
          await new Promise(resolve => setTimeout(resolve, 250));
        } else if (moveCount % 8 === 0) {
          // Yield to UI thread
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      if (state.trainingCancelled) break;

      // Match finished
      const status = trainingGame.getGameStatus();
      const isDraw = status.isGameOver ? (status.status !== 'checkmate') : true;
      const winner = (!isDraw && status.winner) ? status.winner : null;

      if (isDraw) {
        scores.draws++;
        if (compactScoreDraws) compactScoreDraws.innerText = scores.draws;
        updateCompactLog(`🤝 Partie ${round}: Remis. Speichere Firestore...`);
      } else if (winner === trainerColor) {
        scores.trainer++;
        if (compactScoreTrainer) compactScoreTrainer.innerText = scores.trainer;
        updateCompactLog(`🏆 Partie ${round}: Trainer gewinnt. Speichere Firestore...`);
      } else {
        scores.royale++;
        if (compactScoreRoyale) compactScoreRoyale.innerText = scores.royale;
        updateCompactLog(`⭐ Partie ${round}: Royale KI gewinnt! Speichere Firestore...`);
      }

      // Persist to Firebase Firestore after EVERY match!
      try {
        await firebaseService.recordGameOutcome({
          moveHistory: trainingGame.moveHistory,
          winner,
          isDraw,
          aiColor: royaleColor
        });
        updateCompactLog(`💾 Firestore synchronisiert (+1 Partie).`);
      } catch (err) {
        updateCompactLog(`⚠️ Firestore-Fehler: ${err.message}`);
      }
    }

    if (compactProgressFill) compactProgressFill.style.width = '100%';
    if (compactRoundText) compactRoundText.innerText = `Training abgeschlossen!`;
    updateCompactLog(`🏁 Ergebnis: Trainer ${scores.trainer} | KI ${scores.royale} | Remis ${scores.draws}`);
    state.isTrainingActive = false;
    btnStartBot.disabled = false;
    btnStartBot.innerText = '▶️ Training Starten';
    if (btnCompactCancel) btnCompactCancel.disabled = true;
  });

  // 13. Schlanker Spielstart: Farbwahl-Dialog (Weiß spielen, Schwarz spielen, Zufall)
  const gameStartModal = document.getElementById('gameStartModal');

  function openGameStartModal() {
    if (!gameStartModal) return;
    renderer.isLocked = true;
    stopClocks();
    gameStartModal.classList.add('active');
  }

  function closeGameStartModal() {
    if (gameStartModal) gameStartModal.classList.remove('active');
  }

  function launchGameWithColor(chosenColor) {
    let finalColor = chosenColor;
    if (finalColor === 'random') {
      finalColor = Math.random() < 0.5 ? 'w' : 'b';
    }

    state.playerColor = finalColor;
    renderer.options.flipped = (finalColor === 'b');

    // Fester Standard-Spieler: Jeremy (Admin, 1500 ELO)
    state.currentUser.name = 'Jeremy';
    state.currentUser.role = 'admin';
    state.currentUser.rating = 1500;
    saveUserProfile();
    checkAdminStatus();
    updateProfileDisplay();

    // Dialog sofort schließen, Brett freigeben und Spiel ohne Vorbedingungen starten
    closeGameStartModal();
    game.reset();
    renderer.setLastMove(null, null);
    renderer.clearSelection();
    renderer.draw();
    state.whiteTime = 600;
    state.blackTime = 600;
    state.isThinking = false;
    renderer.isLocked = false;
    startClocks();
    updateUI();

    // Falls Schwarz gewählt: Royale KI Engine führt ersten Zug als Weiß aus
    if (state.playerColor === 'b' && state.gameMode === 'ai') {
      triggerAIMove();
    }
  }

  // Jeder Klick auf "Weiß spielen", "Zufall" oder "Schwarz spielen" startet das Spiel sofort!
  document.querySelectorAll('.start-color-card').forEach(card => {
    card.onclick = () => {
      const color = card.dataset.color || 'w';
      launchGameWithColor(color);
    };
  });

  // Initial setup
  checkAdminStatus();
  updateProfileDisplay();
  startClocks();
  updateUI();
  loadLeaderboard();
  openGameStartModal(); // Clean dialog on startup!
});
