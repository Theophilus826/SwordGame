// services/gameCoinService.js

const User = require("../models/UserModels");
const { updateCoins } = require("./AccountController");

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

  const actions = {
    MATCH_BET: {
      userId: admin._id,
      amount: -amount,
      type: "GAME_POT",
      description: `Matched bet for game ${gameId}`,
    },

    ADD_TO_POT: {
      userId: admin._id,
      amount: -amount,
      type: "GAME_POT",
      description: `Added ${amount} coins to game ${gameId}`,
    },

    PLAYER_WIN: {
      userId: playerId,
      amount,
      type: "GAME_WIN",
      description: `Won game ${gameId}`,
    },

    PLAYER_LOST: {
      userId: admin._id,
      amount,
      type: "GAME_RETURN",
      description: `Returned pot from game ${gameId}`,
    },

    GAME_CANCELLED: {
      userId: admin._id,
      amount,
      type: "GAME_RETURN",
      description: `Returned pot from game ${gameId}`,
    },
  };

  const transaction = actions[action];

  if (!transaction) {
    throw new Error(`Unknown game action: ${action}`);
  }

  if (
    transaction.userId === undefined ||
    transaction.userId === null
  ) {
    throw new Error(`Missing userId for action: ${action}`);
  }

  return updateCoins(transaction);
}

module.exports = {
  processGameCoins,
};
