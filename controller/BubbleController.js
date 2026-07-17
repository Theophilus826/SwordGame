const BubbleGame = require("../models/BubbleGame");

//--------------------------------------------------------
// GET ALL ACTIVE GAMES
//--------------------------------------------------------

const getGames = async (req, res) => {
  try {
    const games = await BubbleGame.find({
      status: { $ne: "Finished" },
    })
      .populate("host", "name")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      games,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

//--------------------------------------------------------
// GET SINGLE GAME
//--------------------------------------------------------

const getGame = async (req, res) => {
  try {
    const game = await BubbleGame.findById(req.params.id)
      .populate("host", "name")
      .populate("players", "name");

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    res.json({
      success: true,
      game,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

//--------------------------------------------------------
// CREATE GAME
//--------------------------------------------------------

const createGame = async (req, res) => {
  try {
    const game = await BubbleGame.create({
      ...req.body,
      host: req.user._id,
      status: "Waiting",
      players: [],
    });

    // Notify all clients
    req.io.emit("bubble:created", game);

    res.status(201).json({
      success: true,
      game,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

//--------------------------------------------------------
// VALIDATE JOIN
//--------------------------------------------------------

const joinGame = async (req, res) => {
  try {
    const game = await BubbleGame.findById(req.params.id)
      .populate("host", "name")
      .populate("players", "name");

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    if (game.status === "Finished") {
      return res.status(400).json({
        success: false,
        message: "Game has already finished",
      });
    }

    const alreadyJoined = game.players.some(
      (player) => player._id.toString() === req.user._id.toString()
    );

    if (!alreadyJoined && game.players.length >= game.maxPlayers) {
      return res.status(400).json({
        success: false,
        message: "Game is full",
      });
    }

    // Socket.IO handles the actual join.

    res.json({
      success: true,
      message: "Ready to join game",
      game,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

//--------------------------------------------------------
// REMOVE GAME
//--------------------------------------------------------

const removeGame = async (req, res) => {
  try {
    const game = await BubbleGame.findById(req.params.id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    await game.deleteOne();

    req.io.emit("bubble:removed", game._id);

    res.json({
      success: true,
      message: "Game removed",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createGame,
  joinGame,
  getGames,
  getGame,
  removeGame,
};
