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
    $or: [
      { status: "PENDING" },
      { reviewStatus: "PENDING_REVIEW" },
    ],
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
  const deposit = await Deposit.findById(req.params.depositId);

  if (!deposit) throw new Error("Deposit not found");

  if (deposit.status !== "PENDING") {
    throw new Error("Already processed");
  }

  // 🔒 REQUIRE RECEIPT
  if (!deposit.receipt) {
    throw new Error("Cannot approve without receipt");
  }

  const amount = deposit.amount || deposit.expectedAmount;

  const result = await updateCoins({
    userId: deposit.user,
    amount,
    type: "DEPOSIT",
    description: "Admin approved deposit",
  });

  deposit.status = "COMPLETED";
  deposit.reviewStatus = "APPROVED";
  deposit.amount = amount;
  deposit.approvedBy = req.user._id;

  await deposit.save();

  // 🔔 REAL-TIME USER UPDATE
  if (req.io) {
    req.io.to(deposit.user.toString()).emit("wallet:update", {
      coins: result.coins,
      depositId: deposit._id,
    });
  }

  res.json({
    message: "Deposit approved",
    coins: result.coins,
    deposit,
  });
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
  adminCreditCoins,
  uploadCarousel,
  getSlides,
  deleteSlide,
  getTactical,
  getTransactions,
};
