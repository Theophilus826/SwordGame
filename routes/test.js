const express = require("express");
const router = express.Router();
const admin = require("../config/firebase"); // your admin file

router.get("/test-push", async (req, res) => {
  try {
    const response = await admin.messaging().send({
      token: "eca0upjASfSoQc5we4_NdP:APA91bFoLRSPvoYWrTkC46PewpC4xAbErnkJXnGJhfKxWp8Bb7UV6vlQYbezkOxqeSMHfHAyMN06hh4IJpoOM3lg7MjOyIfULS9nm5XdIl_CLJ3S2alosWU",
      notification: {
        title: "Test Push",
        body: "If you see this, FCM works!"
      }
    });

    console.log("FCM SUCCESS:", response);

    res.json({
      success: true,
      response
    });
  } catch (err) {
    console.error("FCM ERROR:", err);

    res.status(500).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }
});

module.exports = router;
