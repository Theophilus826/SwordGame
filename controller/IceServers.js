const axios = require("axios");

const getIceServers = async (req, res) => {
  try {
    const { data } = await axios.get(
      `https://${process.env.METERED_DOMAIN}/api/v1/turn/credentials`,
      {
        params: {
          apiKey: process.env.METERED_SECRET_KEY,
        },
      },
    );

    return res.json({
      success: true,
      iceServers: data,
    });
  } catch (err) {
    console.error(err.response?.data || err);

    return res.status(500).json({
      success: false,
      message: "Failed to load ICE servers",
    });
  }
};

module.exports = {
  getIceServers,
};
