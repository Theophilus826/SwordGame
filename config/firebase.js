const admin = require("firebase-admin");

const serviceAccount = require("../tinkreward-firebase-adminsdk-fbsvc-c9767369d6.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
