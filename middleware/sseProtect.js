const express = require("express");
const router = express.Router();

/* ================= CONTROLLER ================= */
const {
  createGroup,
  getMyGroups,
  getGroup,
  sendGroupMessage,
  getGroupMessages,
  addMember,
  removeMember,
  leaveGroup,
  changeRole,
  deleteGroup,
} = require("../controller/GroupController");

/* ================= MIDDLEWARE ================= */
const { protect } = require("../middleware/AuthMiddleware");
const sseProtect = require("../middleware/sseProtect");

const {
  addGroupClient,
  removeGroupClient,
} = require("../config/sse");

/* ================= GROUP CORE ================= */
router.post("/", protect, createGroup);
router.post("/create", protect, createGroup);

router.get("/", protect, getMyGroups);
router.get("/:groupId", protect, getGroup);

router.delete("/:groupId", protect, deleteGroup);

/* ================= GROUP CHAT ================= */
router.post("/send-message", protect, sendGroupMessage);
router.get("/:groupId/messages", protect, getGroupMessages);

/* ================= MEMBERS ================= */
router.post("/:groupId/members", protect, addMember);
router.delete("/:groupId/members/:memberId", protect, removeMember);
router.post("/:groupId/leave", protect, leaveGroup);

router.patch("/:groupId/members/:memberId/role", protect, changeRole);

/* ================= SSE STREAM ================= */
router.get("/stream/:groupId", sseProtect, (req, res) => {
  const { groupId } = req.params;
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).end();
  }

  // 🔥 Prevent Express timeout issues
  req.setTimeout(0);
  res.setTimeout(0);

  /* ================= SSE HEADERS ================= */
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.flushHeaders?.();

  /* ================= REGISTER CLIENT ================= */
  addGroupClient(groupId, userId, res);

  /* ================= INITIAL EVENT ================= */
  res.write(
    `data: ${JSON.stringify({
      type: "connected",
      scope: "group",
      groupId,
      userId,
    })}\n\n`
  );

  /* ================= HEARTBEAT ================= */
  const interval = setInterval(() => {
    safeSseWrite(res, {
      type: "ping",
      scope: "group",
      groupId,
    });
  }, 25000);

  /* ================= CLEANUP ================= */
  const cleanup = () => {
    clearInterval(interval);
    removeGroupClient(groupId, userId, res);
    res.end();
  };

  req.on("close", cleanup);
  req.on("error", cleanup);
  res.on("error", cleanup);
});

/* ================= SAFE SSE WRITE ================= */
function safeSseWrite(res, data) {
  try {
    if (!res || res.writableEnded) return;

    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.error("SSE WRITE ERROR:", err.message);
  }
}

module.exports = router;
