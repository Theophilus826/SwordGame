// services/gameCoinService.js

const User = require("../models/UserModels");
const { updateCoins } = require("../controller/AccountController");

async function processGameCoins({
  gameId,
  action,
  amount = 0,
  playerId,
}) {
  const admin = await User.findOne({ isAdmin: true });

  if (!admin) {
    throw new Error("Admin account not found");
  }

  switch (action) {
    case "MATCH_BET":
      return updateCoins({
        userId: admin._id,
        amount: -amount,
        type: "GAME_POT",
        description: `Matched bet for game ${gameId}`,
      });

    case "ADD_TO_POT":
      return updateCoins({
        userId: admin._id,
        amount: -amount,
        type: "GAME_POT",
        description: `Added ${amount} coins to game ${gameId}`,
      });

    case "PLAYER_WIN":
      if (!playerId) {
        throw new Error("Missing playerId for PLAYER_WIN");
      }

      // Debit admin
      await updateCoins({
        userId: admin._id,
        amount: -amount,
        type: "GAME_PAYOUT",
        description: `Paid winner for game ${gameId}`,
      });

      // Credit player
      return updateCoins({
        userId: playerId,
        amount,
        type: "GAME_WIN",
        description: `Won game ${gameId}`,
      });

    case "PLAYER_LOST":
      return updateCoins({
        userId: admin._id,
        amount,
        type: "GAME_RETURN",
        description: `Player lost game ${gameId}`,
      });

    case "GAME_CANCELLED":
      return updateCoins({
        userId: admin._id,
        amount,
        type: "GAME_RETURN",
        description: `Game ${gameId} was cancelled`,
      });

    default:
      throw new Error(`Unknown game action: ${action}`);
  }
}

module.exports = {
  processGameCoins,
};
