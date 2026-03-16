const express = require("express");
const { register, handleReferral } = require("../controller/ShareControllers");
const { protect } = require("../middleware/AuthMiddleware");

const router = express.Router();

router.post("/register", register);

router.post("/share", protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { referralCode } = req.body;

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message: "No referral code",
      });
    }

    await handleReferral(userId, referralCode);

    res.status(200).json({
      success: true,
      message: "Referral processed successfully",
    });

  } catch (err) {
    console.error("Share Route Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

module.exports = router;
