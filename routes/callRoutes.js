const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/AuthMiddleware");

const { subscribe } = require("../config/sse");

const {
  startCall,
  acceptCall,
  rejectCall,
  cancelCall,
  endCall,
  offer,
  answer,
  ice,
  getCallStatus,
  getRecentCalls,
} = require("../controller/CallController");

/* =========================================================
   CALL MANAGEMENT
========================================================= */

// Start a new call
router.post("/start", protect, startCall);

// Accept an incoming call
router.post("/accept", protect, acceptCall);

// Reject an incoming call
router.post("/reject", protect, rejectCall);

// Cancel before receiver answers
router.post("/cancel", protect, cancelCall);

// End an active call
router.post("/end", protect, endCall);

/* =========================================================
   SERVER-SENT EVENTS (SSE)
========================================================= */

// Subscribe to real-time call events
router.get("/events", protect, subscribe);

/* =========================================================
   CALL HISTORY
========================================================= */

// Get recent calls
router.get("/history", protect, getRecentCalls);

/* =========================================================
   WEBRTC SIGNALING
========================================================= */

// SDP Offer
router.post("/offer", protect, offer);

// SDP Answer
router.post("/answer", protect, answer);

// ICE Candidate
router.post("/ice", protect, ice);

/* =========================================================
   CALL STATUS
   KEEP THIS LAST!
========================================================= */

// Get a specific call
router.get("/:callId", protect, getCallStatus);

module.exports = router;
