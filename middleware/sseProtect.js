const jwt = require("jsonwebtoken");
const User = require("../models/UserModels");

const sseProtect = async (
  req,
  res,
  next
) => {
  try {
    const token =
      req.query.token;

    if (!token) {
      return res
        .status(401)
        .end();
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    const user =
      await User.findById(
        decoded.id
      );

    if (!user) {
      return res
        .status(401)
        .end();
    }

    req.user = user;

    next();

  } catch (err) {
    return res
      .status(401)
      .end();
  }
};

module.exports = sseProtect;
