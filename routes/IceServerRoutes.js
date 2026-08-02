const express = require("express");
const router = express.Router();

const { getIceServers } = require("../controller/IceServers");

router.get("/ice-servers", getIceServers);

module.exports = router;
