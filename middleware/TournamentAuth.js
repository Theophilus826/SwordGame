
const mongoose = require("mongoose");
const Tournament = require("../models/Tournament");
const TournamentStaff = require("../models/TournamentStaff");

const tournamentAuth = (...allowedRoles) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?._id;

      const tournamentId =
        req.params.tournamentId ||
        req.params.id ||
        req.body.tournament;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Please log in first",
        });
      }

      if (!tournamentId || !mongoose.isValidObjectId(tournamentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid tournament ID",
        });
      }

      // Check tournament existence
      const tournament = await Tournament.findById(tournamentId)
        .select("_id createdBy")
        .lean();

      if (!tournament) {
        return res.status(404).json({
          success: false,
          message: "Tournament not found",
        });
      }

      // Find active tournament staff
      const staff = await TournamentStaff.findOne({
        tournament: tournamentId,
        user: userId,
        isActive: true,
      }).lean();

      if (!staff) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized for this tournament",
        });
      }

      // Check permissions
      if (
        allowedRoles.length > 0 &&
        !allowedRoles.includes(staff.role)
      ) {
        return res.status(403).json({
          success: false,
          message: "Insufficient tournament permissions",
        });
      }

      req.tournament = tournament;
      req.tournamentStaff = staff;
      req.tournamentId = tournamentId;

      next();
    } catch (error) {
      console.error("Tournament Auth Error:", error);

      return res.status(500).json({
        success: false,
        message: "Authorization error",
      });
    }
  };
};

module.exports = tournamentAuth;
