/**
 * Real-Time Multiplayer Chess & ELO Server
 * HTTP Server + WebSocket Protocol
 * Features:
 * - Authoritative server-side FIDE move validation
 * - Matchmaking queue & private custom rooms
 * - Chess clocks (Blitz, Rapid, Classical)
 * - Real-time FIDE ELO calculation and regional leaderboards
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const ChessEngine = require('../public/engine/chess.js');
const EloSystem = require('./elo.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '../public');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const eloSystem = new EloSystem();

// HTTP Server for static assets and REST API
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname === '/api/leaderboard') {
    const region = parsedUrl.searchParams.get('region') || 'Alle';
    const country = parsedUrl.searchParams.get('country') || 'Alle';
    const list = eloSystem.getLeaderboard({ region, country });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
    return;
  }

  if (pathname.startsWith('/api/player/')) {
    const id = pathname.substring('/api/player/'.length);
    const p = eloSystem.getPlayer(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(p));
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Nicht gefunden');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

// Active game rooms: roomId -> RoomState
const rooms = new Map();
// Matchmaking queue: array of { ws, playerId, playerName, rating, timeControl }
let quickQueue = [];

class GameRoom {
  constructor(id, timeControl = { base: 600, inc: 0 }) {
    this.id = id;
    this.timeControl = timeControl; // seconds
    this.game = new ChessEngine.ChessGame();

    this.white = null; // { ws, playerId, name, rating, timeLeft, timer }
    this.black = null;

    this.spectators = [];
    this.activeTurn = 'w';
    this.lastMoveTime = null;
    this.clockInterval = null;
    this.isOver = false;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    if (this.white && this.white.ws.readyState === WebSocket.OPEN) this.white.ws.send(data);
    if (this.black && this.black.ws.readyState === WebSocket.OPEN) this.black.ws.send(data);
    this.spectators.forEach(s => {
      if (s.readyState === WebSocket.OPEN) s.send(data);
    });
  }

  startClocks() {
    this.stopClocks();
    this.lastMoveTime = Date.now();

    this.clockInterval = setInterval(() => {
      if (this.isOver) {
        this.stopClocks();
        return;
      }

      const activePlayer = this.activeTurn === 'w' ? this.white : this.black;
      if (!activePlayer) return;

      activePlayer.timeLeft--;

      if (activePlayer.timeLeft <= 0) {
        this.stopClocks();
        this.isOver = true;
        const winner = this.activeTurn === 'w' ? 'b' : 'w';
        this.handleTimeout(winner);
      }
    }, 1000);
  }

  stopClocks() {
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
  }

  handleTimeout(winnerColor) {
    const winnerPlayer = winnerColor === 'w' ? this.white : this.black;
    const loserPlayer = winnerColor === 'w' ? this.black : this.white;

    const eloUpdate = eloSystem.recordMatch(
      this.white.playerId,
      this.black.playerId,
      winnerColor === 'w' ? 1.0 : 0.0,
      this.game.exportPgn()
    );

    this.broadcast({
      type: 'game_over',
      reason: 'timeout',
      winner: winnerColor,
      message: `Zeit abgelaufen! ${winnerPlayer.name} (${winnerColor === 'w' ? 'Weiß' : 'Schwarz'}) gewinnt.`,
      eloUpdate
    });
  }
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let playerInfo = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleClientMessage(ws, msg);
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  });

  ws.on('close', () => {
    // Remove from matchmaking queue
    quickQueue = quickQueue.filter(q => q.ws !== ws);

    // Handle room disconnect
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      if (room.white && room.white.ws === ws) {
        room.broadcast({ type: 'player_disconnected', color: 'w', name: room.white.name });
      } else if (room.black && room.black.ws === ws) {
        room.broadcast({ type: 'player_disconnected', color: 'b', name: room.black.name });
      }
    }
  });

  function handleClientMessage(socket, data) {
    switch (data.type) {
      case 'register_player': {
        playerInfo = eloSystem.getPlayer(data.playerId || `u_${Date.now()}`);
        if (data.name) playerInfo.name = data.name;
        if (data.region) playerInfo.region = data.region;
        socket.send(JSON.stringify({ type: 'player_profile', profile: playerInfo }));
        break;
      }

      case 'create_room': {
        const roomId = data.roomId || Math.random().toString(36).substring(2, 8).toUpperCase();
        const baseTime = data.timeControl ? data.timeControl.base : 600; // 10 min default
        const inc = data.timeControl ? data.timeControl.inc : 0;

        const room = new GameRoom(roomId, { base: baseTime, inc });
        rooms.set(roomId, room);
        currentRoomId = roomId;

        const player = {
          ws: socket,
          playerId: data.playerId,
          name: data.playerName || 'Spieler Weiß',
          rating: data.rating || 1200,
          timeLeft: baseTime
        };

        if (data.preferredColor === 'b') {
          room.black = player;
        } else {
          room.white = player;
        }

        socket.send(JSON.stringify({
          type: 'room_created',
          roomId,
          color: data.preferredColor === 'b' ? 'b' : 'w',
          timeControl: room.timeControl
        }));
        break;
      }

      case 'join_room': {
        const roomId = (data.roomId || '').toUpperCase();
        if (!rooms.has(roomId)) {
          socket.send(JSON.stringify({ type: 'error', message: 'Raum nicht gefunden!' }));
          return;
        }

        const room = rooms.get(roomId);
        currentRoomId = roomId;

        const player = {
          ws: socket,
          playerId: data.playerId,
          name: data.playerName || 'Gastspieler',
          rating: data.rating || 1200,
          timeLeft: room.timeControl.base
        };

        if (!room.white) {
          room.white = player;
        } else if (!room.black) {
          room.black = player;
        } else {
          // Join as spectator
          room.spectators.push(socket);
          socket.send(JSON.stringify({
            type: 'joined_spectator',
            roomId,
            fen: room.game.getFen(),
            history: room.game.moveHistory
          }));
          return;
        }

        const assignedColor = room.white.ws === socket ? 'w' : 'b';
        socket.send(JSON.stringify({
          type: 'room_joined',
          roomId,
          color: assignedColor
        }));

        // Both players are present: START MATCH
        if (room.white && room.black) {
          // Send to White player
          room.white.ws.send(JSON.stringify({
            type: 'match_start',
            roomId,
            yourColor: 'w',
            white: { id: room.white.playerId, name: room.white.name, rating: room.white.rating },
            black: { id: room.black.playerId, name: room.black.name, rating: room.black.rating },
            fen: room.game.getFen(),
            timeControl: room.timeControl
          }));

          // Send to Black player
          room.black.ws.send(JSON.stringify({
            type: 'match_start',
            roomId,
            yourColor: 'b',
            white: { id: room.white.playerId, name: room.white.name, rating: room.white.rating },
            black: { id: room.black.playerId, name: room.black.name, rating: room.black.rating },
            fen: room.game.getFen(),
            timeControl: room.timeControl
          }));

          // Send to Spectators if any
          room.spectators.forEach(spec => {
            spec.send(JSON.stringify({
              type: 'match_start',
              roomId,
              yourColor: 'spectator',
              white: { id: room.white.playerId, name: room.white.name, rating: room.white.rating },
              black: { id: room.black.playerId, name: room.black.name, rating: room.black.rating },
              fen: room.game.getFen(),
              timeControl: room.timeControl
            }));
          });

          room.startClocks();
        }
        break;
      }

      case 'make_move': {
        if (!currentRoomId || !rooms.has(currentRoomId)) return;
        const room = rooms.get(currentRoomId);
        if (room.isOver) return;

        // Verify turn
        const isWhiteTurn = room.game.turn === 'w';
        const expectedWs = isWhiteTurn ? room.white?.ws : room.black?.ws;
        if (expectedWs !== socket) {
          socket.send(JSON.stringify({ type: 'error', message: 'Nicht am Zug!' }));
          return;
        }

        // Authoritative move validation
        const moveRes = room.game.makeMove(data.move);
        if (!moveRes) {
          socket.send(JSON.stringify({ type: 'error', message: 'Ungültiger Zug!' }));
          return;
        }

        // Apply time increment
        const player = isWhiteTurn ? room.white : room.black;
        player.timeLeft += room.timeControl.inc;

        room.activeTurn = room.game.turn;

        const status = room.game.getGameStatus();

        room.broadcast({
          type: 'move_made',
          move: moveRes,
          san: moveRes.san,
          fen: room.game.getFen(),
          whiteTime: room.white.timeLeft,
          blackTime: room.black.timeLeft,
          turn: room.game.turn,
          status
        });

        if (status.isGameOver) {
          room.isOver = true;
          room.stopClocks();

          let scoreWhite = 0.5;
          if (status.status === 'checkmate') {
            scoreWhite = status.winner === 'w' ? 1.0 : 0.0;
          }

          const eloUpdate = eloSystem.recordMatch(
            room.white.playerId,
            room.black.playerId,
            scoreWhite,
            room.game.exportPgn()
          );

          room.broadcast({
            type: 'game_over',
            reason: status.status,
            winner: status.winner,
            message: status.reason,
            eloUpdate
          });
        }
        break;
      }

      case 'resign': {
        if (!currentRoomId || !rooms.has(currentRoomId)) return;
        const room = rooms.get(currentRoomId);
        if (room.isOver) return;

        const isWhite = room.white?.ws === socket;
        const winner = isWhite ? 'b' : 'w';
        room.isOver = true;
        room.stopClocks();

        const eloUpdate = eloSystem.recordMatch(
          room.white.playerId,
          room.black.playerId,
          winner === 'w' ? 1.0 : 0.0,
          room.game.exportPgn()
        );

        room.broadcast({
          type: 'game_over',
          reason: 'resignation',
          winner,
          message: `${isWhite ? room.white.name : room.black.name} hat aufgegeben.`,
          eloUpdate
        });
        break;
      }

      case 'quick_match': {
        // Enqueue player
        const playerEntry = {
          ws: socket,
          playerId: data.playerId,
          name: data.playerName,
          rating: data.rating || 1200,
          timeControl: data.timeControl || { base: 600, inc: 0 }
        };

        // Match against existing queue member
        if (quickQueue.length > 0) {
          const opponent = quickQueue.shift();
          const roomId = `QM_${Date.now().toString().slice(-6)}`;
          const room = new GameRoom(roomId, playerEntry.timeControl);
          rooms.set(roomId, room);

          // Randomize colors
          const flip = Math.random() < 0.5;
          room.white = flip ? playerEntry : opponent;
          room.black = flip ? opponent : playerEntry;

          currentRoomId = roomId;

          room.white.ws.send(JSON.stringify({
            type: 'match_start',
            roomId,
            yourColor: 'w',
            white: { id: room.white.playerId, name: room.white.name, rating: room.white.rating },
            black: { id: room.black.playerId, name: room.black.name, rating: room.black.rating },
            fen: room.game.getFen(),
            timeControl: room.timeControl
          }));

          room.black.ws.send(JSON.stringify({
            type: 'match_start',
            roomId,
            yourColor: 'b',
            white: { id: room.white.playerId, name: room.white.name, rating: room.white.rating },
            black: { id: room.black.playerId, name: room.black.name, rating: room.black.rating },
            fen: room.game.getFen(),
            timeControl: room.timeControl
          }));

          room.startClocks();
        } else {
          quickQueue.push(playerEntry);
          socket.send(JSON.stringify({ type: 'matchmaking_waiting', message: 'Suche nach Gegner...' }));
        }
        break;
      }

      case 'ping': {
        socket.send(JSON.stringify({ type: 'pong', clientTime: data.clientTime, serverTime: Date.now() }));
        break;
      }
    }
  }
});

server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(` Worldcraft Chess Server online!`);
  console.log(` Web Frontend: http://localhost:${PORT}`);
  console.log(` WebSocket:    ws://localhost:${PORT}`);
  console.log(`=========================================`);
});
