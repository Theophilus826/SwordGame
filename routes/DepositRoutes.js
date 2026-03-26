const express = require("express");
const { 
  generateDepositAccount, 
  confirmDeposit, 
  getDepositHistory,
  virtualAccountWebhook // ✅ add webhook handler
} = require("../controller/DepositController");
const {getWalletBalance} = require("../controller/AccountController");
const { protect } = require("../middleware/AuthMiddleware");

const router = express.Router();

// ==========================
// Protected frontend routes
// ==========================
router.post("/deposit-account", protect, generateDepositAccount);
router.post("/confirm", protect, confirmDeposit);
router.get("/deposit-history", protect, getDepositHistory);
router.get("/balance", protect, getWalletBalance);
// ==========================
// Public webhook route (called by PalmPay/XIXAPAY)
// ==========================
router.post("/webhook/virtual-account", virtualAccountWebhook);

module.exports = router;
