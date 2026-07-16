const BubbleGame = require("../models/BubbleGame");
const { processGameCoins } = require("../config/gameCoinService");
const sessions = new Map();
let io = null;

//--------------------------------------------------------
// Initialize Socket.IO
//--------------------------------------------------------

const initializeBubble = (socketIO) => {
  io = socketIO;
};

//--------------------------------------------------------
// Socket Connection
//--------------------------------------------------------

const connect = (socket) => {
  console.log(`🟢 Bubble Player Connected: ${socket.id}`);

  //--------------------------------------------------------
  // Join Hosted Game
  //--------------------------------------------------------

  socket.on("joinGame", async (gameId) => {
    try {
      const game = await BubbleGame.findById(gameId);

      if (!game) {
        return socket.emit("error", "Game not found");
      }

      if (game.status === "Finished") {
        return socket.emit("error", "Game already finished");
      }

      if (game.players.length >= game.maxPlayers) {
        return socket.emit("error", "Game is full");
      }

      // Prevent duplicate socket session
      if (sessions.has(socket.id)) {
        return;
      }

      // Add player if not already in game
      if (socket.user) {
        const joined = game.players.some(
          (id) => id.toString() === socket.user._id.toString(),
        );

        if (!joined) {
          game.players.push(socket.user._id);

          // Debit admin and add coins to the game pot
          await processGameCoins({
            gameId: game._id,
            action: "ADD_TO_POT",
            amount: game.coin, // or game.betAmount
          });
        }
      }

      if (game.status === "Waiting") {
        game.status = "Playing";
      }

      await game.save();

      socket.join(gameId);

      const session = {
        socketId: socket.id,
        gameId,
        timer: null,
        timeRemaining: game.timeLimit,
      };

      sessions.set(socket.id, session);

      // Send game configuration
      socket.emit("gameConfig", {
        targetScore: game.scoreTarget,
        turnsBeforeShift: game.turnsBeforeShift,
        timeLimit: game.timeLimit,
        level: game.level,
      });

      // Notify clients that the game has officially started
      io.to(gameId).emit("gameStarted", {
        gameId: game._id,
        playerId: socket.user?._id,
        targetScore: game.scoreTarget,
        turnsBeforeShift: game.turnsBeforeShift,
        timeLimit: game.timeLimit,
        level: game.level,
        status: game.status,
      });

      // Start timer after gameStarted event
      startTimer(socket, session);

      io.to(gameId).emit("bubble:playerJoined", {
        socketId: socket.id,
        playerId: socket.user?._id,
        gameId,
      });

      io.emit("bubble:updated", game);
    } catch (err) {
      console.error(err);
      socket.emit("error", err.message);
    }
  });

  //--------------------------------------------------------
  // Restart
  //--------------------------------------------------------

  socket.on("restartGame", async () => {
    const session = sessions.get(socket.id);

    if (!session) return;

    const game = await BubbleGame.findById(session.gameId);

    if (!game) return;

    if (session.timer) clearInterval(session.timer);

    session.timeRemaining = game.timeLimit;

    socket.emit("gameConfig", {
      targetScore: game.scoreTarget,
      turnsBeforeShift: game.turnsBeforeShift,
      timeLimit: game.timeLimit,
      level: game.level,
    });

    startTimer(socket, session);
  });

  //--------------------------------------------------------
  // Game Result
  //--------------------------------------------------------

  socket.on("gameResult", async (result) => {
    try {
      const session = sessions.get(socket.id);

      if (!session) return;

      const game = await BubbleGame.findById(session.gameId);

      if (!game) return;

      // Prevent duplicate processing
      if (game.status === "Finished") return;

      if (result.win && socket.user) {
        game.winner = socket.user._id;

        await processGameCoins({
          gameId: game._id,
          action: "PLAYER_WIN",
          amount: game.coin, // or game.betAmount
          playerId: socket.user._id,
        });
      } else {
        await processGameCoins({
          gameId: game._id,
          action: "PLAYER_LOST",
          amount: game.coin, // or game.betAmount
        });
      }

      game.status = "Finished";
      game.endedAt = new Date();

      await game.save();

      io.to(session.gameId).emit("gameFinished", {
        winner: game.winner,
        status: game.status,
      });

      io.emit("bubble:updated", game);
    } catch (err) {
      console.error(err);
      socket.emit("error", err.message);
    }
  });

  //--------------------------------------------------------
  // Disconnect
  //--------------------------------------------------------

  socket.on("disconnect", async () => {
    try {
      const session = sessions.get(socket.id);

      if (!session) return;

      if (session.timer) {
        clearInterval(session.timer);
      }

      const game = await BubbleGame.findById(session.gameId);

      if (game) {
        // Remove player from the game
        if (socket.user) {
          game.players.pull(socket.user._id);
        }

        // If game is still active, disconnect counts as a loss
        if (game.status !== "Finished") {
          await processGameCoins({
            gameId: game._id,
            action: "PLAYER_LOST",
            amount: game.coin, // or game.betAmount
          });

          game.status = "Finished";
          game.endedAt = new Date();
        }

        await game.save();

        io.emit("bubble:updated", game);
      }

      sessions.delete(socket.id);

      io.to(session.gameId).emit("bubble:playerLeft", {
        gameId: session.gameId,
        playerId: socket.user?._id,
      });

      console.log(`🔴 Bubble Player Disconnected: ${socket.id}`);
    } catch (err) {
      console.error(err);
    }
  });
};

//--------------------------------------------------------
// Timer
//--------------------------------------------------------

function startTimer(socket, session) {
  session.timer = setInterval(async () => {
    session.timeRemaining--;

    socket.emit("timer", session.timeRemaining);

    if (session.timeRemaining <= 0) {
      clearInterval(session.timer);

      try {
        const game = await BubbleGame.findById(session.gameId);

        if (!game) return;

        // Prevent duplicate processing
        if (game.status === "Finished") return;

        // Time out counts as a loss
        await processGameCoins({
          gameId: game._id,
          action: "PLAYER_LOST",
          amount: game.coin, // or game.betAmount
        });

        game.status = "Finished";
        game.endedAt = new Date();

        await game.save();

        sessions.delete(socket.id);

        io.to(session.gameId).emit("timeUp");

        io.to(session.gameId).emit("gameFinished", {
          winner: null,
          status: game.status,
          reason: "TIME_UP",
        });

        io.emit("bubble:updated", game);
      } catch (err) {
        console.error(err);
      }
    }
  }, 1000);
}

//--------------------------------------------------------
// REST API
//--------------------------------------------------------

const getGames = async (req, res) => {
  const games = await BubbleGame.find({
    status: { $ne: "Finished" },
  })
    .populate("host", "name")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    games,
  });
};

const getGame = async (req, res) => {
  const game = await BubbleGame.findById(req.params.id).populate(
    "host",
    "name",
  );

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
};

const createGame = async (req, res) => {
  const game = await BubbleGame.create({
    ...req.body,
    host: req.user._id,
    status: "Waiting",
    players: [],
  });

  io.emit("bubble:created", game);

  res.status(201).json({
    success: true,
    game,
  });
};

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

    // Do NOT modify the game here.
    // Socket.IO will handle:
    // - adding the player
    // - changing status
    // - starting the timer
    // - emitting gameStarted

    return res.status(200).json({
      success: true,
      message: "Ready to join game",
      game,
    });
  } catch (err) {
    console.error("Join game error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

const removeGame = async (req, res) => {
  const game = await BubbleGame.findById(req.params.id);

  if (!game) {
    return res.status(404).json({
      success: false,
      message: "Game not found",
    });
  }

  await game.deleteOne();

  io.emit("bubble:removed", game._id);

  res.json({
    success: true,
    message: "Game removed",
  });
};

module.exports = {
  initializeBubble,
  connect,
  createGame,
  joinGame,
  getGames,
  getGame,
  removeGame,
};
