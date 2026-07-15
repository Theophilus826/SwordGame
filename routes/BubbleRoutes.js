const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/AuthMiddleware"); // adjust the path if needed

const {
  getGames,
  getGame,
  createGame,
  joinGame,
  removeGame,
} = require("../controller/BubbleController");

// Public routes
router.get("/", getGames);
router.get("/:id", getGame);

// Protected routes
router.post("/", protect, createGame);
router.post("/:id/join", protect, joinGame);
router.delete("/:id", protect, removeGame);

module.exports = router;
