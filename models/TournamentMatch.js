
const mongoose = require("mongoose");

const tournamentMatchSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },

    matchNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    round: {
      type: String,
      enum: [
        "preliminary",
        "round_of_16",
        "quarter_final",
        "semi_final",
        "third_place",
        "final",
      ],
      required: true,
      index: true,
    },

    homeTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TournamentTeam",
      default: null,
    },

    awayTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TournamentTeam",
      default: null,
    },

    homeScore: {
      type: Number,
      default: 0,
      min: 0,
    },

    awayScore: {
      type: Number,
      default: 0,
      min: 0,
    },

    penalties: {
      homeScore: {
        type: Number,
        default: null,
        min: 0,
      },
      awayScore: {
        type: Number,
        default: null,
        min: 0,
      },
    },

    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TournamentTeam",
      default: null,
    },

    referee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    venue: {
      type: String,
      trim: true,
      default: "",
    },

    scheduledAt: {
      type: Date,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    durationMinutes: {
      type: Number,
      default: 10,
      min: 1,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "scheduled",
        "live",
        "completed",
        "postponed",
        "cancelled",
        "walkover",
      ],
      default: "pending",
      index: true,
    },

    isBye: {
      type: Boolean,
      default: false,
    },

    homeYellowCards: {
      type: Number,
      default: 0,
      min: 0,
    },

    awayYellowCards: {
      type: Number,
      default: 0,
      min: 0,
    },

    homeRedCards: {
      type: Number,
      default: 0,
      min: 0,
    },

    awayRedCards: {
      type: Number,
      default: 0,
      min: 0,
    },

    matchReport: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },

    resultSubmittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resultApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    resultApprovedAt: {
      type: Date,
      default: null,
    },

    adminNotes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true }
);

// No duplicate match numbers within a tournament.
tournamentMatchSchema.index(
  { tournament: 1, matchNumber: 1 },
  { unique: true }
);

tournamentMatchSchema.index({
  tournament: 1,
  round: 1,
  scheduledAt: 1,
});

tournamentMatchSchema.index({
  tournament: 1,
  status: 1,
});

module.exports = mongoose.model(
  "TournamentMatch",
  tournamentMatchSchema
);
