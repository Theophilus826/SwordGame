
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Tournament = require("../models/Tournament");
const TournamentTeam = require("../models/TournamentTeam");

// ======================================
// REGISTER TEAM FOR TOURNAMENT
// ======================================
const registerTeam = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;

  const {
    teamName,
    teamLogo,
    captainName,
    captainPhone,
    players,
  } = req.body;

  if (!mongoose.isValidObjectId(tournamentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID",
    });
  }

  if (!req.user?._id) {
    return res.status(401).json({
      success: false,
      message: "Please log in first",
    });
  }

  if (!teamName || !teamName.trim()) {
    return res.status(400).json({
      success: false,
      message: "Team name is required",
    });
  }

  if (!captainName || !captainPhone) {
    return res.status(400).json({
      success: false,
      message: "Captain name and phone are required",
    });
  }

  if (!Array.isArray(players) || players.length < 5 || players.length > 7) {
    return res.status(400).json({
      success: false,
      message: "A team must have between 5 and 7 players",
    });
  }

  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  if (tournament.status !== "registration_open") {
    return res.status(400).json({
      success: false,
      message: "Tournament registration is not open",
    });
  }

  const now = new Date();

  if (
    tournament.registrationOpens &&
    now < tournament.registrationOpens
  ) {
    return res.status(400).json({
      success: false,
      message: "Registration has not started yet",
    });
  }

  if (
    tournament.registrationCloses &&
    now > tournament.registrationCloses
  ) {
    return res.status(400).json({
      success: false,
      message: "Registration has closed",
    });
  }

  // Check maximum players allowed by tournament
  if (
    tournament.maxPlayersPerTeam &&
    players.length > tournament.maxPlayersPerTeam
  ) {
    return res.status(400).json({
      success: false,
      message: `A team can have a maximum of ${tournament.maxPlayersPerTeam} players`,
    });
  }

  // Check existing captain registration
  const existingCaptain = await TournamentTeam.findOne({
    tournament: tournamentId,
    captain: req.user._id,
  });

  if (existingCaptain) {
    return res.status(409).json({
      success: false,
      message: "You have already registered a team for this tournament",
    });
  }

  // Check existing team name
  const existingTeamName = await TournamentTeam.findOne({
    tournament: tournamentId,
    teamName: teamName.trim(),
  });

  if (existingTeamName) {
    return res.status(409).json({
      success: false,
      message: "This team name is already registered",
    });
  }

  // Check tournament capacity
  const registeredTeams = await TournamentTeam.countDocuments({
    tournament: tournamentId,
    status: { $in: ["pending", "approved"] },
  });

  if (registeredTeams >= tournament.maxTeams) {
    return res.status(400).json({
      success: false,
      message: "Tournament has reached its maximum team capacity",
    });
  }

  const tournamentTeam = await TournamentTeam.create({
    tournament: tournamentId,
    teamName: teamName.trim(),
    teamLogo: teamLogo || "",
    captain: req.user._id,
    captainName: captainName.trim(),
    captainPhone: captainPhone.trim(),
    players,
    registeredBy: req.user._id,
    status: "pending",
    paymentStatus:
      Number(tournament.registrationFee || 0) === 0
        ? "paid"
        : "unpaid",
  });

  return res.status(201).json({
    success: true,
    message: "Team registered successfully. Awaiting approval.",
    tournamentTeam,
  });
});


// ======================================
// GET ALL TOURNAMENT TEAMS
// ======================================
const getTournamentTeams = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  const { page = 1, limit = 20, status, paymentStatus } = req.query;

  if (!mongoose.isValidObjectId(tournamentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID",
    });
  }

  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));

  const allowedStatuses = [
    "pending",
    "approved",
    "rejected",
    "withdrawn",
  ];

  const allowedPaymentStatuses = [
    "unpaid",
    "pending",
    "paid",
    "rejected",
    "refunded",
  ];

  const filter = {
    tournament: tournamentId,
  };

  if (status) {
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration status",
      });
    }

    filter.status = status;
  }

  if (paymentStatus) {
    if (!allowedPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    filter.paymentStatus = paymentStatus;
  }

  const [teams, total] = await Promise.all([
    TournamentTeam.find(filter)
      .populate("captain", "name email")
      .populate("registeredBy", "name email")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),

    TournamentTeam.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    teams,
    pagination: {
      total,
      page: pageNumber,
      pages: Math.ceil(total / pageSize),
      limit: pageSize,
    },
  });
});


// ======================================
// GET SINGLE TOURNAMENT TEAM
// ======================================
const getTournamentTeamById = asyncHandler(async (req, res) => {
  const { tournamentId, teamId } = req.params;

  if (
    !mongoose.isValidObjectId(tournamentId) ||
    !mongoose.isValidObjectId(teamId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or team ID",
    });
  }

  const tournamentTeam = await TournamentTeam.findOne({
    _id: teamId,
    tournament: tournamentId,
  })
    .populate("captain", "name email")
    .populate("registeredBy", "name email")
    .populate("players.user", "name email")
    .lean();

  if (!tournamentTeam) {
    return res.status(404).json({
      success: false,
      message: "Tournament team not found",
    });
  }

  return res.status(200).json({
    success: true,
    tournamentTeam,
  });
});


// ======================================
// GET MY TEAM REGISTRATION
// ======================================
const getMyTournamentTeam = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;

  if (!mongoose.isValidObjectId(tournamentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID",
    });
  }

  const tournamentTeam = await TournamentTeam.findOne({
    tournament: tournamentId,
    captain: req.user._id,
  }).lean();

  if (!tournamentTeam) {
    return res.status(404).json({
      success: false,
      message: "You have not registered a team for this tournament",
    });
  }

  return res.status(200).json({
    success: true,
    tournamentTeam,
  });
});


// ======================================
// APPROVE TEAM REGISTRATION
// ======================================
const approveTournamentTeam = asyncHandler(async (req, res) => {
  const { tournamentId, teamId } = req.params;

  if (
    !mongoose.isValidObjectId(tournamentId) ||
    !mongoose.isValidObjectId(teamId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or team ID",
    });
  }

  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  const tournamentTeam = await TournamentTeam.findOne({
    _id: teamId,
    tournament: tournamentId,
  });

  if (!tournamentTeam) {
    return res.status(404).json({
      success: false,
      message: "Team registration not found",
    });
  }

  if (tournamentTeam.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Only pending registrations can be approved",
    });
  }

  // Require payment before approval for paid tournaments.
  if (
    Number(tournament.registrationFee || 0) > 0 &&
    tournamentTeam.paymentStatus !== "paid"
  ) {
    return res.status(400).json({
      success: false,
      message: "Team must complete payment before approval",
    });
  }

  const approvedCount = await TournamentTeam.countDocuments({
    tournament: tournamentId,
    status: "approved",
  });

  if (approvedCount >= tournament.maxTeams) {
    return res.status(400).json({
      success: false,
      message: "Tournament has reached its maximum team capacity",
    });
  }

  tournamentTeam.status = "approved";
  tournamentTeam.approvedBy = req.user._id;
  tournamentTeam.approvedAt = new Date();

  await tournamentTeam.save();

  return res.status(200).json({
    success: true,
    message: "Team approved successfully",
    tournamentTeam,
  });
});


// ======================================
// REJECT TEAM REGISTRATION
// ======================================
const rejectTournamentTeam = asyncHandler(async (req, res) => {
  const { tournamentId, teamId } = req.params;
  const { reason } = req.body;

  if (
    !mongoose.isValidObjectId(tournamentId) ||
    !mongoose.isValidObjectId(teamId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or team ID",
    });
  }

  if (!reason || !reason.trim()) {
    return res.status(400).json({
      success: false,
      message: "Rejection reason is required",
    });
  }

  const tournamentTeam = await TournamentTeam.findOne({
    _id: teamId,
    tournament: tournamentId,
  });

  if (!tournamentTeam) {
    return res.status(404).json({
      success: false,
      message: "Team registration not found",
    });
  }

  if (tournamentTeam.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Only pending registrations can be rejected",
    });
  }

  tournamentTeam.status = "rejected";
  tournamentTeam.rejectionReason = reason.trim();

  await tournamentTeam.save();

  return res.status(200).json({
    success: true,
    message: "Team registration rejected",
    tournamentTeam,
  });
});


// ======================================
// WITHDRAW TEAM REGISTRATION
// ======================================
const withdrawTournamentTeam = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;

  if (!mongoose.isValidObjectId(tournamentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID",
    });
  }

  const tournamentTeam = await TournamentTeam.findOne({
    tournament: tournamentId,
    captain: req.user._id,
  });

  if (!tournamentTeam) {
    return res.status(404).json({
      success: false,
      message: "Team registration not found",
    });
  }

  if (
    !["pending", "approved"].includes(tournamentTeam.status)
  ) {
    return res.status(400).json({
      success: false,
      message: "This registration cannot be withdrawn",
    });
  }

  const tournament = await Tournament.findById(tournamentId);

  if (tournament?.status === "in_progress" ||
      tournament?.status === "completed") {
    return res.status(400).json({
      success: false,
      message: "Registration cannot be withdrawn at this stage",
    });
  }

  tournamentTeam.status = "withdrawn";

  await tournamentTeam.save();

  return res.status(200).json({
    success: true,
    message: "Team registration withdrawn successfully",
    tournamentTeam,
  });
});


// ======================================
// REMOVE TEAM REGISTRATION
// ======================================
const removeTournamentTeam = asyncHandler(async (req, res) => {
  const { tournamentId, teamId } = req.params;

  if (
    !mongoose.isValidObjectId(tournamentId) ||
    !mongoose.isValidObjectId(teamId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or team ID",
    });
  }

  const tournamentTeam = await TournamentTeam.findOne({
    _id: teamId,
    tournament: tournamentId,
  });

  if (!tournamentTeam) {
    return res.status(404).json({
      success: false,
      message: "Team registration not found",
    });
  }

  if (tournamentTeam.paymentStatus === "paid") {
    return res.status(400).json({
      success: false,
      message: "Paid registrations cannot be deleted. Process a refund or withdrawal instead.",
    });
  }

  await TournamentTeam.deleteOne({
    _id: teamId,
    tournament: tournamentId,
  });

  return res.status(200).json({
    success: true,
    message: "Team registration removed successfully",
  });
});


// ======================================
// EXPORT CONTROLLERS
// ======================================
module.exports = {
  registerTeam,
  getTournamentTeams,
  getTournamentTeamById,
  getMyTournamentTeam,
  approveTournamentTeam,
  rejectTournamentTeam,
  withdrawTournamentTeam,
  removeTournamentTeam,
};
