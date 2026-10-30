/**
 * Client-Side WebSocket Controller for Multiplayer Chess
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
      this.currentRoom = null;
      this.playerColor = 'w';
      this.pingMs = 0;
    }

    connect(url) {
      if (!url) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        url = `${protocol}//${window.location.host}`;
      }

      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        console.warn('Could not connect to WebSocket directly:', e);
        return;
      }

      this.ws.onopen = () => {
        this.isConnected = true;
        this.startPing();
        if (this.callbacks.onConnect) this.callbacks.onConnect();
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket error:', err);
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

    startPing() {
      setInterval(() => {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
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
          this.playerColor = msg.color;
          if (this.callbacks.onRoomCreated) this.callbacks.onRoomCreated(msg);
          break;
        }

        case 'match_start': {
          this.currentRoom = msg.roomId;
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

    createRoom(playerId, playerName, preferredColor = 'w', timeControl = { base: 600, inc: 0 }) {
      this.send({
        type: 'create_room',
        playerId,
        playerName,
        preferredColor,
        timeControl
      });
    }

    joinRoom(roomId, playerId, playerName) {
      this.send({
        type: 'join_room',
        roomId,
        playerId,
        playerName
      });
    }

    quickMatch(playerId, playerName, rating = 1200, timeControl = { base: 600, inc: 0 }) {
      this.send({
        type: 'quick_match',
        playerId,
        playerName,
        rating,
        timeControl
      });
    }

    sendMove(move) {
      this.send({
        type: 'make_move',
        move
      });
    }

    resign() {
      this.send({ type: 'resign' });
    }
  }

  return ClientSocket;
});
