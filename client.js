// Socket.IO 客户端连接
class GameClient {
  constructor() {
    this.socket = null;
    this.roomId = null;
    this.playerId = null;
    this.playerName = null;
    this.isHost = false;
    this.currentRoom = null;
  }

  connect() {
    // 连接到服务器
    this.socket = io(window.location.origin.replace(':3000', ':3001'));
    
    this.socket.on('connect', () => {
      console.log('已连接到服务器');
      this.playerId = this.socket.id;
    });

    this.socket.on('disconnect', () => {
      console.log('与服务器断开连接');
      this.showConnectionStatus('离线', false);
    });

    this.socket.on('error', (message) => {
      alert(message);
    });

    // 房间创建成功
    this.socket.on('room-created', (data) => {
      this.roomId = data.roomId;
      this.currentRoom = data.room;
      this.showLobby();
    });

    // 加入房间成功
    this.socket.on('joined-room', (data) => {
      this.currentRoom = data.room;
      this.showLobby();
    });

    // 玩家加入/离开
    this.socket.on('player-joined', (data) => {
      this.currentRoom.players = data.players;
      this.updatePlayersList();
    });

    this.socket.on('player-left', (data) => {
      this.currentRoom.players = data;
      this.updatePlayersList();
    });

    this.socket.on('player-updated', (data) => {
      this.currentRoom.players = data;
      this.updatePlayersList();
    });

    // 游戏开始
    this.socket.on('game-started', (data) => {
      this.showIdentity(data.identity, data.word);
    });

    // 发言同步
    this.socket.on('speech-submitted', (data) => {
      this.updateSpeeches(data.speeches);
      this.updateCurrentSpeaker(data.currentSpeakerIndex);
    });

    this.socket.on('all-speeches-submitted', () => {
      this.showVotingPhase();
    });

    // 投票结果
    this.socket.on('vote-results', (data) => {
      this.showVoteResults(data);
    });
  }

  // 创建房间
  createRoom(roomName, maxPlayers, playerName) {
    this.playerName = playerName;
    this.isHost = true;
    this.socket.emit('create-room', {
      roomName,
      maxPlayers,
      playerName
    });
  }

  // 加入房间
  joinRoom(roomId, playerName) {
    this.roomId = roomId;
    this.playerName = playerName;
    this.isHost = false;
    this.socket.emit('join-room', {
      roomId,
      playerName
    });
  }

  // 玩家准备
  toggleReady() {
    this.socket.emit('player-ready', {
      roomId: this.roomId
    });
  }

  // 开始游戏
  startGame() {
    this.socket.emit('start-game', {
      roomId: this.roomId
    });
  }

  // 提交发言
  submitSpeech(text) {
    this.socket.emit('submit-speech', {
      roomId: this.roomId,
      text
    });
  }

  // 提交投票
  submitVote(targetPlayerId) {
    this.socket.emit('submit-vote', {
      roomId: this.roomId,
      targetPlayerId
    });
  }

  // 离开房间
  leaveRoom() {
    this.socket.emit('leave-room', {
      roomId: this.roomId
    });
    this.roomId = null;
    this.currentRoom = null;
  }

  // UI更新方法（需要集成到现有代码中）
  showLobby() {
    // 触发显示大厅界面
    if (window.showLobbyScreen) {
      window.showLobbyScreen(this.currentRoom);
    }
  }

  updatePlayersList() {
    if (window.updatePlayersList) {
      window.updatePlayersList(this.currentRoom.players);
    }
  }

  showIdentity(identity, word) {
    if (window.showIdentityScreen) {
      window.showIdentityScreen(identity, word);
    }
  }

  updateSpeeches(speeches) {
    if (window.updateSpeeches) {
      window.updateSpeeches(speeches);
    }
  }

  updateCurrentSpeaker(index) {
    if (window.updateCurrentSpeaker) {
      window.updateCurrentSpeaker(index);
    }
  }

  showVotingPhase() {
    if (window.showVotingPhase) {
      window.showVotingPhase();
    }
  }

  showVoteResults(data) {
    if (window.showVoteResults) {
      window.showVoteResults(data);
    }
  }

  showConnectionStatus(status, connected) {
    // 显示连接状态
    console.log(`连接状态: ${status}`);
  }
}

// 全局游戏客户端实例
window.gameClient = new GameClient();