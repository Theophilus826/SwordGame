const express = require("express");
const router = express.Router();

const {
    getGames,
    getGame,
    restartGame,
    removeGame,
} = require("../controller/BubbleController");

router.get("/", getGames);
router.get("/:socketId", getGame);
router.post("/:socketId/restart", restartGame);
router.delete("/:socketId", removeGame);

module.exports = router;
