const { players, playersByUser, getOrCreatePlayer } = require("./gameState");

// ==========================
// GAME STATE STORE
// ==========================
const games = new Map();
// gameId => { hostId, enemiesConfigured, numEnemies, pot, status, players, playerBets, startedAt }

// ==========================
// EMITTER HELPERS
// ==========================
const emitTacticalUpdate = (io) => {
  const data = [...playersByUser.values()]
    .filter((p) => p.room)
    .map((p) => ({
      userId: p.userId,
      username: p.username,
      position: p.position,
      health: p.health,
      room: p.room,
    }));

  io.emit("tacticalUpdate", { players: data });
};

const emitGameEvent = (io, adminNamespace, gameId, payload) => {
  if (!gameId) return;
  const event = { ...payload, gameId, timestamp: Date.now() };

  io.to(gameId).emit("game:event", event);
  adminNamespace.emit("game:event", event);
};

const emitActivity = (adminNamespace, payload) => {
  adminNamespace.emit("activity:event", {
    ...payload,
    timestamp: Date.now(),
  });
};

// ==========================
// GAME UTILS
// ==========================
const getOrInitGame = (gameId) => {
  if (!games.has(gameId)) {
    games.set(gameId, {
      hostId: null,
      enemiesConfigured: false,
      numEnemies: 0,
      pot: 0,
      status: "waiting",
      players: [],
      playerBets: {},
      startedAt: null,
    });
  }
  return games.get(gameId);
};

const cleanupGameIfEmpty = (gameId) => {
  const stillHasPlayers = [...playersByUser.values()].some(
    (p) => p.room === gameId
  );
  if (!stillHasPlayers) games.delete(gameId);
};

// ==========================
// REGISTER SOCKETS
// ==========================
function registerGameSockets(io, adminNamespace, socket) {
  const player = getOrCreatePlayer(socket);

  // Handle duplicate connections
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    oldSocket?.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  // ==========================
  // JOIN ROOM
  // ==========================
  socket.on("joinRoom", (gameId, callback) => {
    if (!gameId)
      return callback?.({ success: false, message: "Missing gameId" });

    socket.join(gameId);
    player.room = gameId;

    const game = getOrInitGame(gameId);

    if (!game.players.includes(player.userId))
      game.players.push(player.userId);

    if (!game.hostId)
      game.hostId = player.userId;

    // If already started, sync state
    if (game.status === "started") {
      socket.emit("game:event", {
        type: "GAME_STARTED",
        gameId,
        pot: game.pot,
        enemies: game.numEnemies,
        status: "started",
      });
    }

    emitGameEvent(io, adminNamespace, gameId, {
      type: "PLAYER_JOINED",
      userId: player.userId,
      username: player.username,
    });

    emitActivity(adminNamespace, {
      type: "PLAYER_JOINED",
      userId: player.userId,
      username: player.username,
      room: gameId,
    });

    emitTacticalUpdate(io);

    callback?.({
      success: true,
      joined: true,
      gameStatus: game.status,
      pot: game.pot,
      enemies: game.numEnemies,
    });
  });

  // ==========================
  // INIT DATA
  // ==========================
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter(
      (p) => p.room === player.room
    ),
  });

  // ==========================
  // PLAYER CREATES GAME / BET
  // ==========================
  socket.on("game:create", ({ gameId, hostId, betAmount }, callback) => {
    if (!gameId || !hostId || !betAmount || betAmount <= 0) {
      return callback?.({ success: false, message: "Invalid bet data" });
    }

    const game = getOrInitGame(gameId);

    game.hostId = hostId;
    game.playerBets[player.userId] = Number(betAmount);
    game.pot += Number(betAmount);

    emitGameEvent(io, adminNamespace, gameId, {
      type: "PLAYER_BET",
      userId: player.userId,
      username: player.username,
      betAmount: Number(betAmount),
      newPot: game.pot,
    });

    callback?.({
      success: true,
      gameId,
      pot: game.pot,
    });
  });

  // ==========================
  // CONFIGURE ENEMIES
  // ==========================
  socket.on("host:configureEnemies", ({ gameId, numEnemies }, callback) => {
    if (!gameId || !numEnemies || numEnemies <= 0) {
      return callback?.({
        success: false,
        message: "Invalid enemies number",
      });
    }

    const game = getOrInitGame(gameId);
    game.enemiesConfigured = true;
    game.numEnemies = Number(numEnemies);

    emitGameEvent(io, adminNamespace, gameId, {
      type: "ENEMIES_CONFIGURED",
      enemies: game.numEnemies,
    });

    emitActivity(adminNamespace, {
      type: "ENEMIES_CONFIGURED",
      gameId,
      enemies: game.numEnemies,
    });

    callback?.({ success: true });
  });

  // ==========================
  // ADD TO POT
  // ==========================
  socket.on("host:addToPot", ({ gameId, amount }, callback) => {
    if (!gameId || !amount || amount <= 0) {
      return callback?.({
        success: false,
        message: "Invalid pot amount",
      });
    }

    const game = getOrInitGame(gameId);
    game.pot += Number(amount);

    emitGameEvent(io, adminNamespace, gameId, {
      type: "ADMIN_ADD_POT",
      amount,
      newPot: game.pot,
    });

    emitActivity(adminNamespace, {
      type: "ADMIN_ADD_POT",
      gameId,
      amount,
      newPot: game.pot,
    });

    callback?.({ success: true, newPot: game.pot });
  });

  // ==========================
  // START GAME
  // ==========================
  socket.on("host:startGame", ({ gameId }, callback) => {
    const game = getOrInitGame(gameId);

    game.status = "started";
    game.startedAt = Date.now();

    emitGameEvent(io, adminNamespace, gameId, {
      type: "GAME_STARTED",
      pot: game.pot,
      enemies: game.numEnemies,
      status: "started",
    });

    callback?.({
      success: true,
      status: game.status,
      pot: game.pot,
      enemies: game.numEnemies,
    });
  });

  // ==========================
  // DISCONNECT
  // ==========================
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;

    players.delete(socket.id);

    if (p.room) {
      emitGameEvent(io, adminNamespace, p.room, {
        type: "PLAYER_DISCONNECTED",
        userId: p.userId,
        username: p.username,
      });

      emitActivity(adminNamespace, {
        type: "PLAYER_DISCONNECTED",
        userId: p.userId,
        room: p.room,
      });

      cleanupGameIfEmpty(p.room);
    }

    emitTacticalUpdate(io);
  });
}

module.exports = {
  registerGameSockets,
  games,
};
