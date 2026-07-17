const BubbleGame = require("../models/BubbleGame");
const { processGameCoins } = require("../config/gameCoinService");
const startTimer = require("../games/BubbleTimer");

const sessions = new Map();

function registerBubbleSockets(io, socket) {
  if (socket.bubbleRegistered) return;

  socket.bubbleRegistered = true;

  console.log("🔥 NEW bubble:join handler", gameId);
  //--------------------------------------------------------
  // JOIN GAME
  //--------------------------------------------------------
  socket.on("bubble:join", (gameId, callback) => {
  console.log("AAAAAAAAAAAAAAAAAAAA");
  console.log(gameId);

  callback?.({
    success: true,
  });
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
  socket.on("gameResult", async (result, callback) => {
    try {
      const session = sessions.get(socket.id);

      if (!session) {
        return callback?.({
          success: false,
          message: "Session not found",
        });
      }

      const game = await BubbleGame.findById(session.gameId);

      if (!game) {
        return callback?.({
          success: false,
          message: "Game not found",
        });
      }

      // Prevent duplicate processing
      if (game.status === "Finished") {
        return callback?.({
          success: true,
          message: "Game already finished",
        });
      }

      // Stop timer immediately
      if (session.timer) {
        clearInterval(session.timer);
        session.timer = null;
      }

      // Winner
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

      sessions.delete(socket.id);

      io.to(session.gameId).emit("gameFinished", {
        winner: game.winner,
        status: game.status,
      });

      io.emit("bubble:updated", game);

      callback?.({
        success: true,
        winner: game.winner,
      });

      console.log(`🏆 Bubble Game ${game._id} finished`);
    } catch (err) {
      console.error(err);

      socket.emit("bubble:error", {
        message: err.message,
      });

      callback?.({
        success: false,
        message: err.message,
      });
    }
  });
  //--------------------------------------------------------
  // DISCONNECT
  //--------------------------------------------------------
  socket.on("disconnect", async (reason) => {
    try {
      console.log(
        `🔴 Bubble disconnected: ${socket.user?.name || socket.id} (${reason})`,
      );

      const session = sessions.get(socket.id);

      if (!session) {
        return;
      }

      // Stop timer
      if (session.timer) {
        clearInterval(session.timer);
      }

      sessions.delete(socket.id);

      const game = await BubbleGame.findById(session.gameId);

      if (!game) {
        return;
      }

      // Remove player from game
      if (socket.user) {
        game.players.pull(socket.user._id);
      }

      // Finish game only if it wasn't already finished
      if (game.status !== "Finished") {
        game.status = "Finished";
        game.endedAt = new Date();

        await processGameCoins({
          gameId: game._id,
          action: "PLAYER_LOST",
          amount: game.coin,
        });

        await game.save();
      }

      // Notify everyone
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

      // Remove listeners
      socket.removeAllListeners("joinGame");
      socket.removeAllListeners("restartGame");
      socket.removeAllListeners("gameResult");

      console.log(`✅ Bubble cleanup complete for ${socket.id}`);
    } catch (err) {
      console.error("Bubble disconnect error:", err);
    }
  });
}

module.exports = {
  registerBubbleSockets,
};
