
const express = require("express");
const router = express.Router();

// ======================================
// CONTROLLERS
// ======================================

const {
  registerTeam,
  getTournamentTeams,
  getTournamentTeamById,
  getMyTournamentTeam,
  approveTournamentTeam,
  rejectTournamentTeam,
  withdrawTournamentTeam,
  removeTournamentTeam,
} = require("../controller/TournamentTeamController");

// ======================================
// MIDDLEWARE
// ======================================

const {protect} = require("../middleware/AuthMiddleware");
const tournamentAuth = require("../middleware/TournamentAuth");

// ======================================
// VALIDATE IMPORTS
// ======================================

const controllers = {
  registerTeam,
  getTournamentTeams,
  getTournamentTeamById,
  getMyTournamentTeam,
  approveTournamentTeam,
  rejectTournamentTeam,
  withdrawTournamentTeam,
  removeTournamentTeam,
};

for (const [name, handler] of Object.entries(controllers)) {
  if (typeof handler !== "function") {
    throw new Error(`TournamentTeamController.${name} is not a function`);
  }
}

if (typeof protect !== "function") {
  throw new Error("authMiddleware must export a function");
}

if (typeof tournamentAuth !== "function") {
  throw new Error("tournamentAuth must export a function");
}

// ======================================
// TEAM REGISTRATION
// ======================================

// Register a team
router.post(
  "/:tournamentId/teams",
  protect,
  registerTeam
);

// Get logged-in user's registration
router.get(
  "/:tournamentId/teams/my-registration",
  protect,
  getMyTournamentTeam
);

// Withdraw own registration
router.patch(
  "/:tournamentId/teams/withdraw",
  protect,
  withdrawTournamentTeam
);

// ======================================
// TOURNAMENT STAFF TEAM MANAGEMENT
// ======================================

// Get all registered teams
router.get(
  "/:tournamentId/teams",
  protect,
  tournamentAuth("super_admin", "admin", "organizer", "referee"),
  getTournamentTeams
);

// Get a specific team
router.get(
  "/:tournamentId/teams/:teamId",
  protect,
  tournamentAuth("super_admin", "admin", "organizer", "referee"),
  getTournamentTeamById
);

// Approve registration
router.patch(
  "/:tournamentId/teams/:teamId/approve",
  protect,
  tournamentAuth("super_admin", "admin"),
  approveTournamentTeam
);

// Reject registration
router.patch(
  "/:tournamentId/teams/:teamId/reject",
  protect,
  tournamentAuth("super_admin", "admin"),
  rejectTournamentTeam
);

// Remove registration
router.delete(
  "/:tournamentId/teams/:teamId",
  protect,
  tournamentAuth("super_admin", "admin"),
  removeTournamentTeam
);

// ======================================
// EXPORT ROUTER
// ======================================

module.exports = router;
