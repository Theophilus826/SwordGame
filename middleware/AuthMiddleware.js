const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/UserModels");

const protect = asyncHandler(async (req, res, next) => {
    let token;

    // 1️⃣ Check cookie first
    if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    // 2️⃣ Fallback to Authorization header
    if (
        !token &&
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
    ) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        res.status(401);
        throw new Error("Not authorized, no token");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    next();
});
// middleware/adminMiddleware.js
// ================= ADMIN AUTH =================
const admin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(403);
        throw new Error("Admin access only");
    }
};

module.exports = { protect, admin };