const User = require("../models/User");
const { creditCoins } = require("./AccountController");

const {
getGame,
finishGame: finishStoredGame,
} = require("../gameStore");

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

const allowedResults = [
  "won",
  "lost",
  "cancelled",
];

if (!allowedResults.includes(result)) {
  return res.status(400).json({
    success: false,
    message:
      "Result must be 'won', 'lost', or 'cancelled'",
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

let creditedCoins = 0;
let creditedTo = null;
let winner = null;

/* =====================================================
   PLAYER WON
===================================================== */
if (result === "won") {
  await creditCoins({
    userId: game.hostId,
    coins: game.pot,
  });

  creditedCoins = game.pot;
  creditedTo = game.hostId;
  winner = game.hostId;
}

/* =====================================================
   PLAYER LOST / CANCELLED
===================================================== */
else {
  const admin = await User.findOne({
    isAdmin: true,
  });

  if (!admin) {
    return res.status(500).json({
      success: false,
      message: "Admin account not found",
    });
  }

  admin.coins += Number(game.pot || 0);

  await admin.save();

  creditedCoins = game.pot;
  creditedTo = admin._id;
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
   SOCKET EVENT
===================================================== */
emitGameEvent(req, {
  type: "GAME_RESULT",

  gameId,

  result,
  winner,

  pot: finishedGame.pot,

  creditedCoins,
  creditedTo,

  finishedAt: finishedGame.finishedAt,
});

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

  creditedCoins,
  creditedTo,

  finishedAt: finishedGame.finishedAt,
});


} catch (error) {
console.error(
"[finishGame] Error:",
error
);


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
