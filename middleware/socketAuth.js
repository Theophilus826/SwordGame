const jwt = require("jsonwebtoken");
const User = require("../models/UserModels");

/**
 * Socket.IO authentication middleware
 * Supports:
 * 1. Cookie-based token: `token=<JWT>`
 * 2. Auth object token: `socket.handshake.auth.token`
 * 3. Authorization header (optional)
 */
const socketAuth = async (socket, next) => {
  try {
    let token;

    // ========================
    // 1️⃣ Check cookies
    // ========================
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const cookies = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .reduce((acc, c) => {
          const [key, val] = c.split("=");
          acc[key] = val;
          return acc;
        }, {});
      if (cookies.token) token = cookies.token;
    }

    // ========================
    // 2️⃣ Check auth payload (preferred for Socket.IO)
    // ========================
    if (!token && socket.handshake.auth?.token) {
      token = socket.handshake.auth.token;
    }

    // ========================
    // 3️⃣ Check Authorization header (Bearer)
    // ========================
    if (!token && socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }

    if (!token) {
      return next(new Error("Not authorized: No token provided"));
    }

    // ========================
    // 4️⃣ Verify JWT
    // ========================
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ========================
    // 5️⃣ Fetch user
    // ========================
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return next(new Error("Not authorized: User not found"));
    }

    // ========================
    // 6️⃣ Attach user to socket
    // ========================
    socket.user = user;

    next();
  } catch (err) {
    console.error("Socket authentication error:", err.message);
    next(new Error("Authentication failed"));
  }
};

module.exports = socketAuth;
