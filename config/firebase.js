const admin = require("firebase-admin");

const serviceAccount = require("../tinkreward-firebase-adminsdk-fbsvc-54d4ffb421.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
