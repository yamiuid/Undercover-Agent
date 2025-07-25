const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// 存储房间数据
const rooms = new Map();

// 词语库
const wordPairs = [
  { civilian: '牛奶', spy: '豆浆' },
  { civilian: '面包', spy: '蛋糕' },
  { civilian: '电脑', spy: '手机' },
  { civilian: '篮球', spy: '足球' },
  { civilian: '夏天', spy: '冬天' },
  { civilian: '咖啡', spy: '茶' },
  { civilian: '火车', spy: '高铁' },
  { civilian: '米饭', spy: '面条' },
  { civilian: '苹果', spy: '梨子' },
  { civilian: '老师', spy: '学生' }
];

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 创建房间
  socket.on('create-room', (data) => {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    const room = {
      id: roomId,
      name: data.roomName || '我的房间',
      maxPlayers: data.maxPlayers || 4,
      players: [],
      gameState: 'waiting', // waiting, playing, ended
      currentRound: 1,
      words: {},
      identities: {},
      speeches: [],
      votes: {},
      eliminatedPlayers: [],
      currentSpeakerIndex: 0
    };
    
    rooms.set(roomId, room);
    socket.emit('room-created', { roomId, room });
  });

  // 加入房间
  socket.on('join-room', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) {
      socket.emit('error', '房间不存在');
      return;
    }

    if (room.players.length >= room.maxPlayers) {
      socket.emit('error', '房间已满');
      return;
    }

    const player = {
      id: socket.id,
      name: data.playerName || `玩家${room.players.length + 1}`,
      isReady: false,
      isHost: room.players.length === 0
    };

    room.players.push(player);
    socket.join(data.roomId);
    
    // 发送给所有房间成员
    io.to(data.roomId).emit('player-joined', {
      players: room.players,
      newPlayer: player
    });

    // 发送给当前用户
    socket.emit('joined-room', { room, player });
  });

  // 玩家准备
  socket.on('player-ready', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.isReady = !player.isReady;
      io.to(data.roomId).emit('player-updated', room.players);
    }
  });

  // 开始游戏
  socket.on('start-game', (data) => {
    const room = rooms.get(data.roomId);
    if (!room || room.players.length < 3) return;

    // 分配词语和身份
    const wordPair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    const spyIndex = Math.floor(Math.random() * room.players.length);
    
    room.words = wordPair;
    room.gameState = 'playing';
    room.identities = {};
    room.speeches = [];
    room.votes = {};
    room.eliminatedPlayers = [];
    room.currentSpeakerIndex = 0;

    room.players.forEach((player, index) => {
      room.identities[player.id] = index === spyIndex ? 'spy' : 'civilian';
    });

    // 发送游戏开始消息
    room.players.forEach(player => {
      const identity = room.identities[player.id];
      const word = identity === 'spy' ? wordPair.spy : wordPair.civilian;
      io.to(player.id).emit('game-started', {
        identity,
        word,
        players: room.players
      });
    });

    io.to(data.roomId).emit('game-state-updated', {
      gameState: room.gameState,
      currentRound: room.currentRound,
      players: room.players
    });
  });

  // 提交发言
  socket.on('submit-speech', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      room.speeches.push({
        playerId: socket.id,
        playerName: player.name,
        text: data.text,
        timestamp: new Date().toISOString()
      });

      // 下一个发言人
      room.currentSpeakerIndex = (room.currentSpeakerIndex + 1) % room.players.length;
      
      io.to(data.roomId).emit('speech-submitted', {
        speeches: room.speeches,
        currentSpeakerIndex: room.currentSpeakerIndex
      });

      // 检查是否所有玩家都已发言
      const activePlayers = room.players.filter(p => !room.eliminatedPlayers.includes(p.id));
      if (room.speeches.length >= activePlayers.length) {
        io.to(data.roomId).emit('all-speeches-submitted');
      }
    }
  });

  // 提交投票
  socket.on('submit-vote', (data) => {
    const room = rooms.get(data.roomId);
    if (!room) return;

    room.votes[socket.id] = data.targetPlayerId;

    const activePlayers = room.players.filter(p => !room.eliminatedPlayers.includes(p.id));
    if (Object.keys(room.votes).length >= activePlayers.length) {
      // 计算投票结果
      const voteCounts = {};
      Object.values(room.votes).forEach(playerId => {
        voteCounts[playerId] = (voteCounts[playerId] || 0) + 1;
      });

      const maxVotes = Math.max(...Object.values(voteCounts));
      const eliminatedPlayerId = Object.keys(voteCounts).find(
        id => voteCounts[id] === maxVotes
      );

      room.eliminatedPlayers.push(eliminatedPlayerId);

      // 检查游戏是否结束
      const remainingPlayers = activePlayers.filter(p => !room.eliminatedPlayers.includes(p.id));
      const remainingSpies = remainingPlayers.filter(p => room.identities[p.id] === 'spy');
      const remainingCivilians = remainingPlayers.filter(p => room.identities[p.id] === 'civilian');

      let gameOver = false;
      let winner = null;

      if (remainingSpies.length === 0) {
        gameOver = true;
        winner = 'civilians';
      } else if (remainingSpies.length >= remainingCivilians.length) {
        gameOver = true;
        winner = 'spy';
      }

      io.to(data.roomId).emit('vote-results', {
        eliminatedPlayerId,
        voteCounts,
        gameOver,
        winner,
        words: room.words
      });

      if (gameOver) {
        room.gameState = 'ended';
      } else {
        // 下一轮
        room.currentRound++;
        room.speeches = [];
        room.votes = {};
        room.currentSpeakerIndex = 0;
      }
    }
  });

  // 离开房间
  socket.on('leave-room', (data) => {
    const room = rooms.get(data.roomId);
    if (room) {
      room.players = room.players.filter(p => p.id !== socket.id);
      socket.leave(data.roomId);
      io.to(data.roomId).emit('player-left', room.players);

      // 如果房间为空，删除房间
      if (room.players.length === 0) {
        rooms.delete(data.roomId);
      }
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
    
    // 从所有房间中移除该玩家
    rooms.forEach((room, roomId) => {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        io.to(roomId).emit('player-left', room.players);
        
        if (room.players.length === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

// REST API 端点
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    gameState: room.gameState
  }));
  res.json(roomList);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});