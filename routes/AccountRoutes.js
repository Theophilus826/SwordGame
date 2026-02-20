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
} = require('../controller/AccountController');

const { protect, admin } = require('../middleware/AuthMiddleware');


// ================= USER WALLET =================
router.post('/credit', protect, creditCoins);
router.post('/game-win', protect, creditGameWin);

router.post('/purchase', protect, purchaseItem);

router.get('/balance', protect, getMyCoins);
router.get('/history', protect, getMyCoinHistory);

router.post('/daily-reward', protect, dailyLoginReward);

// ================= ADMIN WALLET =================
router.post('/admin/update', protect, admin, adminCreditCoins);

module.exports = router;

