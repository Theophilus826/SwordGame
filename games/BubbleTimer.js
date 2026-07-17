const BubbleGame = require("../models/BubbleGame");
const { processGameCoins } = require("../config/gameCoinService");

async function startTimer(io, session, gameSessions) {
  // Prevent duplicate timers
  if (session.timer) {
    clearInterval(session.timer);
  }

  session.timer = setInterval(async () => {
    try {
      session.timeRemaining--;

      // Broadcast timer to everyone in the room
      io.to(session.gameId).emit("timer", {
        timeRemaining: session.timeRemaining,
      });

      if (session.timeRemaining > 0) {
        return;
      }

      clearInterval(session.timer);
      session.timer = null;

      const game = await BubbleGame.findById(session.gameId);

      if (!game) {
        gameSessions.delete(session.gameId);
        return;
      }

      // Someone already finished the game
      if (game.status === "Finished") {
        gameSessions.delete(session.gameId);
        return;
      }

      await processGameCoins({
        gameId: game._id,
        action: "PLAYER_LOST",
        amount: game.coin,
      });

      game.status = "Finished";
      game.endedAt = new Date();

      await game.save();

      io.to(session.gameId).emit("timeUp");

      io.to(session.gameId).emit("gameFinished", {
        winner: null,
        status: "Finished",
        reason: "TIME_UP",
      });

      io.emit("bubble:updated", game);

      // Remove game session
      gameSessions.delete(session.gameId);

      console.log(`⏰ Bubble game ${session.gameId} ended by timer.`);
    } catch (err) {
      console.error("Bubble timer error:", err);

      if (session.timer) {
        clearInterval(session.timer);
      }

      gameSessions.delete(session.gameId);
    }
  }, 1000);
}

module.exports = startTimer;
