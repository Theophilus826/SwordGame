
const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    jerseyNumber: {
      type: Number,
      min: 1,
      max: 99,
      default: null,
    },

    position: {
      type: String,
      enum: [
        "goalkeeper",
        "defender",
        "midfielder",
        "forward",
        "utility",
      ],
      default: "utility",
    },
  },
  { _id: true }
);

const tournamentTeamSchema = new mongoose.Schema(
  {
    tournament: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },

    teamName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    teamLogo: {
      type: String,
      default: "",
    },

    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    captainName: {
      type: String,
      required: true,
      trim: true,
    },

    captainPhone: {
      type: String,
      required: true,
      trim: true,
    },

    players: {
      type: [playerSchema],
      validate: {
        validator: function (players) {
          return players.length >= 5 && players.length <= 7;
        },
        message: "A team must have between 5 and 7 registered players.",
      },
    },

    registrationNumber: {
      type: String,
      trim: true,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "withdrawn",
      ],
      default: "pending",
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: [
        "unpaid",
        "pending",
        "paid",
        "rejected",
        "refunded",
      ],
      default: "unpaid",
      index: true,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// A team name can only appear once in the same tournament.
tournamentTeamSchema.index(
  { tournament: 1, teamName: 1 },
  { unique: true }
);

// A captain can only register once in a tournament.
tournamentTeamSchema.index(
  { tournament: 1, captain: 1 },
  { unique: true }
);

// Registration numbers must be unique within a tournament.
tournamentTeamSchema.index(
  { tournament: 1, registrationNumber: 1 },
  {
    unique: true,
    partialFilterExpression: {
      registrationNumber: { $type: "string" },
    },
  }
);

module.exports = mongoose.model(
  "TournamentTeam",
  tournamentTeamSchema
);
