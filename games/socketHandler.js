const { players, playersByUser, getOrCreatePlayer } = require("./gameState");
const { handlePvPAttack } = require("./combat");

/* =========================================================
   ADMIN EMITTERS
========================================================= */

function emitTacticalUpdate(io) {
  const data = [];

  playersByUser.forEach(player => {
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

/* =========================================================
   REGISTER GAME SOCKETS
========================================================= */

function registerGameSockets(io, socket) {

  /* =========================
     CREATE / RESTORE PLAYER
  ========================= */

  const player = getOrCreatePlayer(socket);

  // ✅ Prevent duplicate socket ghosts
  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);

    if (oldSocket) {
      oldSocket.disconnect(true);
    }
  }

  player.socketId = socket.id;

  players.set(socket.id, player);

  /* =========================
     SAFE ROOM JOIN
  ========================= */

  if (player.room) {
    socket.join(player.room);
  }

  /* =========================
     INITIAL STATE SYNC
  ========================= */

  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()].filter(p => p.room === player.room),
  });

  socket.to(player.room).emit("playerJoined", player);

  emitActivity(io, {
    type: "PLAYER_JOINED",
    userId: player.userId,
    username: player.username,
    room: player.room,
  });

  emitTacticalUpdate(io);

  /* =========================================================
     MOVEMENT
  ========================================================= */

  socket.on("move", data => {
    const p = players.get(socket.id);
    if (!p) return;

    if (!data?.position) return;

    p.position = data.position;
    p.rotation = data.rotation;

    socket.to(p.room).emit("playerMoved", {
      userId: p.userId,
      position: p.position,
      rotation: p.rotation,
    });

    emitTacticalUpdate(io);
  });

  /* =========================================================
     ATTACK (PvP)
  ========================================================= */

  socket.on("attack", () => {
    const attacker = players.get(socket.id);
    if (!attacker || attacker.health <= 0) return;

    const hits = handlePvPAttack(attacker, playersByUser);

    emitActivity(io, {
      type: "PLAYER_ATTACK",
      attacker: attacker.username,
      attackerId: attacker.userId,
      room: attacker.room,
    });

    hits.forEach(hit => {

      io.to(attacker.room).emit("playerDamaged", hit);

      emitActivity(io, {
        type: "PLAYER_DAMAGED",
        attacker: attacker.username,
        victimId: hit.userId,
        damage: hit.damage,
        remainingHealth: hit.health,
        room: attacker.room,
      });

      if (hit.health <= 0) {
        emitActivity(io, {
          type: "PLAYER_KILLED",
          killer: attacker.username,
          victimId: hit.userId,
          room: attacker.room,
        });
      }
    });

    emitTacticalUpdate(io);
  });

  /* =========================================================
     JOIN ROOM (CRITICAL FIXED LOGIC)
  ========================================================= */

  socket.on("joinRoom", roomName => {
    const p = players.get(socket.id);
    if (!p || !roomName) return;

    const oldRoom = p.room;

    if (oldRoom === roomName) return;

    socket.leave(oldRoom);
    socket.join(roomName);

    p.room = roomName;

    // ✅ Send clean room state
    socket.emit("roomJoined", {
      room: roomName,
      players: [...playersByUser.values()].filter(pl => pl.room === roomName),
    });

    socket.to(roomName).emit("playerJoined", p);

    emitActivity(io, {
      type: "ROOM_CHANGED",
      userId: p.userId,
      username: p.username,
      from: oldRoom,
      to: roomName,
    });

    emitTacticalUpdate(io);
  });

  /* =========================================================
     DISCONNECT (RECONNECT-SAFE)
  ========================================================= */

  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;

    players.delete(socket.id);

    // ✅ DO NOT delete playersByUser
    // Allows reconnect recovery

    socket.to(p.room).emit("playerLeft", p.userId);

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
};
