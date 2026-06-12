const admin = require("firebase-admin");

const serviceAccount = require("../tinkreward-firebase-adminsdk-fbsvc-d783b46028.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
