const { players, playersByUser, getOrCreatePlayer } = require("./gameState");
const { handlePvPAttack } = require("./combat");

// ==========================
// SIMPLE GAME STATE STORE
// ==========================
const games = new Map(); 
// gameId => {
//   enemiesConfigured: false,
//   numEnemies: 0,
//   pot: 0,
//   status: "waiting"
// }

// ==========================
// EMITTERS
// ==========================
function emitTacticalUpdate(io) {
  const data = [];

  playersByUser.forEach((player) => {
    if (!player.room) return;

    data.push({
      userId: player.userId,
      username: player.username,
      position: player.position,
      health: player.health,
      room: player.room,
    });
  });

  io.emit("tacticalUpdate", { players: data });
}

function emitActivity(io, payload) {
  io.emit("activity:event", {
    ...payload,
    timestamp: Date.now(),
  });
}

function emitGameEvent(io, payload) {
  io.emit("game:event", {
    ...payload,
    timestamp: Date.now(),
  });
}

// ==========================
// REGISTER GAME SOCKETS
// ==========================
function registerGameSockets(io, socket) {
  const player = getOrCreatePlayer(socket);

  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    if (oldSocket) oldSocket.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  if (player.room) socket.join(player.room);

  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter((p) => p.room === player.room),
  });

  socket.to(player.room).emit("playerJoined", player);

  emitGameEvent(io, {
    type: "PLAYER_JOINED",
    userId: player.userId,
    username: player.username,
    room: player.room,
  });

  emitActivity(io, {
    type: "PLAYER_JOINED",
    userId: player.userId,
    username: player.username,
    room: player.room,
  });

  emitTacticalUpdate(io);

  // =========================
  // ENEMY CONFIGURATION (NEW)
  // =========================
  socket.on("host:configureEnemies", ({ gameId, numEnemies }) => {
    if (!gameId || !numEnemies || numEnemies <= 0) return;

    let game = games.get(gameId);

    if (!game) {
      game = {
        enemiesConfigured: false,
        numEnemies: 0,
        pot: 0,
        status: "waiting",
      };
      games.set(gameId, game);
    }

    game.enemiesConfigured = true;
    game.numEnemies = numEnemies;

    emitGameEvent(io, {
      type: "ENEMIES_CONFIGURED",
      gameId,
      enemies: numEnemies,
    });

    emitActivity(io, {
      type: "ENEMIES_CONFIGURED",
      gameId,
      enemies: numEnemies,
    });
  });

  // =========================
  // START GAME (REQUIRES ENEMIES)
  // =========================
  socket.on("host:startGame", ({ gameId, pot }) => {
    const game = games.get(gameId);

    if (!game || !game.enemiesConfigured) {
      return socket.emit("error", {
        message: "Enemies must be configured first",
      });
    }

    game.status = "started";
    game.pot = pot || 0;

    emitGameEvent(io, {
      type: "GAME_STARTED",
      gameId,
      status: "started",
      pot: game.pot,
      enemies: game.numEnemies,
    });

    emitActivity(io, {
      type: "GAME_STARTED",
      gameId,
      pot: game.pot,
    });
  });

  // =========================
  // ADD TO POT
  // =========================
  socket.on("host:addToPot", ({ gameId, amount }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.pot += amount;

    emitGameEvent(io, {
      type: "ADMIN_ADD_POT",
      gameId,
      amount,
      newPot: game.pot,
    });

    emitActivity(io, {
      type: "ADMIN_ADD_POT",
      gameId,
      amount,
      newPot: game.pot,
    });
  });

  // =========================
  // END GAME
  // =========================
  socket.on("host:endGame", ({ gameId, winnerId, creditedCoins }) => {
    const game = games.get(gameId);
    if (!game) return;

    game.status = "finished";

    emitGameEvent(io, {
      type: "GAME_RESULT",
      gameId,
      winnerId,
      creditedCoins,
      status: "finished",
      pot: game.pot,
    });

    emitActivity(io, {
      type: "GAME_RESULT",
      gameId,
      winnerId,
      creditedCoins,
      pot: game.pot,
    });
  });

  // =========================
  // DISCONNECT
  // =========================
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;

    players.delete(socket.id);
    socket.to(p.room).emit("playerLeft", p.userId);

    emitGameEvent(io, {
      type: "PLAYER_DISCONNECTED",
      userId: p.userId,
      username: p.username,
      room: p.room,
    });

    emitActivity(io, {
      type: "PLAYER_DISCONNECTED",
      userId: p.userId,
      username: p.username,
      room: p.room,
    });

    emitTacticalUpdate(io);
  });
}

module.exports = {
  registerGameSockets,
  emitTacticalUpdate,
  emitActivity,
  emitGameEvent,
};
