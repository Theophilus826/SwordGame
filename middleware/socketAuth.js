const jwt = require("jsonwebtoken");
const User = require("../models/UserModels");

const socketAuth = async (socket, next) => {
    try {
        let token;

        // 1️⃣ Cookie (same as HTTP)
        if (socket.handshake.headers.cookie) {
            const cookies = socket.handshake.headers.cookie
                .split(";")
                .map(c => c.trim());

            const tokenCookie = cookies.find(c => c.startsWith("token="));
            if (tokenCookie) {
                token = tokenCookie.split("=")[1];
            }
        }

        // 2️⃣ Authorization header
        if (
            !token &&
            socket.handshake.auth &&
            socket.handshake.auth.token
        ) {
            token = socket.handshake.auth.token;
        }

        if (!token) {
            return next(new Error("Not authorized"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password");
        if (!user) {
            return next(new Error("User not found"));
        }

        // 🔥 Attach user to socket
        socket.user = user;

        next();
    } catch (err) {
        next(new Error("Authentication failed"));
    }
};

module.exports = socketAuth;
