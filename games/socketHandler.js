const { processGameCoins } = require("../config/gameCoinService");

const { players, playersByUser, getOrCreatePlayer } = require("./gameState");

const { getGame, createGame, updateGame, deleteGame } = require("./gameStore");
const crypto = require("crypto");
/* =========================================================
EMITTERS
========================================================= */

const emitTacticalUpdate = (io) => {
  const data = [...playersByUser.values()]
    .filter((player) => player.room)
    .map((player) => ({
      userId: player.userId,
      username: player.username,
      position: player.position,
      health: player.health,
      room: player.room,
    }));

  io.emit("tacticalUpdate", {
    players: data,
  });
};

const emitGameEvent = (io, adminNamespace, gameId, payload) => {
  if (!gameId) return;

  const event = {
    ...payload,
    gameId,
    timestamp: Date.now(),
  };

  io.to(gameId).emit("game:event", event);

  adminNamespace.emit("game:event", event);
};

const emitActivity = (adminNamespace, payload) => {
  adminNamespace.emit("activity:event", {
    ...payload,
    timestamp: Date.now(),
  });
};

/* =========================================================
HELPERS
========================================================= */

function cleanupGameIfEmpty(gameId) {
  const game = getGame(gameId);

  if (!game) return;

  const hasPlayers = [...playersByUser.values()].some(
    (player) => player.room === gameId,
  );

  if (!hasPlayers && game.status === "finished") {
    deleteGame(gameId);
  }
}

/* =========================================================
SOCKET REGISTRATION
========================================================= */

function registerGameSockets(io, adminNamespace, socket) {
  const player = getOrCreatePlayer(socket);

  if (player.socketId && player.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(player.socketId);

    oldSocket?.disconnect(true);
  }

  player.socketId = socket.id;

  players.set(socket.id, player);

  /* =====================================================
     JOIN ROOM
  ===================================================== */

  socket.on("joinRoom", (gameId, callback) => {
    const game = getGame(gameId);

    if (!game) {
      return callback?.({
        success: false,
        message: "Game not found",
      });
    }

    socket.join(gameId);

    player.room = gameId;

    const playersList = Array.isArray(game.players) ? [...game.players] : [];

    if (!playersList.includes(player.userId)) {
      playersList.push(player.userId);
    }

    updateGame(gameId, {
      players: playersList,
    });

    socket.emit("init", {
      self: player,
      players: [...playersByUser.values()].filter((p) => p.room === gameId),
    });

    if (game.status === "started") {
      socket.emit("game:event", {
        type: "GAME_STARTED",
        gameId,
        pot: game.pot,
        enemies: game.enemies,
        status: game.status,
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
      enemies: game.enemies,
    });
  });

  /* =====================================================
     CREATE GAME BET
  ===================================================== */

  socket.on("game:create", async ({ gameId, hostId, betAmount }, callback) => {
    try {
      if (!gameId || !hostId || !betAmount) {
        return callback?.({
          success: false,
          message: "Invalid game data",
        });
      }

      const amount = Number(betAmount);

      await processGameCoins({
        gameId,
        action: "ADD_TO_POT",
        amount,
      });

      let game = getGame(gameId);

      if (!game) {
        game = createGame({
          id: gameId,
          hostId,
          username: player.username,
          amount,
          pot: amount * 2,
          numEnemies: 0,
          enemies: [],
        });
      }

      const playerBets = {
        ...(game.playerBets || {}),
        [player.userId]: amount,
      };

      updateGame(gameId, {
        hostId,
        playerBets,
        pot: amount * 2,
      });

      emitGameEvent(io, adminNamespace, gameId, {
        type: "PLAYER_BET",
        userId: player.userId,
        username: player.username,
        betAmount: amount,
        newPot: amount * 2,
      });

      callback?.({
        success: true,
        gameId,
        pot: amount * 2,
      });
    } catch (error) {
      console.error("[game:create]", error);

      callback?.({
        success: false,
        message: error.message,
      });
    }
  });

  /* =====================================================
     CONFIGURE ENEMIES
  ===================================================== */

  socket.on("host:configureEnemies", ({ gameId, numEnemies }, callback) => {
    const game = getGame(gameId);

    if (!game) {
      return callback?.({
        success: false,
        message: "Game not found",
      });
    }

    if (player.userId !== game.hostId) {
      return callback?.({
        success: false,
        message: "Only host can configure enemies",
      });
    }

    const count = Number(numEnemies);

    if (!Number.isInteger(count) || count <= 0) {
      return callback?.({
        success: false,
        message: "Invalid enemy count",
      });
    }

    const enemies = Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2;

      return {
        enemyId: crypto.randomUUID(),
        enemyNo: index + 1,
        name: `Enemy ${index + 1}`,
        health: 100,
        maxHealth: 100,
        alive: true,
        defeated: false,
        position: {
          x: Math.cos(angle) * 12,
          y: 0,
          z: Math.sin(angle) * 12,
        },
      };
    });

    updateGame(gameId, {
      numEnemies: count,
      enemies,
    });

    emitGameEvent(io, adminNamespace, gameId, {
      type: "ENEMIES_CONFIGURED",
      enemies,
    });

    callback?.({
      success: true,
      enemies,
    });
  });

  /* =====================================================
     ADD TO POT
  ===================================================== */

  socket.on("host:addToPot", async ({ gameId, amount }, callback) => {
    try {
      const game = getGame(gameId);

      if (!game) {
        return callback?.({
          success: false,
          message: "Game not found",
        });
      }

      if (player.userId !== game.hostId) {
        return callback?.({
          success: false,
          message: "Only host can add to pot",
        });
      }

      amount = Number(amount);

      if (!Number.isFinite(amount) || amount <= 0) {
        return callback?.({
          success: false,
          message: "Invalid amount",
        });
      }

      await processGameCoins({
        gameId,
        action: "MATCH_BET",
        amount,
      });

      // Increase game pot
      const newPot = Number(game.pot || 0) + amount;

      updateGame(gameId, {
        pot: newPot,
      });

      emitGameEvent(io, adminNamespace, gameId, {
        type: "ADMIN_ADD_POT",
        amount,
        newPot,
      });

      callback?.({
        success: true,
        newPot,
      });

      callback?.({
        success: true,
        newPot,
      });
    } catch (error) {
      console.error("[host:addToPot]", error);

      callback?.({
        success: false,
        message: error.message || "Failed to add to pot",
      });
    }
  });

  /* =====================================================
     START GAME
  ===================================================== */

  socket.on("host:startGame", ({ gameId }, callback) => {
    const game = getGame(gameId);

    if (!game) {
      return callback?.({
        success: false,
        message: "Game not found",
      });
    }

    if (player.userId !== game.hostId) {
      return callback?.({
        success: false,
        message: "Only host can start game",
      });
    }

    if (game.status === "finished") {
      return callback?.({
        success: false,
        message: "Game already finished",
      });
    }

    if (game.status === "started") {
      return callback?.({
        success: false,
        message: "Game already started",
      });
    }

    if (!game.enemies?.length) {
      return callback?.({
        success: false,
        message: "Enemies not configured",
      });
    }

    updateGame(gameId, {
      status: "started",
      startedAt: Date.now(),
    });

    const updated = getGame(gameId);

    emitGameEvent(io, adminNamespace, gameId, {
      type: "GAME_STARTED",
      pot: updated.pot,
      enemies: updated.enemies,
      status: updated.status,
    });

    callback?.({
      success: true,
      status: updated.status,
      pot: updated.pot,
      enemies: updated.enemies,
    });
  });

  // socket.on("FinishGame", ({ gameId }, callback) => {

  socket.on("game:finished", async ({ gameId, reason }, ack) => {
    try {
      const game = getGame(gameId);

      if (!game) {
        return ack?.({
          success: false,
          message: "Game not found.",
        });
      }

      // Prevent duplicate processing
      if (game.status === "finished") {
        return ack?.({
          success: false,
          message: "Game already finished.",
        });
      }

      // Don't pay cancelled games
      if (game.status === "cancelled") {
        return ack?.({
          success: false,
          message: "Game was cancelled.",
        });
      }

      const pot = Number(game.pot || 0);

      let result;
      let winnerId = null;
      let creditedTo = "ADMIN";

      switch (reason) {
        case "allEnemiesDead":
          result = "won";
          winnerId = game.hostId;
          creditedTo = String(game.hostId);

          await processGameCoins({
            gameId,
            action: "PLAYER_WIN",
            amount: pot,
            playerId: game.hostId,
          });

          updateGame(gameId, {
            status: "finished",
            winnerId: game.hostId,
            finishedAt: Date.now(),
          });

          break;

        case "playerDied":
          result = "lost";

          await processGameCoins({
            gameId,
            action: "PLAYER_LOST",
            amount: pot,
          });

          updateGame(gameId, {
            status: "finished",
            winnerId: null,
            finishedAt: Date.now(),
          });

          break;

        default:
          return ack?.({
            success: false,
            message: "Invalid game result.",
          });
      }

      const finishedGame = getGame(gameId);

      emitGameEvent(io, adminNamespace, gameId, {
        type: "GAME_RESULT",
        result,
        winner: winnerId,
        pot: finishedGame.pot,
        creditedTo,
        finishedAt: finishedGame.finishedAt,
      });

      ack?.({
        success: true,
        result,
        winner: winnerId,
        pot: finishedGame.pot,
      });
    } catch (err) {
      console.error("[game:finished]", err);

      ack?.({
        success: false,
        message: err.message,
      });
    }
  });

  /* =====================================================
     DISCONNECT
  ===================================================== */

  socket.on("disconnect", async () => {
    const p = players.get(socket.id);

    if (!p) return;

    players.delete(socket.id);

    if (p.room) {
      const game = games.get(p.room);

      if (game && game.status !== "FINISHED") {
        game.status = "CANCELLED";

        emitGameEvent(io, adminNamespace, p.room, {
          type: "GAME_CANCELLED",
          reason: "PLAYER_DISCONNECTED",
          userId: p.userId,
          username: p.username,
        });

        io.to(p.room).emit("game:event", {
          type: "GAME_CANCELLED",
          reason: "PLAYER_DISCONNECTED",
        });

        // Remove the game so no payout can occur later
        games.delete(p.room);
      }

      emitGameEvent(io, adminNamespace, p.room, {
        type: "PLAYER_DISCONNECTED",
        userId: p.userId,
        username: p.username,
      });

      cleanupGameIfEmpty(p.room);
    }

    emitTacticalUpdate(io);
  });
}

module.exports = {
  registerGameSockets,
};
