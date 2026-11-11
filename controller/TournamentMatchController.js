
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Tournament = require("../models/Tournament");
const TournamentTeam = require("../models/TournamentTeam");
const TournamentMatch = require("../models/TournamentMatch");
const TournamentStaff = require("../models/TournamentStaff");

// Helpers

const getTournamentId = (req) =>
  req.tournamentId || req.params.tournamentId || req.body.tournament;

const isValidId = (id) => mongoose.isValidObjectId(id);

const isAdmin = (req) =>
  ["super_admin", "admin"].includes(req.tournamentStaff?.role);

const isScheduleManager = (req) =>
  ["super_admin", "admin", "organizer"].includes(
    req.tournamentStaff?.role
  );

const canSubmitResult = (req, match) =>
  isAdmin(req) ||
  match.referee?.toString() === req.user?._id?.toString();

const knockoutRounds = [
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
];

const validateMatchTeams = async (
  tournamentId,
  homeTeamId,
  awayTeamId,
  isBye
) => {
  if (isBye) {
    if ((!homeTeamId && !awayTeamId) || (homeTeamId && awayTeamId)) {
      return {
        valid: false,
        message: "A bye must have exactly one team.",
      };
    }
  } else {
    if (!homeTeamId || !awayTeamId) {
      return {
        valid: false,
        message: "Both home and away teams are required.",
      };
    }

    if (homeTeamId.toString() === awayTeamId.toString()) {
      return {
        valid: false,
        message: "A team cannot play against itself.",
      };
    }
  }

  const teamIds = [homeTeamId, awayTeamId].filter(Boolean);

  const teams = await TournamentTeam.find({
    _id: { $in: teamIds },
    tournament: tournamentId,
    status: "approved",
  }).select("_id");

  if (teams.length !== teamIds.length) {
    return {
      valid: false,
      message:
        "One or more teams are invalid, not approved, or belong to another tournament.",
    };
  }

  return { valid: true };
};

// 1. Create a match
const createMatch = asyncHandler(async (req, res) => {
  const tournamentId = getTournamentId(req);

  if (!isValidId(tournamentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID.",
    });
  }

  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found.",
    });
  }

  const {
    matchNumber,
    round,
    homeTeam,
    awayTeam,
    venue,
    scheduledAt,
    durationMinutes,
    isBye = false,
  } = req.body;

  if (!Number.isInteger(Number(matchNumber)) || Number(matchNumber) < 1) {
    return res.status(400).json({
      success: false,
      message: "A valid match number is required.",
    });
  }

  const allowedRounds = [
    "preliminary",
    "round_of_16",
    "quarter_final",
    "semi_final",
    "third_place",
    "final",
  ];

  if (!allowedRounds.includes(round)) {
    return res.status(400).json({
      success: false,
      message: "Invalid match round.",
    });
  }

  if (homeTeam && !isValidId(homeTeam)) {
    return res.status(400).json({
      success: false,
      message: "Invalid home team ID.",
    });
  }

  if (awayTeam && !isValidId(awayTeam)) {
    return res.status(400).json({
      success: false,
      message: "Invalid away team ID.",
    });
  }

  const teamValidation = await validateMatchTeams(
    tournamentId,
    homeTeam,
    awayTeam,
    isBye
  );

  if (!teamValidation.valid) {
    return res.status(400).json({
      success: false,
      message: teamValidation.message,
    });
  }

  if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) {
    return res.status(400).json({
      success: false,
      message: "Invalid scheduled date.",
    });
  }

  const existingMatch = await TournamentMatch.findOne({
    tournament: tournamentId,
    matchNumber: Number(matchNumber),
  });

  if (existingMatch) {
    return res.status(409).json({
      success: false,
      message: "This match number already exists in the tournament.",
    });
  }

  const byeTeam = isBye ? homeTeam || awayTeam : null;

  const match = await TournamentMatch.create({
    tournament: tournamentId,
    matchNumber: Number(matchNumber),
    round,
    homeTeam: homeTeam || null,
    awayTeam: awayTeam || null,
    venue: venue || "",
    scheduledAt: scheduledAt || null,
    durationMinutes:
      durationMinutes || tournament.matchDurationMinutes || 10,
    isBye,
    ...(isBye && {
      winner: byeTeam,
      status: "walkover",
      completedAt: new Date(),
    }),
  });

  return res.status(201).json({
    success: true,
    message: "Match created successfully.",
    data: match,
  });
});

// 2. Get all tournament matches
const getTournamentMatches = asyncHandler(async (req, res) => {
  const tournamentId = getTournamentId(req);

  if (!isValidId(tournamentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID.",
    });
  }

  const {
    round,
    status,
    page = 1,
    limit = 20,
  } = req.query;

  const filter = { tournament: tournamentId };

  if (round) filter.round = round;
  if (status) filter.status = status;

  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));

  const [matches, total] = await Promise.all([
    TournamentMatch.find(filter)
      .populate("homeTeam", "teamName teamLogo")
      .populate("awayTeam", "teamName teamLogo")
      .populate("winner", "teamName teamLogo")
      .populate("referee", "name email")
      .sort({ matchNumber: 1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),

    TournamentMatch.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    count: matches.length,
    total,
    page: pageNumber,
    pages: Math.ceil(total / pageSize),
    data: matches,
  });
});

// 3. Get one match
const getTournamentMatchById = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  })
    .populate("homeTeam")
    .populate("awayTeam")
    .populate("winner", "teamName teamLogo")
    .populate("referee", "name email")
    .populate("resultSubmittedBy", "name email")
    .populate("resultApprovedBy", "name email");

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  return res.status(200).json({
    success: true,
    data: match,
  });
});

// 4. Update match schedule and basic details
const updateMatch = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (["live", "completed", "walkover"].includes(match.status)) {
    return res.status(400).json({
      success: false,
      message: "This match can no longer be edited.",
    });
  }

  const allowedFields = [
    "venue",
    "scheduledAt",
    "durationMinutes",
  ];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      match[field] = req.body[field];
    }
  }

  if (
    match.scheduledAt &&
    Number.isNaN(new Date(match.scheduledAt).getTime())
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid scheduled date.",
    });
  }

  if (
    !Number.isInteger(Number(match.durationMinutes)) ||
    Number(match.durationMinutes) < 1
  ) {
    return res.status(400).json({
      success: false,
      message: "Match duration must be at least one minute.",
    });
  }

  await match.save();

  return res.status(200).json({
    success: true,
    message: "Match updated successfully.",
    data: match,
  });
});

// 5. Start a match
const startMatch = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (!["pending", "scheduled"].includes(match.status)) {
    return res.status(400).json({
      success: false,
      message: "Only pending or scheduled matches can be started.",
    });
  }

  if (match.isBye || !match.homeTeam || !match.awayTeam) {
    return res.status(400).json({
      success: false,
      message: "A bye or incomplete match cannot be started.",
    });
  }

  match.status = "live";
  match.startedAt = new Date();

  await match.save();

  return res.status(200).json({
    success: true,
    message: "Match started successfully.",
    data: match,
  });
});

// 6. Submit match result
const submitMatchResult = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (!canSubmitResult(req, match)) {
    return res.status(403).json({
      success: false,
      message: "Only the assigned referee or an administrator can submit this result.",
    });
  }

  if (match.isBye || match.status !== "live") {
    return res.status(400).json({
      success: false,
      message: "Only live matches can have results submitted.",
    });
  }

  const {
    homeScore,
    awayScore,
    penalties,
    homeYellowCards,
    awayYellowCards,
    homeRedCards,
    awayRedCards,
    matchReport,
  } = req.body;

  const scores = [homeScore, awayScore];

  if (
    scores.some(
      (score) =>
        score === undefined ||
        !Number.isInteger(Number(score)) ||
        Number(score) < 0
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid non-negative home and away scores are required.",
    });
  }

  const home = Number(homeScore);
  const away = Number(awayScore);

  let winner = null;
  let penaltyScores = {
    homeScore: null,
    awayScore: null,
  };

  if (home > away) {
    winner = match.homeTeam;
  } else if (away > home) {
    winner = match.awayTeam;
  } else if (penalties) {
    const penaltyHome = Number(penalties.homeScore);
    const penaltyAway = Number(penalties.awayScore);

    if (
      !Number.isInteger(penaltyHome) ||
      !Number.isInteger(penaltyAway) ||
      penaltyHome < 0 ||
      penaltyAway < 0 ||
      penaltyHome === penaltyAway
    ) {
      return res.status(400).json({
        success: false,
        message: "Penalty scores must be valid, non-negative, and unequal.",
      });
    }

    penaltyScores = {
      homeScore: penaltyHome,
      awayScore: penaltyAway,
    };

    winner =
      penaltyHome > penaltyAway
        ? match.homeTeam
        : match.awayTeam;
  }

  if (knockoutRounds.includes(match.round) && !winner) {
    return res.status(400).json({
      success: false,
      message: "A winner is required for this knockout match. Submit unequal penalty scores for a draw.",
    });
  }

  const cardFields = {
    homeYellowCards,
    awayYellowCards,
    homeRedCards,
    awayRedCards,
  };

  for (const [field, value] of Object.entries(cardFields)) {
    if (
      value !== undefined &&
      (!Number.isInteger(Number(value)) || Number(value) < 0)
    ) {
      return res.status(400).json({
        success: false,
        message: `${field} must be a non-negative integer.`,
      });
    }
  }

  match.homeScore = home;
  match.awayScore = away;
  match.penalties = penaltyScores;
  match.winner = winner;
  match.status = "completed";
  match.completedAt = new Date();
  match.resultSubmittedBy = req.user._id;

  // A new submission must be approved again.
  match.resultApprovedBy = null;
  match.resultApprovedAt = null;

  if (homeYellowCards !== undefined)
    match.homeYellowCards = Number(homeYellowCards);
  if (awayYellowCards !== undefined)
    match.awayYellowCards = Number(awayYellowCards);
  if (homeRedCards !== undefined)
    match.homeRedCards = Number(homeRedCards);
  if (awayRedCards !== undefined)
    match.awayRedCards = Number(awayRedCards);
  if (matchReport !== undefined)
    match.matchReport = matchReport;

  await match.save();

  return res.status(200).json({
    success: true,
    message: "Match result submitted and awaiting approval.",
    data: match,
  });
});

// 7. Approve a submitted result
const approveMatchResult = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (match.status !== "completed" || !match.resultSubmittedBy) {
    return res.status(400).json({
      success: false,
      message: "There is no submitted result to approve.",
    });
  }

  if (match.resultApprovedAt) {
    return res.status(400).json({
      success: false,
      message: "This match result has already been approved.",
    });
  }

  match.resultApprovedBy = req.user._id;
  match.resultApprovedAt = new Date();

  await match.save();

  return res.status(200).json({
    success: true,
    message: "Match result approved successfully.",
    data: match,
  });
});

// 8. Assign a referee
const assignReferee = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;
  const { refereeId } = req.body;

  if (
    !isValidId(tournamentId) ||
    !isValidId(matchId) ||
    !isValidId(refereeId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament, match, or referee ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (["live", "completed", "walkover"].includes(match.status)) {
    return res.status(400).json({
      success: false,
      message: "A referee cannot be assigned after the match has started.",
    });
  }

  const referee = await TournamentStaff.findOne({
    tournament: tournamentId,
    user: refereeId,
    role: "referee",
    isActive: true,
  });

  if (!referee) {
    return res.status(400).json({
      success: false,
      message: "The selected user is not an active referee for this tournament.",
    });
  }

  match.referee = refereeId;

  await match.save();

  return res.status(200).json({
    success: true,
    message: "Referee assigned successfully.",
    data: match,
  });
});

// 9. Postpone a match
const postponeMatch = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;
  const { scheduledAt, adminNotes } = req.body;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (["completed", "walkover", "cancelled"].includes(match.status)) {
    return res.status(400).json({
      success: false,
      message: "This match cannot be postponed.",
    });
  }

  if (scheduledAt) {
    if (Number.isNaN(Date.parse(scheduledAt))) {
      return res.status(400).json({
        success: false,
        message: "Invalid rescheduled date.",
      });
    }

    match.scheduledAt = scheduledAt;
  }

  match.status = "postponed";

  if (adminNotes !== undefined) {
    match.adminNotes = adminNotes;
  }

  await match.save();

  return res.status(200).json({
    success: true,
    message: "Match postponed successfully.",
    data: match,
  });
});

// 10. Cancel a match
const cancelMatch = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (["completed", "walkover"].includes(match.status)) {
    return res.status(400).json({
      success: false,
      message: "A completed match cannot be cancelled.",
    });
  }

  match.status = "cancelled";
  match.adminNotes = req.body.adminNotes || match.adminNotes;

  await match.save();

  return res.status(200).json({
    success: true,
    message: "Match cancelled successfully.",
    data: match,
  });
});

// 11. Delete a match
const deleteMatch = asyncHandler(async (req, res) => {
  const { tournamentId, matchId } = req.params;

  if (!isValidId(tournamentId) || !isValidId(matchId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament or match ID.",
    });
  }

  const match = await TournamentMatch.findOne({
    _id: matchId,
    tournament: tournamentId,
  });

  if (!match) {
    return res.status(404).json({
      success: false,
      message: "Match not found.",
    });
  }

  if (["live", "completed", "walkover"].includes(match.status)) {
    return res.status(400).json({
      success: false,
      message: "Live or completed matches cannot be deleted.",
    });
  }

  await match.deleteOne();

  return res.status(200).json({
    success: true,
    message: "Match deleted successfully.",
  });
});

module.exports = {
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
};
