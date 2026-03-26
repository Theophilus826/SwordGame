const express = require('express');
const router = express.Router();

const {
    creditCoins,
    purchaseItem,
    dailyLoginReward,
    getMyCoins,
    getMyCoinHistory,
    adminCreditCoins,
    creditGameWin,
    transferCoins, // ✅ import the new transfer function
} = require('../controller/AccountController');

const { protect, admin } = require('../middleware/AuthMiddleware');

// ================= USER WALLET =================
router.post('/credit', protect, creditCoins);
router.post('/game-win', protect, creditGameWin);

router.post('/purchase', protect, purchaseItem);

// ✅ New transfer route
router.post('/transfer', protect, transferCoins);

router.get('/balance', protect, getMyCoins);
router.get('/history', protect, getMyCoinHistory);

router.post('/daily-reward', protect, dailyLoginReward);
router.get("/balance", protect, getWalletBalance);
// ================= ADMIN WALLET =================
router.post('/admin/update', protect, admin, adminCreditCoins);

module.exports = router;
