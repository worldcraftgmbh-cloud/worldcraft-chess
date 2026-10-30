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

  // App State & Spieler-Profil (Start-ELO 1500)
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
      id: savedUser.id || ('user_' + Math.random().toString(36).substring(2, 9)),
      name: savedUser.name || 'Jeremy',
      rating: savedUser.rating || 1500,
      rankedMatches: savedUser.rankedMatches || { played: 0, wins: 0, losses: 0, draws: 0 },
      aiMatches: savedUser.aiMatches || { played: 0, wins: 0, losses: 0, draws: 0 }
    }
  };

  saveUserProfile();

  function saveUserProfile() {
    localStorage.setItem('worldcraft_player_profile', JSON.stringify(state.currentUser));
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
    const bottomClock = document.getElementById('whiteClock');
    const topClock = document.getElementById('blackClock');

    const isFlipped = renderer.options.flipped;
    const bottomTime = isFlipped ? state.blackTime : state.whiteTime;
    const topTime = isFlipped ? state.whiteTime : state.blackTime;
    const bottomTurn = isFlipped ? (game.turn === 'b') : (game.turn === 'w');
    const topTurn = isFlipped ? (game.turn === 'w') : (game.turn === 'b');

    bottomClock.innerText = formatTime(bottomTime);
    topClock.innerText = formatTime(topTime);

    bottomClock.classList.toggle('active-turn', bottomTurn);
    topClock.classList.toggle('active-turn', topTurn);

    bottomClock.classList.toggle('low-time', bottomTime < 30);
    topClock.classList.toggle('low-time', topTime < 30);
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

  // 7. Multiplayer Handlers & Invite Link Sharing
  let serverLanHost = window.location.host;
  fetch('/api/network-info').then(r => r.json()).then(data => {
    if (data.localIp && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      serverLanHost = `${data.localIp}:${data.port || window.location.port || 3000}`;
    }
  }).catch(() => {});

  function generateInviteUrl(code) {
    const cleanCode = (code || '').trim().toUpperCase();
    const protocol = window.location.protocol;
    const path = window.location.pathname;
    return `${protocol}//${serverLanHost}${path}?room=${cleanCode}`;
  }

  function copyInviteLink(code, btnEl, textEl) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return;
    const fullUrl = generateInviteUrl(cleanCode);
    navigator.clipboard.writeText(fullUrl).then(() => {
      if (btnEl) btnEl.classList.add('copied');
      if (textEl) textEl.innerText = '✓ Link kopiert!';
      setTimeout(() => {
        if (btnEl) btnEl.classList.remove('copied');
        if (textEl) textEl.innerText = 'Einladungs-Link kopieren';
      }, 3500);
    }).catch(() => {
      prompt('Kopiere diesen Einladungs-Link für deinen Freund:', fullUrl);
    });
  }

  // Warteraum / Room Lobby Modal für den Host
  const roomLobbyModal = document.getElementById('roomLobbyModal');
  const lobbyRoomCodeEl = document.getElementById('lobbyRoomCode');
  const lobbyInviteUrlInput = document.getElementById('lobbyInviteUrlInput');
  const btnLobbyCopyLink = document.getElementById('btnLobbyCopyLink');
  const btnLobbyCancel = document.getElementById('btnLobbyCancel');

  function openRoomLobbyModal(roomId) {
    if (!roomLobbyModal) return;
    const cleanCode = (roomId || '').trim().toUpperCase();
    if (lobbyRoomCodeEl) lobbyRoomCodeEl.innerText = cleanCode;
    const inviteUrl = generateInviteUrl(cleanCode);
    if (lobbyInviteUrlInput) lobbyInviteUrlInput.value = inviteUrl;

    // Auto copy invite link for maximum comfort!
    navigator.clipboard.writeText(inviteUrl).then(() => {
      if (btnLobbyCopyLink) {
        btnLobbyCopyLink.classList.add('copied');
        btnLobbyCopyLink.innerText = '✓ Kopiert!';
        setTimeout(() => {
          btnLobbyCopyLink.classList.remove('copied');
          btnLobbyCopyLink.innerText = '📋 Kopieren';
        }, 3500);
      }
    }).catch(() => {});

    renderer.isLocked = true;
    stopClocks();
    closeGameStartModal();
    roomLobbyModal.classList.add('active');
  }

  function closeRoomLobbyModal() {
    if (roomLobbyModal) roomLobbyModal.classList.remove('active');
  }

  btnLobbyCopyLink?.addEventListener('click', () => {
    const url = lobbyInviteUrlInput?.value || generateInviteUrl(lobbyRoomCodeEl?.innerText);
    navigator.clipboard.writeText(url).then(() => {
      btnLobbyCopyLink.classList.add('copied');
      btnLobbyCopyLink.innerText = '✓ Kopiert!';
      setTimeout(() => {
        btnLobbyCopyLink.classList.remove('copied');
        btnLobbyCopyLink.innerText = '📋 Kopieren';
      }, 3500);
    }).catch(() => {
      prompt('Kopiere diesen Link für deinen Kumpel:', url);
    });
  });

  btnLobbyCancel?.addEventListener('click', () => {
    closeRoomLobbyModal();
    renderer.isLocked = false;
    openGameStartModal('friend');
  });

  // Einladungs-Modal für den Kumpel (wenn er den Link öffnet)
  const friendJoinModal = document.getElementById('friendJoinModal');
  const friendJoinSubtitle = document.getElementById('friendJoinSubtitle');
  const friendJoinRoomCodeDisplay = document.getElementById('friendJoinRoomCodeDisplay');
  const friendJoinHostNameDisplay = document.getElementById('friendJoinHostNameDisplay');
  const friendChosenNameInput = document.getElementById('friendChosenNameInput');
  const btnConfirmJoinGame = document.getElementById('btnConfirmJoinGame');
  let pendingFriendRoomCode = null;

  async function openFriendJoinModal(roomCode) {
    if (!friendJoinModal) return;
    pendingFriendRoomCode = roomCode.trim().toUpperCase();
    if (friendJoinRoomCodeDisplay) friendJoinRoomCodeDisplay.innerText = pendingFriendRoomCode;

    // Prefill name with existing non-admin name, or blank for new player
    if (friendChosenNameInput) {
      friendChosenNameInput.value = state.currentUser.name !== 'Jeremy' ? state.currentUser.name : '';
    }

    renderer.isLocked = true;
    stopClocks();
    closeGameStartModal();
    closeRoomLobbyModal();
    friendJoinModal.classList.add('active');

    // Fetch room host name from server
    try {
      const res = await fetch(`/api/room/${pendingFriendRoomCode}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists && data.hostName) {
          if (friendJoinSubtitle) {
            friendJoinSubtitle.innerHTML = `<strong>${data.hostName}</strong> hat dich zu einer Schach-Partie herausgefordert!`;
          }
          if (friendJoinHostNameDisplay) {
            friendJoinHostNameDisplay.innerText = `${data.hostName} (⚪ Weiß)`;
          }
        }
      }
    } catch (e) {
      // offline / local fallback
    }

    setTimeout(() => friendChosenNameInput?.focus(), 150);
  }

  function closeFriendJoinModal() {
    if (friendJoinModal) friendJoinModal.classList.remove('active');
  }

  btnConfirmJoinGame?.addEventListener('click', () => {
    const chosenName = (friendChosenNameInput?.value || '').trim() || 'Kumpel_Schwarz';
    updateUserName(chosenName);
    btnConfirmJoinGame.disabled = true;
    btnConfirmJoinGame.innerText = 'Verbinde mit Partie...';

    state.gameMode = 'multiplayer';
    const modeSelect = document.getElementById('gameModeSelect');
    if (modeSelect) modeSelect.value = 'multiplayer';
    document.getElementById('aiSettingsBox').style.display = 'none';
    document.getElementById('multiSettingsBox').style.display = 'block';

    const joinCode = pendingFriendRoomCode || (document.getElementById('joinRoomInput')?.value || '').trim().toUpperCase();
    socket.joinRoom(joinCode, null, chosenName);
  });

  friendChosenNameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnConfirmJoinGame?.click();
    }
  });

  function handleRoomCreated(data) {
    const codeEl = document.getElementById('displayRoomCode');
    const boxEl = document.getElementById('activeRoomBox');
    const inputEl = document.getElementById('joinRoomInput');
    const statusEl = document.getElementById('multiStatus');

    if (codeEl) codeEl.innerText = data.roomId;
    if (boxEl) boxEl.style.display = 'block';
    if (inputEl) inputEl.value = data.roomId;

    state.playerColor = data.color || 'w';
    state.gameMode = 'multiplayer';
    renderer.options.flipped = (state.playerColor === 'b');

    // Switch gameMode select to multiplayer & show box
    const modeSelect = document.getElementById('gameModeSelect');
    if (modeSelect) modeSelect.value = 'multiplayer';
    document.getElementById('aiSettingsBox').style.display = 'none';
    document.getElementById('multiSettingsBox').style.display = 'block';

    // Open dedicated Room Lobby Modal for the host!
    openRoomLobbyModal(data.roomId);

    if (statusEl) {
      statusEl.innerHTML = `🟢 <strong>Raum ${data.roomId} eröffnet!</strong> Warte auf Mitspieler...`;
    }
  }

  function handleMatchStart(data) {
    if (data.yourColor && data.yourColor !== 'spectator') {
      state.playerColor = data.yourColor;
    } else if (socket.playerColor) {
      state.playerColor = socket.playerColor;
    }

    state.gameMode = 'multiplayer';
    renderer.options.flipped = (state.playerColor === 'b');
    renderer.isLocked = false;

    // Close all waiting modals!
    closeGameStartModal();
    closeRoomLobbyModal();
    closeFriendJoinModal();

    if (btnConfirmJoinGame) {
      btnConfirmJoinGame.disabled = false;
      btnConfirmJoinGame.innerText = '⚔️ Partie jetzt beitreten';
    }

    // Determine my data vs opponent data
    const isMeWhite = state.playerColor === 'w';
    const myData = isMeWhite ? data.white : data.black;
    const oppData = isMeWhite ? data.black : data.white;

    // Bottom bar: YOU
    const whitePlayerNameEl = document.getElementById('whitePlayerName');
    const whitePlayerRatingEl = document.getElementById('whitePlayerRating');
    const whiteAvatarEl = document.getElementById('whiteAvatar');
    if (whitePlayerNameEl) whitePlayerNameEl.innerText = myData.name || state.currentUser.name;
    if (whitePlayerRatingEl) whitePlayerRatingEl.innerText = `${myData.rating || 1500} ELO`;
    if (whiteAvatarEl) whiteAvatarEl.innerText = (myData.name || 'J').charAt(0).toUpperCase();

    // Top bar: OPPONENT
    const oppNameEl = document.getElementById('opponentName');
    const oppTitleEl = document.getElementById('opponentTitle');
    const blackPlayerRatingEl = document.getElementById('blackPlayerRating');
    const blackAvatarEl = document.getElementById('blackAvatar');
    if (oppNameEl) oppNameEl.innerText = oppData.name || 'Online-Freund';
    if (oppTitleEl) oppTitleEl.innerText = 'FREUND';
    if (blackPlayerRatingEl) blackPlayerRatingEl.innerText = `${oppData.rating || 1500} ELO`;
    if (blackAvatarEl) blackAvatarEl.innerText = (oppData.name || 'F').charAt(0).toUpperCase();

    // Hide waiting pulse
    const pulseEl = document.getElementById('multiWaitingPulse');
    if (pulseEl) pulseEl.style.display = 'none';

    // Update status banner
    const statusEl = document.getElementById('multiStatus');
    if (statusEl) {
      statusEl.innerHTML = `⚔️ <strong>Match gestartet!</strong> Du spielst ${state.playerColor === 'w' ? '⚪ Weiß' : '⚫ Schwarz'} gegen <strong>${oppData.name}</strong>.`;
    }

    // Load initial position and clear selection
    game.loadFen(data.fen);
    renderer.clearSelection();
    renderer.setLastMove(null, null);
    renderer.draw();

    // Clocks
    state.whiteTime = data.timeControl.base;
    state.blackTime = data.timeControl.base;
    startClocks();
    updateUI();
    updateProfileDisplay();
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

  // Multiplayer Buttons & Invite Sharing
  document.getElementById('btnCreateRoom')?.addEventListener('click', () => {
    const name = document.getElementById('multiPlayerName')?.value || state.currentUser.name || 'Jeremy';
    state.currentUser.name = name;
    saveUserProfile();
    socket.createRoom(null, name, 'w', { base: 600, inc: 0 });
  });

  document.getElementById('btnCopyInviteLink')?.addEventListener('click', () => {
    const code = document.getElementById('displayRoomCode')?.innerText || socket.currentRoom || '';
    copyInviteLink(code, document.getElementById('btnCopyInviteLink'), document.getElementById('copyInviteText'));
  });

  document.getElementById('btnJoinRoom')?.addEventListener('click', () => {
    const code = (document.getElementById('joinRoomInput')?.value || '').trim().toUpperCase();
    const name = document.getElementById('multiPlayerName')?.value || state.currentUser.name || 'Gastspieler';
    if (!code) {
      alert('Bitte gib einen 6-stelligen Raum-Code ein!');
      return;
    }
    state.currentUser.name = name;
    saveUserProfile();
    socket.joinRoom(code, null, name);
  });

  document.getElementById('btnQuickMatch')?.addEventListener('click', () => {
    const name = document.getElementById('multiPlayerName')?.value || state.currentUser.name || 'Jeremy';
    const statusEl = document.getElementById('multiStatus');
    if (statusEl) statusEl.innerText = 'Suche nach passendem Gegner im ELO-Bereich...';
    socket.quickMatch(null, name, state.currentUser.rating || 1500, { base: 600, inc: 0 });
  });

  document.getElementById('btnModalNewGame')?.addEventListener('click', () => {
    document.getElementById('gameOverModal')?.classList.remove('active');
    openGameStartModal('ai');
  });

  // Sync Player Names across inputs
  const multiPlayerNameInput = document.getElementById('multiPlayerName');
  const startModalNameInput = document.getElementById('startModalPlayerName');

  function updateUserName(newName) {
    const trimmed = (newName || '').trim();
    if (trimmed) {
      state.currentUser.name = trimmed;
      saveUserProfile();
      if (multiPlayerNameInput && multiPlayerNameInput.value !== trimmed) multiPlayerNameInput.value = trimmed;
      if (startModalNameInput && startModalNameInput.value !== trimmed) startModalNameInput.value = trimmed;
      updateProfileDisplay();
    }
  }

  multiPlayerNameInput?.addEventListener('input', (e) => updateUserName(e.target.value));
  startModalNameInput?.addEventListener('input', (e) => updateUserName(e.target.value));

  // 11. Interaktives Regel-Kompendium ("Regelbuch")
  const rulebookModal = document.getElementById('rulebookModal');
  const openRulebook = () => {
    if (rulebookModal) {
      rulebookModal.classList.add('active');
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
    if (e.target === rulebookModal) closeRulebook();
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

  // 12. Spielstart-Dialog & Online Matchmaking mit Freunden
  const gameStartModal = document.getElementById('gameStartModal');

  function openGameStartModal(tab = 'ai') {
    if (!gameStartModal) return;
    renderer.isLocked = true;
    stopClocks();

    // Switch to desired pane
    switchStartModalTab(tab);
    gameStartModal.classList.add('active');
  }

  function closeGameStartModal() {
    if (gameStartModal) gameStartModal.classList.remove('active');
    renderer.isLocked = false;
  }

  function switchStartModalTab(tab) {
    const pills = {
      ai: document.getElementById('pillModeAi'),
      friend: document.getElementById('pillModeFriend'),
      passplay: document.getElementById('pillModePassPlay')
    };
    const panes = {
      ai: document.getElementById('paneModeAi'),
      friend: document.getElementById('paneModeFriend'),
      passplay: document.getElementById('paneModePassPlay')
    };

    Object.values(pills).forEach(p => p?.classList.remove('active'));
    Object.values(panes).forEach(p => {
      if (p) p.style.display = 'none';
    });

    if (pills[tab]) pills[tab].classList.add('active');
    if (panes[tab]) {
      panes[tab].style.display = (tab === 'ai' ? 'block' : 'flex');
    }
  }

  // Header "Mit Freund spielen" Button
  document.getElementById('btnHeaderPlayFriend')?.addEventListener('click', () => {
    openGameStartModal('friend');
  });

  // Modal Mode Switcher Tabs
  document.getElementById('pillModeAi')?.addEventListener('click', () => switchStartModalTab('ai'));
  document.getElementById('pillModeFriend')?.addEventListener('click', () => switchStartModalTab('friend'));
  document.getElementById('pillModePassPlay')?.addEventListener('click', () => switchStartModalTab('passplay'));
  document.getElementById('btnCloseStartModal')?.addEventListener('click', closeGameStartModal);

  gameStartModal?.addEventListener('click', (e) => {
    if (e.target === gameStartModal) closeGameStartModal();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeRulebook();
      closeGameStartModal();
      closeRoomLobbyModal();
      closeFriendJoinModal();
      document.getElementById('promotionModal')?.classList.remove('active');
      document.getElementById('gameOverModal')?.classList.remove('active');
    }
  });

  // Modal Option A: Create Room for Friend
  document.getElementById('btnModalCreateFriendRoom')?.addEventListener('click', () => {
    const pName = document.getElementById('startModalPlayerName')?.value || state.currentUser.name || 'Jeremy';
    updateUserName(pName);

    // Switch mode
    state.gameMode = 'multiplayer';
    const modeSelect = document.getElementById('gameModeSelect');
    if (modeSelect) modeSelect.value = 'multiplayer';
    document.getElementById('aiSettingsBox').style.display = 'none';
    document.getElementById('multiSettingsBox').style.display = 'block';

    closeGameStartModal();
    socket.createRoom(null, pName, 'w', { base: 600, inc: 0 });
  });

  // Modal Option B: Join Room via Code
  document.getElementById('btnModalJoinRoom')?.addEventListener('click', () => {
    const code = (document.getElementById('modalJoinRoomInput')?.value || '').trim().toUpperCase();
    const pName = document.getElementById('startModalPlayerName')?.value || state.currentUser.name || 'Gastspieler';
    if (!code) {
      alert('Bitte gib den 6-stelligen Raum-Code deines Freundes ein!');
      return;
    }
    updateUserName(pName);

    state.gameMode = 'multiplayer';
    const modeSelect = document.getElementById('gameModeSelect');
    if (modeSelect) modeSelect.value = 'multiplayer';
    document.getElementById('aiSettingsBox').style.display = 'none';
    document.getElementById('multiSettingsBox').style.display = 'block';

    closeGameStartModal();
    socket.joinRoom(code, null, pName);
  });

  // Modal Option C: Pass & Play
  document.getElementById('btnStartPassPlay')?.addEventListener('click', () => {
    state.gameMode = 'pass_and_play';
    const modeSelect = document.getElementById('gameModeSelect');
    if (modeSelect) modeSelect.value = 'pass_and_play';
    document.getElementById('aiSettingsBox').style.display = 'none';
    document.getElementById('multiSettingsBox').style.display = 'none';

    launchGameWithColor('w');
  });

  // Start game with chosen color (AI / Pass & Play)
  function launchGameWithColor(chosenColor) {
    let finalColor = chosenColor;
    if (finalColor === 'random') {
      finalColor = Math.random() < 0.5 ? 'w' : 'b';
    }

    state.playerColor = finalColor;
    renderer.options.flipped = (finalColor === 'b');

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
    updateProfileDisplay();

    // Falls Schwarz gegen KI gewählt: Royale KI Engine zieht als Weiß
    if (state.playerColor === 'b' && state.gameMode === 'ai') {
      triggerAIMove();
    }
  }

  // Clicks on AI Color Cards
  document.querySelectorAll('.start-color-card').forEach(card => {
    card.onclick = () => {
      state.gameMode = 'ai';
      const modeSelect = document.getElementById('gameModeSelect');
      if (modeSelect) modeSelect.value = 'ai';
      document.getElementById('aiSettingsBox').style.display = 'block';
      document.getElementById('multiSettingsBox').style.display = 'none';
      const color = card.dataset.color || 'w';
      launchGameWithColor(color);
    };
  });

  // Initial Setup & Automatic URL Parameter Room Join
  if (multiPlayerNameInput) multiPlayerNameInput.value = state.currentUser.name;
  if (startModalNameInput) startModalNameInput.value = state.currentUser.name;

  updateProfileDisplay();
  startClocks();
  updateUI();
  loadLeaderboard();

  // Check if player opened an invite link (?room=XYZ)
  const urlParams = new URLSearchParams(window.location.search);
  const friendRoomCode = urlParams.get('room');

  if (friendRoomCode) {
    const cleanCode = friendRoomCode.trim().toUpperCase();
    const joinRoomInput = document.getElementById('joinRoomInput');
    if (joinRoomInput) joinRoomInput.value = cleanCode;

    // Open dedicated Friend Join Modal so the friend can choose their own player name!
    openFriendJoinModal(cleanCode);
  } else {
    // Normal launch: open clean start modal
    openGameStartModal('ai');
  }
});
