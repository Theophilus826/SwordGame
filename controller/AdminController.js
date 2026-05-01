// ===============================
// controllers/adminController.js
// ===============================
const asyncHandler = require("express-async-handler");
// MODELS
const User = require("../models/UserModels");
const { updateCoins } = require("./AccountController");
const Deposit = require("../models/DepositModel");
const CoinTransaction = require("../models/CoinTransaction");
const Slide = require("../models/Slide");
const Withdrawal = require("../models/Withdrawal");
// UTILS
const cloudinary = require("../config/Cloudinary");
const { playersByUser } = require("../games/gameState");
// ===============================
// COINS
// ===============================
const adminCreditCoins = asyncHandler(async (req, res) => {
  const { userId, amount, description } = req.body;

  if (!userId) throw new Error("User ID is required");
  if (!amount || amount <= 0) throw new Error("Invalid amount");

  const existingUser = await User.findById(userId);
  if (!existingUser) throw new Error("User not found");

  const balanceBefore = existingUser.coins;

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { coins: amount } },
    { new: true },
  );

  await CoinTransaction.create({
    user: user._id,
    amount,
    type: "ADMIN_CREDIT",
    description: description || "Admin credit",
    balanceBefore,
    balanceAfter: user.coins,
    performedBy: req.user._id,
  });

  res.json({ message: "Coins credited", coins: user.coins });
});

// ===============================
// DEPOSITS
// ===============================

// ✅ GET PENDING + REVIEW
const getPendingDeposits = asyncHandler(async (req, res) => {
  const deposits = await Deposit.find({
    $or: [{ status: "PENDING" }, { reviewStatus: "PENDING_REVIEW" }],
  })
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .lean();

  const formatted = deposits.map((d) => ({
    ...d,
    hasReceipt: !!d.receipt,
    isAwaitingReview: d.reviewStatus === "PENDING_REVIEW",
  }));

  res.json(formatted);
});

// ✅ APPROVE
const approveDeposit = asyncHandler(async (req, res) => {
  try {
    const deposit = await Deposit.findById(req.params.depositId);

    if (!deposit) {
      return res.status(404).json({ message: "Deposit not found" });
    }

    if (deposit.status !== "PENDING") {
      return res.status(400).json({ message: "Already processed" });
    }

    if (!deposit.receipt) {
      return res.status(400).json({ message: "Cannot approve without receipt" });
    }

    const amount = deposit.amount || deposit.expectedAmount;

    // ===============================
    // CREDIT USER (CORE LOGIC)
    // ===============================
    const result = await updateCoins({
      userId: deposit.user.toString(),
      amount,
      type: "DEPOSIT",
      description: "Admin approved deposit",
    });

    // ===============================
    // UPDATE DEPOSIT
    // ===============================
    deposit.status = "COMPLETED";
    deposit.reviewStatus = "APPROVED";
    deposit.amount = amount;
    deposit.approvedBy = req.user._id;

    await deposit.save();

    // ===============================
    // SOCKET UPDATE (SAFE - NO CRASH)
    // ===============================
    if (req.io) {
      setImmediate(() => {
        try {
          const userId =
            typeof deposit.user === "string"
              ? deposit.user
              : deposit.user._id
              ? deposit.user._id.toString()
              : deposit.user.toString();

          req.io.to(userId).emit("wallet:update", {
            coins: result.coins,
            depositId: deposit._id,
          });
        } catch (err) {
          console.error("Socket emit failed (ignored):", err.message);
        }
      });
    }

    // ===============================
    // RESPONSE
    // ===============================
    return res.json({
      message: "Deposit approved",
      coins: result.coins,
      deposit,
    });

  } catch (err) {
    console.error("❌ ApproveDeposit error:", err);
    return res.status(500).json({
      message: err.message || "Internal server error",
    });
  }
});

// ❌ REJECT
const rejectDeposit = asyncHandler(async (req, res) => {
  const deposit = await Deposit.findById(req.params.depositId);

  if (!deposit) throw new Error("Deposit not found");

  if (deposit.status !== "PENDING") {
    throw new Error("Already processed");
  }

  deposit.status = "FAILED";
  deposit.reviewStatus = "REJECTED";
  deposit.rejectionReason = req.body.reason || "Not specified";
  deposit.reviewedBy = req.user._id;

  await deposit.save();

  res.json({
    message: "Deposit rejected",
    deposit,
  });
});

// 👁️ MARK AS READ (for your inbox UI)
const markDepositAsRead = asyncHandler(async (req, res) => {
  const deposit = await Deposit.findById(req.params.depositId);

  if (!deposit) throw new Error("Deposit not found");

  deposit.isRead = true;

  await deposit.save();

  res.json({ message: "Marked as read" });
});

const getTactical = asyncHandler(async (req, res) => {
  const players = [];

  playersByUser.forEach((player) => {
    if (!player.room) return;

    players.push({
      userId: player.userId,
      username: player.username,
      position: player.position,
      health: player.health,
      room: player.room,
    });
  });

  res.status(200).json({ players });
});

const getTransactions = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Number(req.query.limit) || 50);
  const skip = (page - 1) * limit;

  const { search = "", type } = req.query;

  const query = {};

  if (search) {
    query.$or = [
      { referenceId: { $regex: search, $options: "i" } },
      { "user.username": { $regex: search, $options: "i" } },
    ];
  }

  if (type) query.type = type;

  const transactions = await CoinTransaction.find(query)
    .populate("user", "username email")
    .populate("performedBy", "username email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  res.status(200).json({ transactions });
});

const uploadReceipt = asyncHandler(async (req, res) => {
  const { id: userId } = getUserFromRequest(req);
  const { depositId } = req.body;

  if (!depositId) {
    return res.status(400).json({ message: "Deposit ID required" });
  }

  if (!req.file) {
    return res.status(400).json({ message: "No receipt file uploaded" });
  }

  const deposit = await Deposit.findById(depositId);

  if (!deposit) {
    return res.status(404).json({ message: "Deposit not found" });
  }

  // 🔒 Ensure user owns deposit
  if (deposit.user.toString() !== userId.toString()) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  // ❌ Prevent duplicate uploads
  if (deposit.receipt) {
    return res.status(400).json({ message: "Receipt already uploaded" });
  }

  // ✅ SAVE RECEIPT (Cloudinary or local upload)
  deposit.receipt = req.file.path;

  // ✅ FLAG FOR REVIEW
  deposit.reviewStatus = "PENDING_REVIEW";

  await deposit.save();

  // 🔔 notify admin panel
  if (req.io) {
    req.io.emit("admin:new-receipt", {
      depositId: deposit._id,
      userId,
    });
  }

  res.json({
    message: "Receipt uploaded successfully",
    deposit,
  });
});
// ===============================
// ADMIN: GET WITHDRAWAL FEED
// ===============================
const getWithdrawalFeed = asyncHandler(async (req, res) => {
  const { status = "ALL", search = "" } = req.query;

  const query = {};

  // filter by status
  if (status !== "ALL") {
    query.status = status;
  }

  // search filter
  if (search) {
    query.$or = [
      { bankName: { $regex: search, $options: "i" } },
      { accountNumber: { $regex: search, $options: "i" } },
      { amount: Number(search) || 0 },
    ];
  }

  const withdrawals = await Withdrawal.find(query)
    .populate("user", "name email coins")
    .populate("reviewedBy", "name email")
    .sort({ createdAt: -1 })
    .lean();

  const formatted = withdrawals.map((w) => ({
    id: w._id,
    userId: w.user?._id,
    userName: w.user?.name,
    email: w.user?.email,
    amount: w.amount,
    bankName: w.bankName,
    accountNumber: w.accountNumber,
    status: w.status,
    createdAt: w.createdAt,
    reviewedBy: w.reviewedBy?.name || null,
    isPending: w.status === "PENDING",
    isApproved: w.status === "APPROVED",
    isRejected: w.status === "REJECTED",
  }));

  res.json({
    total: formatted.length,
    withdrawals: formatted,
  });
});
// ===============================
// ADMIN: APPROVE WITHDRAWAL
// ===============================
const approveWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    return res.status(404).json({ message: "Withdrawal not found" });
  }

  if (withdrawal.status !== "PENDING") {
    return res.status(400).json({ message: "Already processed" });
  }

  withdrawal.status = "APPROVED";
  withdrawal.reviewedBy = req.user._id;

  await withdrawal.save();

  res.json({
    message: "Withdrawal approved (pay manually)",
    withdrawal,
  });
});

// ===============================
// ADMIN: REJECT WITHDRAWAL (REFUND)
// ===============================
const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const withdrawal = await Withdrawal.findById(req.params.id);

  if (!withdrawal) {
    return res.status(404).json({ message: "Withdrawal not found" });
  }

  if (withdrawal.status !== "PENDING") {
    return res.status(400).json({ message: "Already processed" });
  }

  try {
    const user = await User.findById(withdrawal.user);

    if (user) {
      await updateCoins({
        userId: user._id,
        amount: withdrawal.amount,
        type: "REFUND",
        description: "Withdrawal rejected refund",
        performedBy: req.user._id,
      });
    }

    withdrawal.status = "REJECTED";
    withdrawal.note = reason || "Rejected by admin";
    withdrawal.reviewedBy = req.user._id;

    await withdrawal.save();

    res.json({
      message: "Withdrawal rejected and refunded",
      withdrawal,
    });
  } catch (error) {
    console.error("❌ Reject withdrawal error:", error);

    res.status(500).json({
      message: error.message || "Failed to reject withdrawal",
    });
  }
});
// ===============================
// CAROUSEL
// ===============================
const uploadCarousel = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw new Error("No images uploaded");

  const slides = [];

  for (const file of req.files) {
    const slide = await Slide.create({
      src: file.path,
      public_id: file.filename,
    });
    slides.push(slide);
  }

  res.json({ success: true, count: slides.length, slides });
});

const getSlides = asyncHandler(async (req, res) => {
  const slides = await Slide.find().sort({ createdAt: -1 });
  res.json({ slides });
});

const deleteSlide = asyncHandler(async (req, res) => {
  const slide = await Slide.findById(req.params.id);
  if (!slide) throw new Error("Slide not found");

  if (slide.public_id) {
    try {
      await cloudinary.uploader.destroy(slide.public_id);
    } catch (err) {
      console.error(err.message);
    }
  }

  await slide.deleteOne();

  res.json({ message: "Slide deleted" });
});

module.exports = {
  getPendingDeposits,
  approveDeposit,
  rejectDeposit,
  markDepositAsRead,
  uploadReceipt,
  adminCreditCoins,
  uploadCarousel,
  getSlides,
  deleteSlide,
  getTactical,
  getTransactions,
  getWithdrawalFeed,
  approveWithdrawal,
  rejectWithdrawal,
};
