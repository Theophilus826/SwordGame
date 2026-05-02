const express = require("express");
const router = express.Router();

const {
  requestWithdrawal,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} = require("../controller/WithdrawalController");

// ===============================v
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
router.get("/", protect, admin, getWithdrawals);

// Approve withdrawal (ADMIN)
router.put("/approve/:id", protect, admin, approveWithdrawal);

// Reject withdrawal (ADMIN)
router.put("/reject/:id", protect, admin, rejectWithdrawal);

module.exports = router;
