const games = new Map();

/* =========================================================
CREATE GAME
========================================================= */
function createGame({
id,
hostId,
username,
amount,
pot,
numEnemies,
enemies = [],
}) {
if (!id) {
throw new Error("Game id is required");
}

const game = {
id,


hostId,
username,

amount,
pot,

numEnemies,

maxPlayers: 1,
players: [hostId],

status: "waiting",

winner: null,
result: null,

startedAt: null,
finishedAt: null,

enemies,

createdAt: Date.now(),


};

games.set(id, game);

return game;
}

/* =========================================================
GET GAME
========================================================= */
function getGame(gameId) {
return games.get(gameId) || null;
}

/* =========================================================
CHECK GAME EXISTS
========================================================= */
function hasGame(gameId) {
return games.has(gameId);
}

/* =========================================================
UPDATE GAME
========================================================= */
function updateGame(gameId, updates = {}) {
const game = games.get(gameId);

if (!game) {
return null;
}

const updatedGame = {
...game,
...updates,
};

games.set(gameId, updatedGame);

return updatedGame;
}

/* =========================================================
START GAME
========================================================= */
function startGame(gameId) {
return updateGame(gameId, {
status: "started",
startedAt: Date.now(),
});
}

/* =========================================================
ADD TO POT
========================================================= */
function addToPot(gameId, amount) {
const game = getGame(gameId);

if (!game) {
return null;
}

const newPot = Number(game.pot || 0) + Number(amount || 0);

return updateGame(gameId, {
pot: newPot,
});
}

/* =========================================================
DAMAGE ENEMY
========================================================= */
function damageEnemy(gameId, enemyId, damage) {
const game = getGame(gameId);

if (!game) {
return null;
}

const enemies = game.enemies.map((enemy) => {
if (enemy.id !== enemyId) {
return enemy;
}

```
const health = Math.max(
  0,
  enemy.health - damage
);

return {
  ...enemy,
  health,
  alive: health > 0,
};
```

});

return updateGame(gameId, {
enemies,
});
}

/* =========================================================
FINISH GAME
========================================================= */
function finishGame(
gameId,
result,
winner = null
) {
return updateGame(gameId, {
status: "finished",
result,
winner,
finishedAt: Date.now(),
});
}

/* =========================================================
DELETE GAME
========================================================= */
function deleteGame(gameId) {
return games.delete(gameId);
}

/* =========================================================
GET ALL GAMES
========================================================= */
function getAllGames() {
return Array.from(games.values());
}

/* =========================================================
WAITING GAMES
========================================================= */
function getWaitingGames() {
return getAllGames().filter(
(game) => game.status === "waiting"
);
}

/* =========================================================
ACTIVE GAMES
========================================================= */
function getActiveGames() {
return getAllGames().filter(
(game) => game.status === "started"
);
}

/* =========================================================
FINISHED GAMES
========================================================= */
function getFinishedGames() {
return getAllGames().filter(
(game) => game.status === "finished"
);
}

/* =========================================================
CLEANUP FINISHED GAMES
========================================================= */
function cleanupFinishedGames(
maxAgeMs = 1000 * 60 * 60
) {
const now = Date.now();

for (const [gameId, game] of games.entries()) {
if (
game.status === "finished" &&
game.finishedAt &&
now - game.finishedAt > maxAgeMs
) {
games.delete(gameId);
}
}
}

/* =========================================================
EXPORTS
========================================================= */
module.exports = {
games,

createGame,
getGame,
hasGame,
updateGame,

startGame,
addToPot,
damageEnemy,
finishGame,

deleteGame,

getAllGames,
getWaitingGames,
getActiveGames,
getFinishedGames,

cleanupFinishedGames,
};
