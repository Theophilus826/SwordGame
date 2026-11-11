
const mongoose = require("mongoose");

const tournamentStaffSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: [
        "super_admin",
        "tournament_admin",
        "match_coordinator",
        "referee",
        "team_manager",
        "sponsor",
         ],
      required: true,
    },

    permissions: {
      type: [String],
      default: [],
    },

    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    assignedAt: {
      type: Date,
      default: Date.now,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

// One staff record per user per tournament.
tournamentStaffSchema.index(
  { tournament: 1, user: 1 },
  { unique: true }
);

tournamentStaffSchema.index({
  tournament: 1,
  role: 1,
  isActive: 1,
});

module.exports = mongoose.model(
  "TournamentStaff",
  tournamentStaffSchema
);
