/**
 * Client-Side WebSocket & Firebase Firestore Hybrid Controller for Multiplayer Chess
 * Provides seamless fallback to Google Firebase Cloud on Vercel and serverless platforms.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClientSocket = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  class ClientSocket {
    constructor(callbacks = {}) {
      this.ws = null;
      this.callbacks = callbacks;
      this.isConnected = false;
      this.isFirestoreMode = false;
      this.currentRoom = null;
      this.playerColor = 'w';
      this.pingMs = 0;
      this.firestoreUnsubscribe = null;
      this.lastProcessedMoveSeq = 0;
      this.myPlayerId = 'user_' + Math.random().toString(36).substring(2, 9);
      this.isMatchStarted = false;
    }

    connect(url) {
      const isLocal = typeof window !== 'undefined' && (
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168.') ||
        window.location.hostname.startsWith('10.')
      );

      // On Vercel, cloud, or serverless deployments: switch directly to Firebase Firestore Cloud multiplayer!
      if (!isLocal) {
        console.log('[Multiplayer] Running on Cloud / Vercel: Activating Firebase Firestore Cloud Multiplayer.');
        this.enableFirestoreMode();
        return;
      }

      if (!url && typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${protocol}//${window.location.host}`;
      }

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        console.warn('Could not connect to WebSocket directly, falling back to Firebase Firestore:', e);
        this.enableFirestoreMode();
        return;
      }

      this.ws.onopen = () => {
        this.isConnected = true;
        this.isFirestoreMode = false;
        this.startPing();
        if (this.callbacks.onConnect) this.callbacks.onConnect('WebSocket Local/Server');
      };

      this.ws.onclose = (event) => {
        // If connection closed or handshake failed with 200, fallback to Firestore
        if (!this.isConnected || event.code !== 1000) {
          console.warn('[Multiplayer] WebSocket closed/failed, activating Firebase Firestore Cloud Multiplayer.');
          this.enableFirestoreMode();
        } else {
          this.isConnected = false;
          if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[Multiplayer] WebSocket error, falling back to Firebase Firestore.');
        this.enableFirestoreMode();
      };

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };
    }

    enableFirestoreMode() {
      if (this.isFirestoreMode) return;
      this.isFirestoreMode = true;
      this.isConnected = true;
      if (this.callbacks.onConnect) this.callbacks.onConnect('Firebase Cloud (Global)');
      if (this.callbacks.onPing) this.callbacks.onPing(32);
    }

    startPing() {
      setInterval(() => {
        if (!this.isFirestoreMode && this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
        }
      }, 5000);
    }

    handleMessage(msg) {
      switch (msg.type) {
        case 'pong': {
          this.pingMs = Date.now() - msg.clientTime;
          if (this.callbacks.onPing) this.callbacks.onPing(this.pingMs);
          break;
        }

        case 'room_created': {
          this.currentRoom = msg.roomId;
          this.playerColor = msg.color || 'w';
          if (this.callbacks.onRoomCreated) this.callbacks.onRoomCreated(msg);
          break;
        }

        case 'room_joined': {
          this.currentRoom = msg.roomId;
          this.playerColor = msg.color || 'b';
          if (this.callbacks.onRoomJoined) this.callbacks.onRoomJoined(msg);
          break;
        }

        case 'match_start': {
          this.currentRoom = msg.roomId;
          if (msg.yourColor && msg.yourColor !== 'spectator') {
            this.playerColor = msg.yourColor;
          }
          if (this.callbacks.onMatchStart) this.callbacks.onMatchStart(msg);
          break;
        }

        case 'move_made': {
          if (this.callbacks.onMove) this.callbacks.onMove(msg);
          break;
        }

        case 'game_over': {
          if (this.callbacks.onGameOver) this.callbacks.onGameOver(msg);
          break;
        }

        case 'matchmaking_waiting': {
          if (this.callbacks.onWaiting) this.callbacks.onWaiting(msg);
          break;
        }

        case 'error': {
          if (this.callbacks.onError) this.callbacks.onError(msg.message);
          break;
        }

        default:
          if (this.callbacks.onCustom) this.callbacks.onCustom(msg);
      }
    }

    send(data) {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(data));
      }
    }

    // --- High-Level Multiplayer Actions (Hybrid: WebSocket or Firestore) ---

    createRoom(playerId, playerName, preferredColor = 'w', timeControl = { base: 600, inc: 0 }) {
      if (this.isFirestoreMode || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.createRoomFirestore(playerId, playerName, preferredColor, timeControl);
        return;
      }

      this.send({
        type: 'create_room',
        playerId,
        playerName,
        preferredColor,
        timeControl
      });
    }

    joinRoom(roomId, playerId, playerName) {
      if (this.isFirestoreMode || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.joinRoomFirestore(roomId, playerId, playerName);
        return;
      }

      this.send({
        type: 'join_room',
        roomId,
        playerId,
        playerName
      });
    }

    sendMove(move, fen, whiteTime, blackTime, turn, gameStatus = null) {
      if (this.isFirestoreMode || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.sendMoveFirestore(move, fen, whiteTime, blackTime, turn, gameStatus);
        return;
      }

      this.send({
        type: 'make_move',
        move
      });
    }

    resign() {
      if (this.isFirestoreMode || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.resignFirestore();
        return;
      }

      this.send({ type: 'resign' });
    }

    quickMatch(playerId, playerName, rating = 1200, timeControl = { base: 600, inc: 0 }) {
      if (this.isFirestoreMode || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // In Firestore mode: generate a room and invite link
        this.createRoomFirestore(playerId, playerName, 'w', timeControl);
        return;
      }

      this.send({
        type: 'quick_match',
        playerId,
        playerName,
        rating,
        timeControl
      });
    }

    // --- Firebase Firestore Realtime Engine ---

    getFirestoreDb() {
      if (typeof firebase !== 'undefined' && firebase.apps.length) {
        return firebase.firestore();
      }
      return null;
    }

    createRoomFirestore(playerId, playerName, preferredColor = 'w', timeControl = { base: 600, inc: 0 }) {
      const db = this.getFirestoreDb();
      if (!db) {
        if (this.callbacks.onError) this.callbacks.onError('Firebase Firestore nicht geladen.');
        return;
      }

      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.currentRoom = roomId;
      this.playerColor = preferredColor || 'w';
      this.myPlayerId = playerId || ('user_' + Date.now());
      this.isMatchStarted = false;
      this.lastProcessedMoveSeq = 0;

      const roomData = {
        roomId,
        status: 'waiting',
        createdAt: Date.now(),
        white: { id: this.myPlayerId, name: playerName || 'Jeremy', rating: 1500, timeLeft: timeControl.base },
        black: null,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        lastMove: null,
        moveSeq: 0,
        timeControl
      };

      db.collection('rooms').doc(roomId).set(roomData).then(() => {
        if (this.callbacks.onRoomCreated) {
          this.callbacks.onRoomCreated({ roomId, color: this.playerColor, timeControl });
        }
        this.listenFirestoreRoom(roomId);
      }).catch(err => {
        if (this.callbacks.onError) this.callbacks.onError('Fehler beim Erstellen des Raums: ' + err.message);
      });
    }

    joinRoomFirestore(roomId, playerId, playerName) {
      const db = this.getFirestoreDb();
      if (!db) {
        if (this.callbacks.onError) this.callbacks.onError('Firebase Firestore nicht geladen.');
        return;
      }

      const cleanRoomId = (roomId || '').trim().toUpperCase();
      this.currentRoom = cleanRoomId;
      this.playerColor = 'b';
      this.myPlayerId = playerId || ('user_' + Date.now());
      this.isMatchStarted = false;
      this.lastProcessedMoveSeq = 0;

      db.collection('rooms').doc(cleanRoomId).get().then(doc => {
        if (!doc.exists) {
          if (this.callbacks.onError) this.callbacks.onError('Raum existiert nicht oder ist ungültig!');
          return;
        }

        const rData = doc.data();
        if (rData.black && rData.black.id !== this.myPlayerId && rData.status === 'playing') {
          if (this.callbacks.onError) this.callbacks.onError('Dieser Raum ist bereits voll besetzt!');
          return;
        }

        return db.collection('rooms').doc(cleanRoomId).update({
          black: { id: this.myPlayerId, name: playerName || 'Kumpel', rating: 1500, timeLeft: rData.timeControl?.base || 600 },
          status: 'playing',
          startedAt: Date.now()
        }).then(() => {
          if (this.callbacks.onRoomJoined) {
            this.callbacks.onRoomJoined({ roomId: cleanRoomId, color: 'b' });
          }
          this.listenFirestoreRoom(cleanRoomId);
        });
      }).catch(err => {
        if (this.callbacks.onError) this.callbacks.onError('Fehler beim Beitreten: ' + err.message);
      });
    }

    listenFirestoreRoom(roomId) {
      if (this.firestoreUnsubscribe) {
        this.firestoreUnsubscribe();
      }

      const db = this.getFirestoreDb();
      if (!db) return;

      this.firestoreUnsubscribe = db.collection('rooms').doc(roomId).onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        this.handleFirestoreRoomUpdate(data);
      }, err => {
        console.warn('Firestore snapshot error:', err);
      });
    }

    handleFirestoreRoomUpdate(data) {
      // 1. Check if match has started
      if (data.status === 'playing' && data.white && data.black && !this.isMatchStarted) {
        this.isMatchStarted = true;
        if (this.callbacks.onMatchStart) {
          this.callbacks.onMatchStart({
            roomId: data.roomId,
            yourColor: this.playerColor,
            white: data.white,
            black: data.black,
            fen: data.fen,
            timeControl: data.timeControl
          });
        }
      }

      // 2. Check if a move was made by the opponent
      if (data.lastMove && data.moveSeq > this.lastProcessedMoveSeq) {
        this.lastProcessedMoveSeq = data.moveSeq;
        if (data.lastMove.sender !== this.playerColor) {
          if (this.callbacks.onMove) {
            this.callbacks.onMove({
              move: data.lastMove,
              fen: data.fen,
              whiteTime: data.whiteTime,
              blackTime: data.blackTime,
              turn: data.turn
            });
          }
        }
      }

      // 3. Check for game over
      if (data.status === 'game_over') {
        if (this.callbacks.onGameOver) {
          this.callbacks.onGameOver({
            winner: data.winner,
            message: data.message
          });
        }
      }
    }

    sendMoveFirestore(move, fen, whiteTime, blackTime, turn, gameStatus = null) {
      const db = this.getFirestoreDb();
      if (!db || !this.currentRoom) return;

      const moveSeq = (this.lastProcessedMoveSeq || 0) + 1;
      this.lastProcessedMoveSeq = moveSeq;

      const updateData = {
        lastMove: {
          from: move.from,
          to: move.to,
          san: move.san || '',
          captured: !!(move.captured || move.isEnPassant),
          isCastling: !!move.isCastling,
          promotion: move.promotion || null,
          sender: this.playerColor
        },
        moveSeq: moveSeq,
        fen: fen,
        turn: turn,
        whiteTime: whiteTime,
        blackTime: blackTime,
        updatedAt: Date.now()
      };

      if (gameStatus && gameStatus.isGameOver) {
        updateData.status = 'game_over';
        updateData.winner = gameStatus.winner || null;
        updateData.message = gameStatus.reason || 'Partie beendet';
      }

      db.collection('rooms').doc(this.currentRoom).update(updateData).catch(err => {
        console.warn('Error updating move to Firestore:', err);
      });
    }

    resignFirestore() {
      const db = this.getFirestoreDb();
      if (!db || !this.currentRoom) return;

      const winner = this.playerColor === 'w' ? 'b' : 'w';
      db.collection('rooms').doc(this.currentRoom).update({
        status: 'game_over',
        winner,
        message: `${this.playerColor === 'w' ? 'Weiß' : 'Schwarz'} hat aufgegeben.`
      }).catch(err => {
        console.warn('Error recording resignation to Firestore:', err);
      });
    }
  }

  return ClientSocket;
});
