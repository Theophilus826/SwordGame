const BubbleGame = require("../models/BubbleGame");

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

      socket.join(gameId);

      const session = {
        socketId: socket.id,
        gameId,
        timer: null,
        timeRemaining: game.timeLimit,
      };

      sessions.set(socket.id, session);

      socket.emit("gameConfig", {
        targetScore: game.scoreTarget,
        turnsBeforeShift: game.turnsBeforeShift,
        timeLimit: game.timeLimit,
        level: game.level,
      });

      startTimer(socket, session);

      io.to(gameId).emit("bubble:playerJoined", {
        socketId: socket.id,
        gameId,
      });
    } catch (err) {
      console.error(err);
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

      if (result.win && socket.user) {
        game.winner = socket.user._id;
      }

      game.status = "Finished";
      game.endedAt = new Date();

      await game.save();

      io.emit("bubble:updated", game);
    } catch (err) {
      console.error(err);
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

      if (socket.user) {
        await BubbleGame.findByIdAndUpdate(session.gameId, {
          $pull: {
            players: socket.user._id,
          },
        });
      }

      sessions.delete(socket.id);

      io.emit("bubble:playerLeft", {
        gameId: session.gameId,
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

      const game = await BubbleGame.findById(session.gameId);

      if (!game) return;

      game.status = "Finished";
      game.endedAt = new Date();

      await game.save();

      io.to(session.gameId).emit("timeUp");

      io.emit("bubble:updated", game);
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
    "name"
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
    const game = await BubbleGame.findById(req.params.id);

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    if (game.status === "Finished") {
      return res.status(400).json({
        success: false,
        message: "Game finished",
      });
    }

    if (game.players.length >= game.maxPlayers) {
      return res.status(400).json({
        success: false,
        message: "Game is full",
      });
    }

    const joined = game.players.some(
      (id) => id.toString() === req.user._id.toString()
    );

    if (!joined) {
      game.players.push(req.user._id);
    }

    if (game.status === "Waiting") {
      game.status = "Playing";
    }

    await game.save();

    io.emit("bubble:updated", game);

    res.json({
      success: true,
      game,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
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
