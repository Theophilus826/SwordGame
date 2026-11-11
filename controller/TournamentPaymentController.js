
const mongoose = require("mongoose");

const TournamentPayment = require("../models/TournamentPayment");
const TournamentTeam = require("../models/TournamentTeam");
const Tournament = require("../models/Tournament");

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const getUserId = (req) => req.user?._id || req.user?.id;

const isAdmin = (req) =>
  ["admin", "superadmin"].includes(
    String(req.user?.role || "").toLowerCase()
  );

const sendError = (res, statusCode, message) =>
  res.status(statusCode).json({
    success: false,
    message,
  });

// --------------------------------------------------
// 1. SUBMIT TOURNAMENT PAYMENT
// POST /api/tournament-payments
// --------------------------------------------------

exports.submitPayment = async (req, res) => {
  try {
    const {
      tournamentId,
      teamId,
      amount,
      paymentMethod,
      transactionReference,
      notes,
    } = req.body;

    if (
      !tournamentId ||
      !teamId ||
      !amount ||
      !paymentMethod
    ) {
      return sendError(
        res,
        400,
        "Tournament, team, amount and payment method are required."
      );
    }

    if (!mongoose.isValidObjectId(tournamentId) ||
        !mongoose.isValidObjectId(teamId)) {
      return sendError(res, 400, "Invalid tournament or team ID.");
    }

    const validMethods = [
      "bank_transfer",
      "paystack",
      "cash",
      "other",
    ];

    if (!validMethods.includes(paymentMethod)) {
      return sendError(res, 400, "Invalid payment method.");
    }

    const paymentAmount = Number(amount);

    if (!Number.isFinite(paymentAmount) || paymentAmount < 1) {
      return sendError(res, 400, "Invalid payment amount.");
    }

    const [tournament, team] = await Promise.all([
      Tournament.findById(tournamentId),
      TournamentTeam.findById(teamId),
    ]);

    if (!tournament) {
      return sendError(res, 404, "Tournament not found.");
    }

    if (!team) {
      return sendError(res, 404, "Team not found.");
    }

    if (
      String(team.tournament) !== String(tournament._id)
    ) {
      return sendError(
        res,
        400,
        "This team does not belong to the selected tournament."
      );
    }

    // Only the team captain can submit payment.
    if (String(team.captain) !== String(getUserId(req))) {
      return sendError(
        res,
        403,
        "Only the team captain can submit payment."
      );
    }

    if (team.status === "approved") {
      return sendError(
        res,
        400,
        "This team has already been approved."
      );
    }

    if (
      team.status === "pending_approval"
    ) {
      return sendError(
        res,
        400,
        "Payment has already been verified. Await team approval."
      );
    }

    // Prevent paying an incorrect registration fee.
    const expectedAmount = Number(tournament.entryFee);

    if (
      Number.isFinite(expectedAmount) &&
      expectedAmount > 0 &&
      paymentAmount !== expectedAmount
    ) {
      return sendError(
        res,
        400,
        `The registration fee is ₦${expectedAmount}.`
      );
    }

    // Prevent multiple pending or verified payments.
    const existingPayment = await TournamentPayment.findOne({
      tournament: tournamentId,
      team: teamId,
      status: { $in: ["pending", "verified"] },
    });

    if (existingPayment) {
      return sendError(
        res,
        409,
        "A pending or verified payment already exists for this team."
      );
    }

    const reference = transactionReference?.trim() || null;

    if (reference) {
      const duplicateReference =
        await TournamentPayment.findOne({
          transactionReference: reference,
        });

      if (duplicateReference) {
        return sendError(
          res,
          409,
          "This transaction reference has already been used."
        );
      }
    }

    const payment = await TournamentPayment.create({
      tournament: tournamentId,
      team: teamId,
      payer: getUserId(req),
      amount: paymentAmount,
      currency: "NGN",
      paymentMethod,
      transactionReference: reference,
      proofOfPayment: req.file?.path || req.body.proofOfPayment || "",
      notes: notes || "",
      status: "pending",
    });

    team.status = "pending_payment";
    await team.save();

    return res.status(201).json({
      success: true,
      message: "Payment submitted successfully. Awaiting verification.",
      payment,
    });
  } catch (error) {
    console.error("Submit payment error:", error);

    if (error.code === 11000) {
      return sendError(
        res,
        409,
        "This transaction reference has already been used."
      );
    }

    return sendError(res, 500, "Failed to submit payment.");
  }
};

// --------------------------------------------------
// 2. GET MY TEAM PAYMENTS
// GET /api/tournament-payments/my-payments
// --------------------------------------------------

exports.getMyPayments = async (req, res) => {
  try {
    const payments = await TournamentPayment.find({
      payer: getUserId(req),
    })
      .populate("tournament", "name entryFee")
      .populate("team", "name status")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get my payments error:", error);
    return sendError(res, 500, "Failed to retrieve payments.");
  }
};

// --------------------------------------------------
// 3. GET ALL TOURNAMENT PAYMENTS (ADMIN)
// GET /api/tournament-payments
// --------------------------------------------------

exports.getAllPayments = async (req, res) => {
  try {
    const { status, tournamentId } = req.query;

    const filter = {};

    if (status) {
      if (!["pending", "verified", "rejected", "refunded"].includes(status)) {
        return sendError(res, 400, "Invalid payment status.");
      }
      filter.status = status;
    }

    if (tournamentId) {
      if (!mongoose.isValidObjectId(tournamentId)) {
        return sendError(res, 400, "Invalid tournament ID.");
      }
      filter.tournament = tournamentId;
    }

    const payments = await TournamentPayment.find(filter)
      .populate("tournament", "name entryFee")
      .populate("team", "name status captain")
      .populate("payer", "name email")
      .populate("verifiedBy", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Get all payments error:", error);
    return sendError(res, 500, "Failed to retrieve payments.");
  }
};

// --------------------------------------------------
// 4. VERIFY PAYMENT (ADMIN)
// PATCH /api/tournament-payments/:paymentId/verify
// --------------------------------------------------

exports.verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    if (!mongoose.isValidObjectId(req.params.paymentId)) {
      return sendError(res, 400, "Invalid payment ID.");
    }

    let verifiedPayment;

    await session.withTransaction(async () => {
      const payment = await TournamentPayment.findOne({
        _id: req.params.paymentId,
        status: "pending",
      }).session(session);

      if (!payment) {
        throw new Error("PAYMENT_NOT_PENDING");
      }

      const team = await TournamentTeam.findOne({
        _id: payment.team,
        tournament: payment.tournament,
      }).session(session);

      if (!team) {
        throw new Error("TEAM_NOT_FOUND");
      }

      payment.status = "verified";
      payment.verifiedBy = getUserId(req);
      payment.verifiedAt = new Date();
      payment.rejectionReason = "";

      await payment.save({ session });

      // Payment verification does not automatically approve a team.
      team.status = "pending_approval";
      await team.save({ session });

      verifiedPayment = payment;
    });

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully. Team is awaiting approval.",
      payment: verifiedPayment,
    });
  } catch (error) {
    console.error("Verify payment error:", error);

    if (error.message === "PAYMENT_NOT_PENDING") {
      return sendError(
        res,
        400,
        "Payment does not exist or has already been processed."
      );
    }

    if (error.message === "TEAM_NOT_FOUND") {
      return sendError(res, 404, "Associated team not found.");
    }

    return sendError(res, 500, "Failed to verify payment.");
  } finally {
    await session.endSession();
  }
};

// --------------------------------------------------
// 5. REJECT PAYMENT (ADMIN)
// PATCH /api/tournament-payments/:paymentId/reject
// --------------------------------------------------

exports.rejectPayment = async (req, res) => {
  try {
    const { reason } = req.body;

    if (!reason?.trim()) {
      return sendError(
        res,
        400,
        "A rejection reason is required."
      );
    }

    if (!mongoose.isValidObjectId(req.params.paymentId)) {
      return sendError(res, 400, "Invalid payment ID.");
    }

    const payment = await TournamentPayment.findOneAndUpdate(
      {
        _id: req.params.paymentId,
        status: "pending",
      },
      {
        $set: {
          status: "rejected",
          rejectionReason: reason.trim(),
          verifiedBy: getUserId(req),
          verifiedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!payment) {
      return sendError(
        res,
        400,
        "Payment does not exist or has already been processed."
      );
    }

    // Allow the team to submit a corrected payment.
    const otherActivePayment = await TournamentPayment.exists({
      _id: { $ne: payment._id },
      team: payment.team,
      tournament: payment.tournament,
      status: { $in: ["pending", "verified"] },
    });

    if (!otherActivePayment) {
      await TournamentTeam.findByIdAndUpdate(
        payment.team,
        { $set: { status: "pending_payment" } }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Payment rejected successfully.",
      payment,
    });
  } catch (error) {
    console.error("Reject payment error:", error);
    return sendError(res, 500, "Failed to reject payment.");
  }
};

// --------------------------------------------------
// 6. APPROVE TEAM (ADMIN)
// PATCH /api/tournament-payments/teams/:teamId/approve
// --------------------------------------------------

exports.approveTeam = async (req, res) => {
  try {
    const { teamId } = req.params;

    if (!mongoose.isValidObjectId(teamId)) {
      return sendError(res, 400, "Invalid team ID.");
    }

    const team = await TournamentTeam.findById(teamId);

    if (!team) {
      return sendError(res, 404, "Team not found.");
    }

    if (team.status === "approved") {
      return sendError(res, 400, "Team is already approved.");
    }

    if (team.status !== "pending_approval") {
      return sendError(
        res,
        400,
        "Team must have a verified payment before approval."
      );
    }

    const verifiedPayment = await TournamentPayment.findOne({
      team: team._id,
      tournament: team.tournament,
      status: "verified",
    });

    if (!verifiedPayment) {
      return sendError(
        res,
        400,
        "Cannot approve team without a verified payment."
      );
    }

    team.status = "approved";
    await team.save();

    return res.status(200).json({
      success: true,
      message: "Team approved successfully.",
      team,
      payment: verifiedPayment,
    });
  } catch (error) {
    console.error("Approve team error:", error);
    return sendError(res, 500, "Failed to approve team.");
  }
};

// --------------------------------------------------
// 7. GET PAYMENT DETAILS
// GET /api/tournament-payments/:paymentId
// --------------------------------------------------

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await TournamentPayment.findById(
      req.params.paymentId
    )
      .populate("tournament", "name entryFee")
      .populate("team")
      .populate("payer", "name email")
      .populate("verifiedBy", "name email");

    if (!payment) {
      return sendError(res, 404, "Payment not found.");
    }

    const isOwner =
      String(payment.payer._id) === String(getUserId(req));

    const isTeamCaptain =
      payment.team &&
      String(payment.team.captain) === String(getUserId(req));

    if (!isAdmin(req) && !isOwner && !isTeamCaptain) {
      return sendError(res, 403, "Access denied.");
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("Get payment details error:", error);
    return sendError(res, 500, "Failed to retrieve payment.");
  }
};
