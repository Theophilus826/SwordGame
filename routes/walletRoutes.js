
const express = require("express");
const router = express.Router();

const {
    initializeWalletFunding,
    verifyWalletFunding,
} = require("../controller/paystackWalletController");

const { protect } = require("../middleware/AuthMiddleware");

router.post("/fund", protect, initializeWalletFunding);
router.post("/verify", protect, verifyWalletFunding);

module.exports = router;
