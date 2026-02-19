const { players, playersByUser, getOrCreatePlayer } = require("./gameState");
const { handlePvPAttack } = require("./combat");

/**
 * Emit live tactical data to admin namespace
 */
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

/**
 * Emit activity events to admin monitor
 */
function emitActivity(io, payload) {
  io.of("/admin").emit("activity:event", {
    ...payload,
    timestamp: Date.now(),
  });
}

/**
 * Register game socket logic
 */
function registerGameSockets(io, socket) {

  // 🔐 Create / restore player (reconnect-safe)
  const player = getOrCreatePlayer(socket);
  players.set(socket.id, player);

  // Join room
  socket.join(player.room);

  // Send initial state
  socket.emit("init", {
    self: player,
    players: [...playersByUser.values()],
  });

  socket.to(player.room).emit("playerJoined", player);

  // ✅ Admin Activity → Player Joined
  emitActivity(io, {
    type: "PLAYER_JOINED",
    userId: player.userId,
    username: player.username,
    room: player.room,
  });

  emitTacticalUpdate(io);

  // =========================
  // MOVEMENT
  // =========================
  socket.on("move", data => {
    const p = players.get(socket.id);
    if (!p) return;

    p.position = data.position;
    p.rotation = data.rotation;

    socket.to(p.room).emit("playerMoved", p);

    // ✅ Admin Activity → Movement
    emitActivity(io, {
      type: "PLAYER_MOVED",
      userId: p.userId,
      username: p.username,
      room: p.room,
      position: p.position,
    });

    emitTacticalUpdate(io);
  });

  // =========================
  // ATTACK (PvP)
  // =========================
  socket.on("attack", () => {
    const attacker = players.get(socket.id);
    if (!attacker) return;

    const hits = handlePvPAttack(attacker, playersByUser);

    // ✅ Admin Activity → Attack Initiated
    emitActivity(io, {
      type: "PLAYER_ATTACK",
      attacker: attacker.username,
      attackerId: attacker.userId,
      room: attacker.room,
    });

    hits.forEach(hit => {

      // Notify players in room
      io.to(attacker.room).emit("playerDamaged", hit);

      // ✅ Admin Activity → Damage Event
      emitActivity(io, {
        type: "PLAYER_DAMAGED",
        attacker: attacker.username,
        victimId: hit.userId,
        damage: hit.damage,
        remainingHealth: hit.health,
        room: attacker.room,
      });

      // ✅ Kill Detection 🔥
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

  // =========================
  // ROOM JOIN
  // =========================
  socket.on("joinRoom", roomName => {
    const p = players.get(socket.id);
    if (!p) return;

    const oldRoom = p.room;

    socket.leave(oldRoom);
    socket.join(roomName);

    p.room = roomName;

    socket.emit("roomJoined", roomName);

    // ✅ Admin Activity → Room Change
    emitActivity(io, {
      type: "ROOM_CHANGED",
      userId: p.userId,
      username: p.username,
      from: oldRoom,
      to: roomName,
    });

    emitTacticalUpdate(io);
  });

  // =========================
  // DISCONNECT
  // =========================
  socket.on("disconnect", () => {
    const p = players.get(socket.id);
    if (!p) return;

    players.delete(socket.id);
    socket.to(p.room).emit("playerLeft", p.userId);

    // ✅ Admin Activity → Disconnect
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
