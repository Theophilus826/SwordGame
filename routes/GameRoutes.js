const express = require("express");
const router = express.Router();
const {
 games,
  createGame,
  configureEnemies,   // ✅ NEW
  startGame,          // ✅ NEW
  getGameState,
  userAttackEnemy,
  finishGameBackend,
  addToPot,
} = require("../controllers/gameController");

router.post("/create", createGame);
router.post("/configure-enemies", configureEnemies);
router.post("/start", startGame);
router.post("/attack", userAttackEnemy);
router.post("/finish", finishGameBackend);
router.post("/add-to-pot", addToPot);
router.get("/:gameId", getGameState);

module.exports = router;
