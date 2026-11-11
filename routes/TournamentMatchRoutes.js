
const express = require("express");
const router = express.Router();

const {
  createMatch,
  getTournamentMatches,
  getTournamentMatchById,
  updateMatch,
  startMatch,
  submitMatchResult,
  approveMatchResult,
  assignReferee,
  postponeMatch,
  cancelMatch,
  deleteMatch,
} = require("../controller/TournamentMatchController");

const {protect} = require("../middleware/AuthMiddleware");
const tournamentAuth = require("../middleware/TournamentAuth");

// All routes require login
router.use(protect);

// Public tournament match listing is available to authenticated users.
// If you want public unauthenticated access, remove router.use(protect)
// and apply protect individually to staff-only routes.

// Create a match
router.post(
  "/:tournamentId/matches",
  tournamentAuth("super_admin", "admin"),
  createMatch
);

// Get all matches
router.get(
  "/:tournamentId/matches",
  getTournamentMatches
);

// Get a specific match
router.get(
  "/:tournamentId/matches/:matchId",
  getTournamentMatchById
);

// Update match schedule and venue
router.patch(
  "/:tournamentId/matches/:matchId",
  tournamentAuth("super_admin", "admin", "organizer"),
  updateMatch
);

// Start a match
router.patch(
  "/:tournamentId/matches/:matchId/start",
  tournamentAuth("super_admin", "admin", "referee"),
  startMatch
);

// Submit match result
router.patch(
  "/:tournamentId/matches/:matchId/result",
  tournamentAuth("super_admin", "admin", "referee"),
  submitMatchResult
);

// Approve match result
router.patch(
  "/:tournamentId/matches/:matchId/approve-result",
  tournamentAuth("super_admin", "admin"),
  approveMatchResult
);

// Assign referee
router.patch(
  "/:tournamentId/matches/:matchId/assign-referee",
  tournamentAuth("super_admin", "admin", "organizer"),
  assignReferee
);

// Postpone match
router.patch(
  "/:tournamentId/matches/:matchId/postpone",
  tournamentAuth("super_admin", "admin", "organizer"),
  postponeMatch
);

// Cancel match
router.patch(
  "/:tournamentId/matches/:matchId/cancel",
  tournamentAuth("super_admin", "admin"),
  cancelMatch
);

// Delete match
router.delete(
  "/:tournamentId/matches/:matchId",
  tournamentAuth("super_admin", "admin"),
  deleteMatch
);

module.exports = router;
