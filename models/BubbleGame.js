// models/BubbleGame.js

const mongoose = require("mongoose");

const BubbleGameSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    image: {
      type: String,
      default: "/multA.jpg",
    },

    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    betAmount: {
      type: Number,
      required: true,
      default: 100,
      min: 0,
    },

    rewardAmount: {
      type: Number,
      required: true,
      default: 180,
      min: 0,
    },

    maxPlayers: {
      type: Number,
      default: 10,
    },

    players: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    status: {
      type: String,
      enum: ["Waiting", "Playing", "Finished", "Cancelled"],
      default: "Waiting",
    },

    scoreTarget: {
      type: Number,
      required: true,
      min: 1,
    },

    turnsBeforeShift: {
      type: Number,
      required: true,
      min: 1,
    },

    timeLimit: {
      type: Number,
      required: true,
      min: 10,
    },

    level: {
      type: Number,
      required: true,
      min: 1,
    },

    winner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    startedAt: Date,

    endedAt: Date,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("BubbleGame", BubbleGameSchema);
