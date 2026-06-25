const {
players,
playersByUser,
getOrCreatePlayer,
} = require("./gameState");

const {
getGame,
createGame,
updateGame,
deleteGame,
} = require("../gameStore");

/* =========================================================
EMITTERS
========================================================= */

const emitTacticalUpdate = (io) => {
const data = [...playersByUser.values()]
.filter((player) => player.room)
.map((player) => ({
userId: player.userId,
username: player.username,
position: player.position,
health: player.health,
room: player.room,
}));

io.emit("tacticalUpdate", {
players: data,
});
};

const emitGameEvent = (
io,
adminNamespace,
gameId,
payload
) => {
if (!gameId) return;

const event = {
...payload,
gameId,
timestamp: Date.now(),
};

io.to(gameId).emit("game:event", event);

adminNamespace.emit(
"game:event",
event
);
};

const emitActivity = (
adminNamespace,
payload
) => {
adminNamespace.emit(
"activity:event",
{
...payload,
timestamp: Date.now(),
}
);
};

/* =========================================================
HELPERS
========================================================= */

function ensureGame(gameId) {
let game = getGame(gameId);

if (!game) {
game = createGame({
id: gameId,


  hostId: null,
  username: null,

  amount: 0,
  pot: 0,

  numEnemies: 0,
  enemies: [],
});


}

return game;
}

function cleanupGameIfEmpty(gameId) {
const game = getGame(gameId);

if (!game) return;

const hasPlayers = [...playersByUser.values()].some(
(player) => player.room === gameId
);

if (
!hasPlayers &&
game.status === "finished"
) {
deleteGame(gameId);
}
}

/* =========================================================
SOCKET REGISTRATION
========================================================= */

function registerGameSockets(
io,
adminNamespace,
socket
) {
const player =
getOrCreatePlayer(socket);

if (
player.socketId &&
player.socketId !== socket.id
) {
const oldSocket =
io.sockets.sockets.get(
player.socketId
);

```
oldSocket?.disconnect(true);
```

}

player.socketId = socket.id;

players.set(socket.id, player);

/* =====================================================
JOIN ROOM
===================================================== */

socket.on(
"joinRoom",
(gameId, callback) => {
if (!gameId) {
return callback?.({
success: false,
message: "Missing gameId",
});
}


  const game = ensureGame(gameId);

  socket.join(gameId);

  player.room = gameId;

  if (
    !game.players.includes(
      player.userId
    )
  ) {
    game.players.push(
      player.userId
    );
  }

  if (!game.hostId) {
    game.hostId =
      player.userId;
  }

  updateGame(gameId, {
    players: game.players,
    hostId: game.hostId,
  });

  socket.emit("init", {
    self: player,
    players: [
      ...playersByUser.values(),
    ].filter(
      (p) => p.room === gameId
    ),
  });

  if (
    game.status === "started"
  ) {
    socket.emit(
      "game:event",
      {
        type: "GAME_STARTED",
        gameId,
        pot: game.pot,
        enemies:
          game.enemies,
        status:
          game.status,
      }
    );
  }

  emitGameEvent(
    io,
    adminNamespace,
    gameId,
    {
      type:
        "PLAYER_JOINED",
      userId:
        player.userId,
      username:
        player.username,
    }
  );

  emitActivity(
    adminNamespace,
    {
      type:
        "PLAYER_JOINED",
      userId:
        player.userId,
      username:
        player.username,
      room: gameId,
    }
  );

  emitTacticalUpdate(io);

  callback?.({
    success: true,
    joined: true,
    gameStatus:
      game.status,
    pot: game.pot,
    enemies:
      game.enemies,
  });
}


);

/* =====================================================
CREATE GAME BET
===================================================== */

socket.on(
"game:create",
(
{
gameId,
hostId,
betAmount,
},
callback
) => {
if (
!gameId ||
!hostId ||
!betAmount
) {
return callback?.({
success: false,
message:
"Invalid game data",
});
}


  const game =
    ensureGame(gameId);

  const playerBets = {
    ...(game.playerBets ||
      {}),
    [player.userId]:
      Number(
        betAmount
      ),
  };

  const newPot =
    Number(game.pot || 0) +
    Number(betAmount);

  updateGame(gameId, {
    hostId,
    pot: newPot,
    playerBets,
  });

  emitGameEvent(
    io,
    adminNamespace,
    gameId,
    {
      type: "PLAYER_BET",
      userId:
        player.userId,
      username:
        player.username,
      betAmount:
        Number(
          betAmount
        ),
      newPot,
    }
  );

  callback?.({
    success: true,
    gameId,
    pot: newPot,
  });
}


);

/* =====================================================
CONFIGURE ENEMIES
===================================================== */

socket.on(
"host:configureEnemies",
(
{
gameId,
numEnemies,
},
callback
) => {
const game =
ensureGame(gameId);


  if (
    player.userId !==
    game.hostId
  ) {
    return callback?.({
      success: false,
      message:
        "Only host can configure enemies",
    });
  }

  const count =
    Number(numEnemies);

  if (count <= 0) {
    return callback?.({
      success: false,
      message:
        "Invalid enemy count",
    });
  }

  const enemies =
    Array.from(
      {
        length: count,
      },
      (_, index) => {
        const angle =
          (index /
            count) *
          Math.PI *
          2;

        return {
          id: `enemy_${
            index + 1
          }`,
          name: `Enemy ${
            index + 1
          }`,
          health: 100,
          alive: true,

          position: {
            x:
              Math.cos(
                angle
              ) * 12,
            y: 0,
            z:
              Math.sin(
                angle
              ) * 12,
          },
        };
      }
    );

  updateGame(gameId, {
    numEnemies: count,
    enemies,
  });

  emitGameEvent(
    io,
    adminNamespace,
    gameId,
    {
      type:
        "ENEMIES_CONFIGURED",
      enemies,
    }
  );

  callback?.({
    success: true,
    enemies,
  });
}


);

/* =====================================================
ADD TO POT
===================================================== */

socket.on(
"host:addToPot",
(
{
gameId,
amount,
},
callback
) => {
const game =
ensureGame(gameId);


  if (
    player.userId !==
    game.hostId
  ) {
    return callback?.({
      success: false,
      message:
        "Only host can add to pot",
    });
  }

  const newPot =
    Number(game.pot || 0) +
    Number(amount || 0);

  updateGame(gameId, {
    pot: newPot,
  });

  emitGameEvent(
    io,
    adminNamespace,
    gameId,
    {
      type:
        "ADMIN_ADD_POT",
      amount,
      newPot,
    }
  );

  callback?.({
    success: true,
    newPot,
  });
}


);

/* =====================================================
START GAME
===================================================== */

socket.on(
"host:startGame",
(
{ gameId },
callback
) => {
const game =
ensureGame(gameId);


  if (
    player.userId !==
    game.hostId
  ) {
    return callback?.({
      success: false,
      message:
        "Only host can start game",
    });
  }

  if (
    !game.enemies?.length
  ) {
    return callback?.({
      success: false,
      message:
        "Enemies not configured",
    });
  }

  if (
    game.status ===
    "started"
  ) {
    return callback?.({
      success: false,
      message:
        "Game already started",
    });
  }

  updateGame(gameId, {
    status: "started",
    startedAt:
      Date.now(),
  });

  const updated =
    getGame(gameId);

  emitGameEvent(
    io,
    adminNamespace,
    gameId,
    {
      type:
        "GAME_STARTED",
      pot:
        updated.pot,
      enemies:
        updated.enemies,
      status:
        updated.status,
    }
  );

  callback?.({
    success: true,
    status:
      updated.status,
    pot:
      updated.pot,
    enemies:
      updated.enemies,
  });
}


);

/* =====================================================
DISCONNECT
===================================================== */

socket.on(
"disconnect",
() => {
const p =
players.get(
socket.id
);


  if (!p) return;

  players.delete(
    socket.id
  );

  if (p.room) {
    emitGameEvent(
      io,
      adminNamespace,
      p.room,
      {
        type:
          "PLAYER_DISCONNECTED",
        userId:
          p.userId,
        username:
          p.username,
      }
    );

    cleanupGameIfEmpty(
      p.room
    );
  }

  emitTacticalUpdate(io);
}


);
}

module.exports = {
registerGameSockets,
};
