
const mongoose = require("mongoose");

const tournamentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    sport: {
      type: String,
      enum: ["football"],
      default: "football",
    },

    format: {
      type: String,
      enum: ["five_a_side"],
      default: "five_a_side",
    },

    location: {
      country: {
        type: String,
        default: "Nigeria",
      },
      state: {
        type: String,
        default: "Lagos",
      },
      city: {
        type: String,
        default: "Lagos",
      },
      venue: {
        type: String,
        trim: true,
        default: "",
      },
      address: {
        type: String,
        trim: true,
        default: "",
      },
    },

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    registrationOpens: {
      type: Date,
      default: null,
    },

    registrationCloses: {
      type: Date,
      default: null,
    },

    registrationFee: {
      type: Number,
      required: true,
      min: 0,
      default: 15000,
    },

    currency: {
      type: String,
      default: "NGN",
      enum: ["NGN"],
    },

    maxTeams: {
      type: Number,
      default: 24,
      min: 2,
      max: 128,
    },

    maxPlayersPerTeam: {
      type: Number,
      default: 7,
      min: 5,
      max: 15,
    },

    playersOnPitch: {
      type: Number,
      default: 5,
      min: 5,
      max: 5,
    },

    matchDurationMinutes: {
      type: Number,
      default: 10,
      min: 1,
    },

    winnerPrize: {
      type: Number,
      default: 150000,
      min: 0,
    },

    runnerUpPrize: {
      type: Number,
      default: 0,
      min: 0,
    },

    thirdPlacePrize: {
      type: Number,
      default: 0,
      min: 0,
    },

    rules: {
      rollingSubstitutions: {
        type: Boolean,
        default: true,
      },
      knockoutPenaltyShootout: {
        type: Boolean,
        default: true,
      },
      lateArrivalGraceMinutes: {
        type: Number,
        default: 10,
        min: 0,
      },
    },

    status: {
      type: String,
      enum: [
        "draft",
        "registration_open",
        "registration_closed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      default: "draft",
      index: true,
    },

    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },

    banner: {
      type: String,
      default: "",
    },

    logo: {
      type: String,
      default: "",
    },

    published: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

tournamentSchema.index({ status: 1, startDate: 1 });
tournamentSchema.index({ organizer: 1, createdAt: -1 });

module.exports = mongoose.model("Tournament", tournamentSchema);
