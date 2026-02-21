// server.js
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
const User = require("./models/UserModels"); // Needed for user list + status
const { getUsersFromDB } = require("./controller/UserHelpers");

// ==========================
// Load env variables
// ==========================
dotenv.config();

// ==========================
// Initialize app
// ==========================
const app = express();

// ==========================
// Middleware
// ==========================
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// ==========================
// CORS
// ==========================
// Update the origin to your frontend Railway URL when deploying
const FRONTEND_URL = process.env.FRONTEND_URL || "http://harmonious-meerkat-a1ebc7.netlify.app";
app.use(
  cors({
    origin: [FRONTEND_URL],
    methods: "GET,POST,PUT,DELETE,PATCH,HEAD",
    credentials: true,
  })
);

// ==========================
// Connect DB
// ==========================
connectDB();

// ==========================
// Attach io to requests 🔥
// ==========================
let io; // declared early

app.use((req, res, next) => {
  req.io = io;
  next();
});

// ==========================
// Routes
// ==========================
app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to Game Backend API" });
});

app.use("/api/users", require("./routes/UserRoutes"));
app.use("/api/coins", require("./routes/AccountRoutes"));
app.use("/api/admin", require("./routes/AdminRoutes"));
app.use("/api/feedbacks", require("./routes/FeedbackRoutes"));

// ==========================
// Error Handler
// ==========================
app.use(errorHandler);

// ==========================
// HTTP + Socket.IO
// ==========================
const server = http.createServer(app);

io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    credentials: true,
  },
});

// ==========================
// Admin Namespace 🔥
// ==========================
const adminNamespace = io.of("/admin");

adminNamespace.use(socketAuth);
adminNamespace.use((socket, next) => {
  if (!socket.user?.isAdmin) return next(new Error("Admins only"));
  next();
});

adminNamespace.on("connection", (socket) => {
  console.log(`🖥 Admin ${socket.user.name} connected`);

  // Admin User List Request
  socket.on("admin:getUsers", async () => {
    const users = await getUsersFromDB();
    socket.emit("users:list", users);
  });

  socket.on("disconnect", () => {
    console.log(`🖥 Admin ${socket.user.name} disconnected`);
  });
});

// ==========================
// Main Namespace 🔥
// ==========================
io.use(socketAuth);

io.on("connection", async (socket) => {
  console.log(`🟢 ${socket.user.name} connected`);

  socket.userId = socket.user._id;

  // Mark user online
  await User.findByIdAndUpdate(socket.userId, { online: true });

  // Broadcast status
  io.emit("user:status", { userId: socket.userId, online: true });

  io.of("/admin").emit("activity:event", {
    type: "USER_ONLINE",
    userId: socket.userId,
    username: socket.user.name,
    timestamp: Date.now(),
  });

  // Register game sockets
  registerGameSockets(io, socket);

  socket.on("disconnect", async () => {
    console.log(`🔴 ${socket.user.name} disconnected`);

    await User.findByIdAndUpdate(socket.userId, { online: false });

    io.emit("user:status", { userId: socket.userId, online: false });

    io.of("/admin").emit("activity:event", {
      type: "USER_OFFLINE",
      userId: socket.userId,
      username: socket.user.name,
      timestamp: Date.now(),
    });
  });
});

// ==========================
// START SERVER 🚀
// ==========================
const PORT = process.env.PORT || 5000;

// Important: bind to 0.0.0.0 for Railway
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`.cyan.bold);
});

