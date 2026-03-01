// ==========================
// IMPORTS
// ==========================
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const colors = require("colors");
const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/Db");
const { errorHandler } = require("./middleware/ErrorMiddleware");
const socketAuth = require("./middleware/socketAuth");
const { registerGameSockets } = require("./games/socketHandler");
const User = require("./models/UserModels");
const { getUsersFromDB } = require("./controller/UserHelpers");

// ==========================
// LOAD ENV
// ==========================
dotenv.config();

// ==========================
// INIT EXPRESS
// ==========================
const app = express();

// ==========================
// MIDDLEWARE
// ==========================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ==========================
// CORS
// ==========================
const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://face-rite.onrender.com";

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ==========================
// CONNECT DB
// ==========================
connectDB();

// ==========================
// CREATE SERVER + SOCKET.IO
// ==========================
const server = http.createServer(app);

const io = new Server(server, {
  path: "/socket.io", 
  cors: {
    origin: FRONTEND_URL,
       credentials: true,
  },
  transports: ["websocket", "polling"],
});

// ==========================
// ADMIN NAMESPACE
// ==========================
const adminNamespace = io.of("/admin");

adminNamespace.use(socketAuth);
adminNamespace.use((socket, next) => {
  if (!socket.user?.isAdmin) return next(new Error("Admins only"));
  next();
});

adminNamespace.on("connection", (socket) => {
  console.log(`🖥 Admin ${socket.user.name} connected`);
   registerGameSockets(io, adminNamespace, socket);
    socket.on("admin:getUsers", async () => {
    try {
      const users = await getUsersFromDB();
      socket.emit("users:list", users);
    } catch (err) {
      console.error("Error fetching users for admin:", err);
      socket.emit("error", { message: "Failed to get users" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`🖥 Admin ${socket.user.name} disconnected`);
  });
});

// ==========================
// MAKE IO AVAILABLE IN ROUTES
// ==========================
app.use((req, res, next) => {
  req.io = io;
  req.adminNamespace = adminNamespace;   // ✅ FIX
  next();
});

// ==========================
// HTTP ROUTES
// ==========================
app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to Game Backend API" });
});

app.use("/api/users", require("./routes/UserRoutes"));
app.use("/api/coins", require("./routes/AccountRoutes"));
app.use("/api/admin", require("./routes/AdminRoutes"));
app.use("/api/feedbacks", require("./routes/FeedbackRoutes"));
// app.use("/api/game", require("./routes/GameRoutes"));
// ==========================
// ERROR HANDLER
// ==========================
app.use(errorHandler);

// ==========================
// MAIN NAMESPACE
// ==========================
io.use(socketAuth);

io.on("connection", async (socket) => {
  try {
    console.log(`🟢 ${socket.user.name} connected`);
    socket.userId = socket.user._id;

    // ✅ Mark user online
    await User.findByIdAndUpdate(socket.userId, { online: true });

    io.emit("user:status", {
      userId: socket.userId,
      online: true,
    });

    // ✅ Notify admin dashboard
    adminNamespace.emit("activity:event", {
      type: "USER_ONLINE",
      userId: socket.userId,
      username: socket.user.name,
      timestamp: Date.now(),
    });

    registerGameSockets(io, socket);
  } catch (err) {
    console.error("Error during connection setup:", err);
  }

  socket.on("disconnect", async () => {
    try {
      console.log(`🔴 ${socket.user.name} disconnected`);

      await User.findByIdAndUpdate(socket.userId, { online: false });

      io.emit("user:status", {
        userId: socket.userId,
        online: false,
      });

      adminNamespace.emit("activity:event", {
        type: "USER_OFFLINE",
        userId: socket.userId,
        username: socket.user.name,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error("Error during disconnect:", err);
    }
  });
});

// ==========================
// START SERVER
// ==========================
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`.cyan.bold);
});








