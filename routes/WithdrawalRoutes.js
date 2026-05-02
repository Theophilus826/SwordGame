const express = require("express");
const router = express.Router();

const {
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} = require("../controller/WithdrawalController");

// ===============================
// MIDDLEWARE (adjust to your setup)
// ===============================
const { protect, admin } = require("../middleware/AuthMiddleware");

// ===============================
// USER ROUTES
// ===============================

// Create withdrawal request (USER)
router.post("/request", protect, requestWithdrawal);

// ===============================
// ADMIN ROUTES
// ===============================

// Get all withdrawals (ADMIN)
router.get("/", protect, getWithdrawals);

// Approve withdrawal (ADMIN)
router.put("/approve/:id", protect, approveWithdrawal);

// Reject withdrawal (ADMIN)
router.put("/reject/:id", protect, rejectWithdrawal);

module.exports = router;
