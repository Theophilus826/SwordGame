const admin = require("firebase-admin");

const serviceAccount = require("../tinkreward-firebase-adminsdk-fbsvc-54d4ffb421.json");

console.log("FIREBASE INIT TIME:");
console.log("SERVER TIME:", new Date().toISOString());
console.log("EPOCH:", Date.now());

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
