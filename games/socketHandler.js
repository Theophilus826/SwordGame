const { players, playersByUser, getOrCreatePlayer } = require("./gameState");
const { handlePvPAttack } = require("./combat");

// ==========================
// ADMIN EMITTERS
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

  io.of("/admin").emit("tacticalUpdate", { players: data });
}

function emitActivity(io, payload) {
  io.of("/admin").emit("activity:event", {
    ...payload,
    timestamp: Date.now(),
  });
}

function emitGameEvent(io, payload) {
  io.of("/admin").emit("game:event", {
    ...payload,
    timestamp: Date.now(),
  });

  // Ensure player namespace also gets it if room exists
  if (payload.gameId) {
    io.to(payload.gameId).emit("game:event", {
      ...payload,
      timestamp: Date.now(),
    });
  }
}

// ==========================
// REGISTER GAME SOCKETS
// ==========================
function registerGameSockets(io, socket) {
  // Create or restore player
  const player = getOrCreatePlayer(socket);

  // Disconnect old socket if exists
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);
    if (oldSocket) oldSocket.disconnect(true);
  }

  player.socketId = socket.id;
  players.set(socket.id, player);

  // If player already has a room, join it
  if (player.room) {
    socket.join(player.room);
    console.log(`🎮 ${player.username} re-joined room ${player.room}`);
  }

  // Initialize player
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter((p) => p.room === player.room),
  });

  socket.to(player.room).emit("playerJoined", player);

  emitActivity(io, {
    type: "PLAYER_JOINED",
    userId: player.userId,
    username: player.username,
    room: player.room,
  });

  emitTacticalUpdate(io);

  // =========================
  // JOIN ROOM
  // =========================
  socket.on("joinRoom", (roomName) => {
    if (!roomName) return;
    const oldRoom = player.room;

    if (oldRoom !== roomName) {
      if (oldRoom) socket.leave(oldRoom);
      socket.join(roomName);
      player.room = roomName;

      console.log(`🎮 ${player.username} joined room: ${roomName}`);

      socket.emit("roomJoined", {
        room: roomName,
        players: [...playersByUser.values()].filter((p) => p.room === roomName),
      });

      socket.to(roomName).emit("playerJoined", player);

      emitActivity(io, {
        type: "ROOM_CHANGED",
        userId: player.userId,
        username: player.username,
        from: oldRoom,
        to: roomName,
      });

      emitTacticalUpdate(io);
    } else {
      // Ensure socket is in room even if oldRoom === roomName
      socket.join(roomName);
      console.log(`🎮 ${player.username} re-joined existing room: ${roomName}`);
    }
  });

  // =========================
  // MOVEMENT
  // =========================
  socket.on("move", (data) => {
    if (!data?.position) return;
    player.position = data.position;
    player.rotation = data.rotation;

    socket.to(player.room).emit("playerMoved", {
      userId: player.userId,
      position: player.position,
      rotation: player.rotation,
    });

    emitTacticalUpdate(io);
  });

  // =========================
  // ATTACK (PvP)
  // =========================
  socket.on("attack", () => {
    if (player.health <= 0) return;

    const hits = handlePvPAttack(player, playersByUser);

    emitActivity(io, {
      type: "PLAYER_ATTACK",
      attacker: player.username,
      attackerId: player.userId,
      room: player.room,
    });

    hits.forEach((hit) => {
      io.to(player.room).emit("playerDamaged", hit);

      emitActivity(io, {
        type: "PLAYER_DAMAGED",
        attacker: player.username,
        victimId: hit.userId,
        damage: hit.damage,
        remainingHealth: hit.health,
        room: player.room,
      });

      if (hit.health <= 0) {
        emitActivity(io, {
          type: "PLAYER_KILLED",
          killer: player.username,
          victimId: hit.userId,
          room: player.room,
        });
      }
    });

    emitTacticalUpdate(io);
  });

  // =========================
  // GAME EVENTS FROM HOST
  // =========================
  socket.on("host:startGame", ({ gameId, pot }) => {
    emitActivity(io, { type: "GAME_STARTED", gameId, pot });
    emitGameEvent(io, { type: "GAME_STARTED", gameId, status: "started", pot });
  });

  socket.on("host:addToPot", ({ gameId, amount, newPot }) => {
    emitActivity(io, { type: "ADMIN_ADD_POT", gameId, amount, newPot });
    emitGameEvent(io, { type: "ADMIN_ADD_POT", gameId, amount, newPot });
  });

  socket.on("host:endGame", ({ gameId, winnerId, creditedCoins, pot }) => {
    emitActivity(io, { type: "GAME_RESULT", gameId, winnerId, creditedCoins, pot });
    emitGameEvent(io, {
      type: "GAME_RESULT",
      gameId,
      winnerId,
      creditedCoins,
      status: "finished",
      pot,
    });
  });

  // =========================
  // DISCONNECT
  // =========================
  socket.on("disconnect", () => {
    players.delete(socket.id);
    socket.to(player.room).emit("playerLeft", player.userId);

    emitActivity(io, {
      type: "PLAYER_DISCONNECTED",
      userId: player.userId,
      username: player.username,
      room: player.room,
    });

    emitTacticalUpdate(io);
    console.log(`🔴 ${player.username} disconnected`);
  });
}

module.exports = {
  registerGameSockets,
  emitTacticalUpdate,
  emitActivity,
  emitGameEvent,
};
