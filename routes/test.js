const express = require("express");
const router = express.Router();
const admin = require("../config/firebase"); // your admin file

router.get("/test-push", async (req, res) => {
  try {
    const result = await admin.messaging().send({
      token: "eca0upjASfSoQc5we4_NdP:APA91bFoLRSPvoYWrTkC46PewpC4xAbErnkJXnGJhfKxWp8Bb7UV6vlQYbezkOxqeSMHfHAyMN06hh4IJpoOM3lg7MjOyIfULS9nm5XdIl_CLJ3S2alosWU",

      notification: {
        title: "Test Notification",
        body: "If you see this, Firebase works",
      },

      android: {
        priority: "high",
      },
    });

    console.log(result);

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
});
    res.status(500).json({
      success: false,
      error: err.message,
      code: err.code
    });
  }
});

module.exports = router;
