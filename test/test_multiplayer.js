const WebSocket = require('ws');

const ws1 = new WebSocket('ws://localhost:3000');
const ws2 = new WebSocket('ws://localhost:3000');

let roomCode = null;

ws1.on('open', () => {
  console.log('WS1 connected');
  ws1.send(JSON.stringify({
    type: 'create_room',
    playerId: 'p1',
    playerName: 'Player White',
    preferredColor: 'w',
    timeControl: { base: 300, inc: 2 }
  }));
});

ws1.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('WS1 received:', msg.type);

  if (msg.type === 'room_created') {
    roomCode = msg.roomId;
    console.log('Room created with code:', roomCode);
    const sendJoin = () => {
      ws2.send(JSON.stringify({
        type: 'join_room',
        roomId: roomCode,
        playerId: 'p2',
        playerName: 'Player Black'
      }));
    };
    if (ws2.readyState === 1) {
      sendJoin();
    } else {
      ws2.on('open', sendJoin);
    }
  }

  if (msg.type === 'match_start') {
    console.log('Match started! Sending move e2e4...');
    ws1.send(JSON.stringify({
      type: 'make_move',
      move: 'e2e4'
    }));
  }
});

ws2.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('WS2 received:', msg.type);
  if (msg.type === 'move_made') {
    console.log('WS2 saw move:', msg.san);
    console.log('SUCCESS: Full multiplayer roundtrip verified!');
    ws1.close();
    ws2.close();
    process.exit(0);
  }
});
