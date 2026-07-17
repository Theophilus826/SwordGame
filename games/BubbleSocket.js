const BubbleGame = require("../models/BubbleGame");
const { processGameCoins } = require("../config/gameCoinService");
const startTimer = require("../games/BubbleTimer");

const sessions = new Map();

function registerBubbleSockets(io, socket) {
  console.log(`🟢 Bubble Player Connected: ${socket.id}`);

  //--------------------------------------------------------
  // JOIN GAME
  //--------------------------------------------------------
  socket.on("joinGame", async (gameId) => {
    try {
      console.log(`🎮 joinGame: ${gameId}`);

      const game = await BubbleGame.findById(gameId);

      if (!game) {
        return socket.emit("bubble:error", {
          message: "Game not found",
        });
      }

      if (game.status === "Finished") {
        return socket.emit("bubble:error", {
          message: "Game already finished",
        });
      }

      if (sessions.has(socket.id)) {
        return;
      }

      const alreadyJoined =
        socket.user &&
        game.players.some(
          (id) => id.toString() === socket.user._id.toString()
        );

      if (!alreadyJoined && game.players.length >= game.maxPlayers) {
        return socket.emit("bubble:error", {
          message: "Game is full",
        });
      }

      if (!alreadyJoined && socket.user) {
        game.players.push(socket.user._id);

        await processGameCoins({
          gameId: game._id,
          action: "ADD_TO_POT",
          amount: game.coin,
        });
      }

      if (game.status === "Waiting") {
        game.status = "Playing";
      }

      await game.save();

      await socket.join(gameId);

      const session = {
        socketId: socket.id,
        gameId,
        timer: null,
        timeRemaining: game.timeLimit,
      };

      sessions.set(socket.id, session);

      const payload = {
        gameId: game._id.toString(),
        playerId: socket.user?._id?.toString(),
        targetScore: game.scoreTarget,
        turnsBeforeShift: game.turnsBeforeShift,
        timeLimit: game.timeLimit,
        level: game.level,
        status: game.status,
      };

      // Start game for joining player
      socket.emit("gameStarted", payload);

      socket.emit("gameConfig", {
        targetScore: game.scoreTarget,
        turnsBeforeShift: game.turnsBeforeShift,
        timeLimit: game.timeLimit,
        level: game.level,
      });

      // Notify others
      socket.to(gameId).emit("gameStarted", payload);

      io.to(gameId).emit("bubble:playerJoined", {
        gameId,
        playerId: socket.user?._id,
      });

      io.emit("bubble:updated", game);

      startTimer(io, socket, session, sessions);

      console.log(`✅ Bubble player joined ${gameId}`);
    } catch (err) {
      console.error(err);

      socket.emit("bubble:error", {
        message: err.message,
      });
    }
  });

  //--------------------------------------------------------
  // RESTART GAME
  //--------------------------------------------------------
  socket.on("restartGame", async () => {
    try {
      const session = sessions.get(socket.id);

      if (!session) return;

      const game = await BubbleGame.findById(session.gameId);

      if (!game) return;

      if (session.timer) {
        clearInterval(session.timer);
      }

      session.timeRemaining = game.timeLimit;

      socket.emit("gameConfig", {
        targetScore: game.scoreTarget,
        turnsBeforeShift: game.turnsBeforeShift,
        timeLimit: game.timeLimit,
        level: game.level,
      });

      startTimer(io, socket, session, sessions);
    } catch (err) {
      console.error(err);
    }
  });

  //--------------------------------------------------------
  // GAME RESULT
  //--------------------------------------------------------
  socket.on("gameResult", async (result) => {
    try {
      const session = sessions.get(socket.id);

      if (!session) return;

      const game = await BubbleGame.findById(session.gameId);

      if (!game) return;

      if (game.status === "Finished") return;

      if (result.win && socket.user) {
        game.winner = socket.user._id;

        await processGameCoins({
          gameId: game._id,
          action: "PLAYER_WIN",
          amount: game.coin,
          playerId: socket.user._id,
        });
      } else {
        await processGameCoins({
          gameId: game._id,
          action: "PLAYER_LOST",
          amount: game.coin,
        });
      }

      game.status = "Finished";
      game.endedAt = new Date();

      await game.save();

      if (session.timer) {
        clearInterval(session.timer);
      }

      sessions.delete(socket.id);

      io.to(session.gameId).emit("gameFinished", {
        winner: game.winner,
        status: game.status,
      });

      io.emit("bubble:updated", game);
    } catch (err) {
      console.error(err);

      socket.emit("bubble:error", {
        message: err.message,
      });
    }
  });

  //--------------------------------------------------------
  // DISCONNECT
  //--------------------------------------------------------
  socket.on("disconnect", async () => {
    try {
      const session = sessions.get(socket.id);

      if (!session) {
        console.log(`🔴 Bubble disconnected: ${socket.id}`);
        return;
      }

      if (session.timer) {
        clearInterval(session.timer);
      }

      const game = await BubbleGame.findById(session.gameId);

      if (game) {
        if (socket.user) {
          game.players.pull(socket.user._id);
        }

        if (game.status !== "Finished") {
          await processGameCoins({
            gameId: game._id,
            action: "PLAYER_LOST",
            amount: game.coin,
          });

          game.status = "Finished";
          game.endedAt = new Date();

          await game.save();
        }

        io.emit("bubble:updated", game);

        io.to(session.gameId).emit("bubble:playerLeft", {
          gameId: session.gameId,
          playerId: socket.user?._id,
        });

        io.to(session.gameId).emit("gameFinished", {
          winner: null,
          status: "Finished",
          reason: "PLAYER_DISCONNECTED",
        });
      }

      sessions.delete(socket.id);

      console.log(`🔴 Bubble Player Disconnected: ${socket.id}`);
    } catch (err) {
      console.error(err);
    }
  });
}

module.exports = {
  registerBubbleSockets,
};
