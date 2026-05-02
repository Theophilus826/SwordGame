const express = require("express");
const router = express.Router();

const { requestWithdrawal } = require("../controller/WithdrawalController");

const { protect } = require("../middleware/AuthMiddleware");

// USER ONLY
router.post("/request", protect, requestWithdrawal);

module.exports = router;
