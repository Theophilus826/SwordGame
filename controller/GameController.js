const { processGameCoins } = require("../config/gameCoinService");

const {
  getGame,
  updateGame,
  finishGame: finishStoredGame,
} = require("../games/gameStore");

const { emitGameEvent } = require("../socket/gameEvents");

const finishGame = async (req, res) => {
  try {
    const { gameId, result } = req.body;

    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!gameId) {
      return res.status(400).json({
        success: false,
        message: "Missing gameId",
      });
    }

    if (!result) {
      return res.status(400).json({
        success: false,
        message: "Missing result",
      });
    }

    const allowedResults = ["won", "lost", "cancelled"];

    if (!allowedResults.includes(result)) {
      return res.status(400).json({
        success: false,
        message: "Result must be 'won', 'lost', or 'cancelled'",
      });
    }

    /* =====================================================
       FIND GAME
    ===================================================== */

    const game = getGame(gameId);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    if (game.status === "finished") {
      return res.status(400).json({
        success: false,
        message: "Game already finished",
      });
    }

    if (game.status === "finishing") {
      return res.status(409).json({
        success: false,
        message: "Game is already being finalized",
      });
    }

    if (game.status !== "started") {
      return res.status(400).json({
        success: false,
        message: "Game has not started",
      });
    }

    /* =====================================================
       AUTHORIZATION
    ===================================================== */

    const requesterId = req.user?.id;

    if (
      requesterId &&
      requesterId !== game.hostId &&
      !req.user?.isAdmin
    ) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    /* =====================================================
       LOCK GAME
    ===================================================== */

    updateGame(gameId, {
      status: "finishing",
    });

    try {
      const pot = Number(game.pot || 0);
      let winner = null;
      let creditedTo = "ADMIN";

      switch (result) {
        case "won":
          winner = game.hostId;
          creditedTo = String(winner);

          await processGameCoins({
            gameId,
            action: "PLAYER_WIN",
            amount: pot,
            playerId: winner,
          });
          break;

        case "lost":
          await processGameCoins({
            gameId,
            action: "PLAYER_LOST",
            amount: pot,
          });
          break;

        case "cancelled":
          await processGameCoins({
            gameId,
            action: "GAME_CANCELLED",
            amount: pot,
          });
          break;
      }

      /* =====================================================
         FINALIZE GAME
      ===================================================== */

      const finishedGame = finishStoredGame(
        gameId,
        result,
        winner
      );

      /* =====================================================
         EMIT SOCKET EVENT
      ===================================================== */

      const io = req.app.get("io");
      const adminNamespace = req.app.get("adminNamespace");

      if (io && adminNamespace) {
        emitGameEvent(io, adminNamespace, gameId, {
          type: "GAME_RESULT",
          result,
          winner,
          pot: finishedGame.pot,
          creditedCoins: pot,
          creditedTo,
          finishedAt: finishedGame.finishedAt,
        });
      }

      /* =====================================================
         RESPONSE
      ===================================================== */

      return res.status(200).json({
        success: true,
        gameId,
        result,
        winner,
        status: finishedGame.status,
        pot: finishedGame.pot,
        creditedCoins: pot,
        creditedTo,
        finishedAt: finishedGame.finishedAt,
      });
    } catch (error) {
      // Unlock game if payout failed
      updateGame(gameId, {
        status: "started",
      });

      throw error;
    }
  } catch (error) {
    console.error("[finishGame]", error);

    return res.status(500).json({
      success: false,
      message: "Failed to finish game",
      error: error.message,
    });
  }
};

module.exports = {
  finishGame,
};
