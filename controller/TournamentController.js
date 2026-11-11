
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const slugify = require("slugify");

const Tournament = require("../models/Tournament");
const TournamentStaff = require("../models/TournamentStaff");
const TournamentTeam = require("../models/TournamentTeam");
const TournamentMatch = require("../models/TournamentMatch");

// ======================================
// CREATE TOURNAMENT
// ======================================
const createTournament = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    location,
    startDate,
    endDate,
    registrationOpens,
    registrationCloses,
    registrationFee,
    maxTeams,
    maxPlayersPerTeam,
    matchDurationMinutes,
    winnerPrize,
    runnerUpPrize,
    thirdPlacePrize,
    visibility,
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Tournament name is required",
    });
  }

  const slug = slugify(name, {
    lower: true,
    strict: true,
  });

  if (!slug) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid tournament name",
    });
  }

  const existing = await Tournament.findOne({ slug });

  if (existing) {
    return res.status(409).json({
      success: false,
      message: "A tournament with this name already exists",
    });
  }

  const tournament = await Tournament.create({
    name: name.trim(),
    slug,
    description,
    location,
    startDate,
    endDate,
    registrationOpens,
    registrationCloses,
    registrationFee: registrationFee ?? 15000,
    maxTeams: maxTeams ?? 24,
    maxPlayersPerTeam: maxPlayersPerTeam ?? 7,
    matchDurationMinutes: matchDurationMinutes ?? 10,
    winnerPrize: winnerPrize ?? 150000,
    runnerUpPrize: runnerUpPrize ?? 0,
    thirdPlacePrize: thirdPlacePrize ?? 0,
    visibility: visibility ?? "public",
    organizer: req.user._id,
    createdBy: req.user._id,
  });

  try {
    // Automatically make creator the tournament Super Admin.
    await TournamentStaff.create({
      tournament: tournament._id,
      user: req.user._id,
      role: "super_admin",
      assignedBy: req.user._id,
    });
  } catch (error) {
    // Roll back tournament if staff assignment fails.
    await Tournament.deleteOne({ _id: tournament._id });
    throw error;
  }

  res.status(201).json({
    success: true,
    message: "Tournament created successfully",
    tournament,
  });
});

// ======================================
// GET ALL PUBLIC TOURNAMENTS
// ======================================
const getPublicTournaments = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    status,
  } = req.query;

  const pageNumber = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 12));

  const filter = {
    published: true,
    visibility: "public",
  };

  const allowedStatuses = [
    "registration_open",
    "registration_closed",
    "in_progress",
    "completed",
  ];

  if (status && allowedStatuses.includes(status)) {
    filter.status = status;
  }

  const [tournaments, total] = await Promise.all([
    Tournament.find(filter)
      .select("-createdBy -updatedBy")
      .sort({ startDate: 1, createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize)
      .lean(),

    Tournament.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    tournaments,
    pagination: {
      total,
      page: pageNumber,
      pages: Math.ceil(total / pageSize),
      limit: pageSize,
    },
  });
});

// ======================================
// GET SINGLE PUBLIC TOURNAMENT
// ======================================
const getTournamentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament ID",
    });
  }

  const tournament = await Tournament.findOne({
    _id: id,
    published: true,
    visibility: "public",
  })
    .select("-createdBy -updatedBy")
    .lean();

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  const [teamCount, matchCount] = await Promise.all([
    TournamentTeam.countDocuments({
      tournament: id,
      status: "approved",
    }),

    TournamentMatch.countDocuments({
      tournament: id,
    }),
  ]);

  res.status(200).json({
    success: true,
    tournament: {
      ...tournament,
      teamCount,
      matchCount,
    },
  });
});

// ======================================
// GET MY TOURNAMENTS
// ======================================
const getMyTournaments = asyncHandler(async (req, res) => {
  const staffAssignments = await TournamentStaff.find({
    user: req.user._id,
    isActive: true,
  }).select("tournament role");

  const tournamentIds = staffAssignments.map(
    (staff) => staff.tournament
  );

  const tournaments = await Tournament.find({
    _id: { $in: tournamentIds },
  }).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    tournaments,
  });
});

// ======================================
// UPDATE TOURNAMENT
// ======================================
const updateTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;

  const allowedFields = [
    "name",
    "description",
    "location",
    "startDate",
    "endDate",
    "registrationOpens",
    "registrationCloses",
    "registrationFee",
    "maxTeams",
    "maxPlayersPerTeam",
    "matchDurationMinutes",
    "winnerPrize",
    "runnerUpPrize",
    "thirdPlacePrize",
    "visibility",
    "banner",
    "logo",
    "rules",
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: "No valid update fields supplied",
    });
  }

  // Avoid silently changing the URL slug after publication.
  if (updates.name) {
    const newSlug = slugify(updates.name, {
      lower: true,
      strict: true,
    });

    if (!newSlug) {
      return res.status(400).json({
        success: false,
        message: "Invalid tournament name",
      });
    }

    const duplicate = await Tournament.findOne({
      slug: newSlug,
      _id: { $ne: tournamentId },
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "Another tournament already uses this name",
      });
    }

    updates.slug = newSlug;
  }

  updates.updatedBy = req.user._id;

  const tournament = await Tournament.findByIdAndUpdate(
    tournamentId,
    { $set: updates },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  res.status(200).json({
    success: true,
    message: "Tournament updated successfully",
    tournament,
  });
});

// ======================================
// PUBLISH TOURNAMENT
// ======================================
const publishTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;

  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  if (tournament.status === "cancelled") {
    return res.status(400).json({
      success: false,
      message: "Cancelled tournaments cannot be published",
    });
  }

  tournament.published = true;

  await tournament.save();

  res.status(200).json({
    success: true,
    message: "Tournament published successfully",
    tournament,
  });
});

// ======================================
// CHANGE REGISTRATION STATUS
// ======================================
const changeTournamentStatus = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;
  const { status } = req.body;

  const allowedStatuses = [
    "draft",
    "registration_open",
    "registration_closed",
    "in_progress",
    "completed",
    "cancelled",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid tournament status",
    });
  }

  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  if (
    ["completed", "cancelled"].includes(tournament.status) &&
    status !== tournament.status
  ) {
    return res.status(400).json({
      success: false,
      message: "Completed or cancelled tournaments cannot be reopened",
    });
  }

  if (status === "registration_open") {
    if (!tournament.registrationCloses) {
      return res.status(400).json({
        success: false,
        message: "Set a registration closing date first",
      });
    }

    if (tournament.registrationCloses <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Registration closing date must be in the future",
      });
    }
  }

  if (status === "completed") {
    const finalMatch = await TournamentMatch.findOne({
      tournament: tournamentId,
      round: "final",
    });

    if (!finalMatch || finalMatch.status !== "completed" || !finalMatch.winner) {
      return res.status(400).json({
        success: false,
        message: "The final must be completed and have an approved winner",
      });
    }
  }

  tournament.status = status;

  await tournament.save();

  res.status(200).json({
    success: true,
    message: "Tournament status updated",
    tournament,
  });
});

// ======================================
// DELETE DRAFT TOURNAMENT
// ======================================
const deleteTournament = asyncHandler(async (req, res) => {
  const { tournamentId } = req.params;

  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    return res.status(404).json({
      success: false,
      message: "Tournament not found",
    });
  }

  if (tournament.status !== "draft") {
    return res.status(400).json({
      success: false,
      message: "Only draft tournaments can be deleted",
    });
  }

  const [teamCount, matchCount, paymentCount] = await Promise.all([
    TournamentTeam.countDocuments({ tournament: tournamentId }),
    TournamentMatch.countDocuments({ tournament: tournamentId }),
    mongoose.model("TournamentPayment").countDocuments({
      tournament: tournamentId,
    }),
  ]);

  if (teamCount || matchCount || paymentCount) {
    return res.status(409).json({
      success: false,
      message: "Tournament has records and cannot be deleted",
    });
  }

  await Promise.all([
    TournamentStaff.deleteMany({ tournament: tournamentId }),
    Tournament.deleteOne({ _id: tournamentId }),
  ]);

  res.status(200).json({
    success: true,
    message: "Draft tournament deleted successfully",
  });
});

module.exports = {
  createTournament,
  getPublicTournaments,
  getTournamentById,
  getMyTournaments,
  updateTournament,
  publishTournament,
  changeTournamentStatus,
  deleteTournament,
};
