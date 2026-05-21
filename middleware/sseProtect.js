const jwt = require("jsonwebtoken");
const User = require("../models/UserModels");

const sseProtect = async (req, res, next) => {
  try {
    let token;

    // normal auth header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // SSE auth
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        error: "No token",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select("-password");

    next();
  } catch (err) {
    console.error("SSE AUTH ERROR:", err);

    return res.status(401).json({
      error: "Unauthorized",
    });
  }
};

module.exports = sseProtect;
