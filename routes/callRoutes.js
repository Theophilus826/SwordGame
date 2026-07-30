const express = require("express");

const router = express.Router();

const { protect } = require("../middleware/AuthMiddleware");

const {
  startCall,
  acceptCall,
  rejectCall,
  endCall,
  offer,
  answer,
  ice,
  cancelCall,
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

// Get current call information
router.get("/:callId", protect, getCallStatus);

/* =========================================================
   WEBRTC SIGNALING
========================================================= */

// SDP Offer
router.post("/offer", protect, offer);

// SDP Answer
router.post("/answer", protect, answer);

// ICE Candidate
router.post("/ice", protect, ice);
router.get("/history", protect, getRecentCalls);

module.exports = router;
