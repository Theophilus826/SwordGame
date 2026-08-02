const axios = require("axios");

const getIceServers = async (req, res) => {
  try {
    const domain = process.env.METERED_DOMAIN;
    const apiKey = process.env.METERED_API_KEY;

    if (!domain || !apiKey) {
      return res.status(500).json({
        success: false,
        message: "Metered environment variables are missing.",
      });
    }

    const { data } = await axios.get(
      `https://${domain}/api/v1/turn/credentials`,
      {
        params: {
          apiKey,
        },
      }
    );

    return res.status(200).json({
      success: true,
      iceServers: data,
    });
  } catch (err) {
    console.error("Metered Error:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: err.response?.data?.error || "Failed to load ICE servers",
    });
  }
};

module.exports = {
  getIceServers,
};
