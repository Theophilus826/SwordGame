const jwt = require("jsonwebtoken");
const User = require("../models/UserModels");

const sseProtect = async (req, res, next) => {
  try {
    const token =
      req.query.token ||
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).end();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("_id name");

    if (!user) {
      return res.status(401).end();
    }

    req.user = user;

    return next();
  } catch (err) {
    console.error("SSE AUTH ERROR:", err.message);
    return res.status(401).end();
  }
};

module.exports = sseProtect;
