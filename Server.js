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
const Message = require("./models/Message");
const { getUsersFromDB } = require("./controller/UserHelpers");
const ChatRoutes = require("./routes/ChatRoutes");
const WithdrawalRoutes = require("./routes/WithdrawalRoutes");
const GroupRoute = require("./routes/GroupRoute");
const admin = require("./config/firebase");
const { registerBubbleSockets } = require("./games/BubbleSocket");

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
const allowedOrigins = [
  "https://face-rite.onrender.com",
  "capacitor://localhost",
  "http://localhost",
  "https://localhost",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin?.includes("onrender.com")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Origin",
    "Accept",
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));


app.use((req, res, next) => {
  const contentLength = req.headers["content-length"];

  if (contentLength && Number(contentLength) > 300 * 1024 * 1024) {
    return res.status(413).json({
      message: "File too large. Max 300MB allowed."
    });
  }

  next();
});
// ==========================
// CONNECT DB
// ==========================
connectDB();

// ==========================
// CREATE SERVER
// ==========================
const server = http.createServer(app);

// ==========================
// SOCKET.IO
// ==========================
const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin?.includes("onrender.com")
      ) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by Socket.IO CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// ==========================
// ADMIN NAMESPACE
// ==========================
const adminNamespace = io.of("/admin");

adminNamespace.use(socketAuth);

adminNamespace.use((socket, next) => {
  if (!socket.user?.isAdmin) {
    return next(new Error("Admins only"));
  }
  next();
});

adminNamespace.on("connection", (socket) => {
  console.log(`🖥 Admin ${socket.user.name} connected`);

  // Register admin game sockets
  registerGameSockets(io, adminNamespace, socket);

  socket.on("admin:getUsers", async () => {
    try {
      const users = await getUsersFromDB();
      socket.emit("users:list", users);
    } catch (err) {
      console.error("Admin users fetch error:", err);
      socket.emit("error", { message: "Failed to get users" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`🖥 Admin ${socket.user.name} disconnected`);
  });
});

// ==========================
// MAKE SOCKET AVAILABLE IN ROUTES
// ==========================
app.use((req, res, next) => {
  req.io = io;
  req.adminNamespace = adminNamespace;
  next();
});

// ==========================
// ROUTES
// ==========================
app.get("/", (req, res) => {
  res.status(200).json({ message: "Welcome to Game Backend API" });
});

app.use("/api/users", require("./routes/UserRoutes"));
app.use("/api/coins", require("./routes/AccountRoutes"));
app.use("/api/admin", require("./routes/AdminRoutes"));
app.use("/api/feedbacks", require("./routes/FeedbackRoutes"));
app.use("/api/post", require("./routes/PostRoute"));
app.use("/api/auth", require("./routes/ShareRoute"));
// app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use("/api/notifications", require("./routes/NotificationRoute"));
app.use("/api/wallet", require("./routes/DepositRoutes"));
app.use("/api/chat", ChatRoutes);
app.use("/api/withdrawals", WithdrawalRoutes);
app.use("/api/group", GroupRoute);
app.use("/api/bubble", require("./routes/BubbleRoutes"));

// Route to get posts by a specific user

// ==========================
// ERROR HANDLER
// ==========================
app.use(errorHandler);

// ==========================
// MAIN SOCKET
// ==========================
io.use(socketAuth);

io.on("connection", async (socket) => {
  connect(socket);
  try {
    console.log(`🟢 ${socket.user.name} connected`);

    socket.userId = socket.user._id;

    // join private user room
    socket.join(socket.userId.toString());

    // mark user online
    await User.findByIdAndUpdate(socket.userId, { online: true });

    io.emit("user:status", { userId: socket.userId, online: true });

    // notify admin dashboard
    adminNamespace.emit("activity:event", {
      type: "USER_ONLINE",
      userId: socket.userId,
      username: socket.user.name,
      timestamp: Date.now(),
    });

    // register game sockets
    registerGameSockets(io, adminNamespace, socket);
    registerBubbleSockets(io, socket);
    // ==========================
    // USER CHAT
    // ==========================
  } catch (err) {
    console.error("Socket connection setup error:", err);
  }

  const testFirebase = async () => {
    try {
      const res = await admin.messaging().send({
        token: "test-token",
        notification: {
          title: "Test",
          body: "Firebase Admin works",
        },
      });

      console.log("🔥 Firebase message sent:", res);
    } catch (err) {
      console.error("❌ Firebase error:", err);
    }
  };

  // call manually (ONLY when needed)
  testFirebase();
  // ==========================
  // DISCONNECT
  // ==========================
  socket.on("disconnect", async () => {
    try {
      console.log(`🔴 ${socket.user.name} disconnected`);

      await User.findByIdAndUpdate(socket.userId, { online: false });

      io.emit("user:status", { userId: socket.userId, online: false });

      adminNamespace.emit("activity:event", {
        type: "USER_OFFLINE",
        userId: socket.userId,
        username: socket.user.name,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error("Disconnect error:", err);
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
