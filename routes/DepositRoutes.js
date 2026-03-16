const express = require("express");
const { 
  generateDepositAccount, 
  confirmDeposit, 
  getDepositHistory,
  virtualAccountWebhook // ✅ add webhook handler
} = require("../controller/DepositController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================
// Protected frontend routes
// ==========================
router.post("/deposit-account", protect, generateDepositAccount);
router.post("/confirm", protect, confirmDeposit);
router.get("/deposit-history", protect, getDepositHistory);

// ==========================
// Public webhook route (called by PalmPay/XIXAPAY)
// ==========================
router.post("/webhook/virtual-account", virtualAccountWebhook);

module.exports = router;
