const jwt = require("jsonwebtoken");
const User = require("../models/UserModels");

const sseProtect = async (req, res, next) => {
  try {
    const token = req.query?.token;

    // ❌ No token
    if (!token) {
      return res.status(401).end();
    }

    // ✅ Verify JWT safely
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?.id) {
      return res.status(401).end();
    }

    // ✅ Fetch user
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).end();
    }

    // ✅ Attach user to request
    req.user = user;

    // 🔥 IMPORTANT: always return next()
    return next();

  } catch (err) {
    console.error("SSE AUTH ERROR:", err.message);

    return res.status(401).end();
  }
};

module.exports = sseProtect;
