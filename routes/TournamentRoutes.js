
const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/AuthMiddleware");
const tournamentAuth = require("../middleware/TournamentAuth");

const {
  createTournament,
  getPublicTournaments,
  getTournamentById,
  getMyTournaments,
  updateTournament,
  publishTournament,
  changeTournamentStatus,
  deleteTournament,
} = require("../controller/TournamentController");

// Public routes
router.get("/", getPublicTournaments);
router.get("/:id", getTournamentById);

// Authenticated routes
router.post("/", protect, createTournament);

router.get(
  "/my/managed",
  protect,
  getMyTournaments
);

// Tournament staff routes
router.patch(
  "/:tournamentId/settings",
  protect,
  tournamentAuth("super_admin", "tournament_admin"),
  updateTournament
);

router.patch(
  "/:tournamentId/publish",
  protect,
  tournamentAuth("super_admin"),
  publishTournament
);

router.patch(
  "/:tournamentId/status",
  protect,
  tournamentAuth("super_admin", "tournament_admin"),
  changeTournamentStatus
);

router.delete(
  "/:tournamentId",
  protect,
  tournamentAuth("super_admin"),
  deleteTournament
);

module.exports = router;
