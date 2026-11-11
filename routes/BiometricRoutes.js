const express = require("express");

const {
  enrollBiometrics,
  removeBiometrics,
  loginWithBiometrics,
} = require("../controller/BiometricController");
const { protect } = require("../middleware/AuthMiddleware");

const router = express.Router();

router.post("/enroll", protect, enrollBiometrics);
router.delete("/", protect, removeBiometrics);
router.post("/login", loginWithBiometrics);

module.exports = router;
