const User = require("../models/UserModels");

/**
 * Get all users with basic info + online status
 */
async function getUsersFromDB() {
  try {
    const users = await User.find()
      .select("_id name email online coins isAdmin")
      .lean(); // lean() gives plain JS objects
    return users;
  } catch (error) {
    console.error("Error fetching users:", error);
    return [];
  }
}

module.exports = {
  getUsersFromDB,
};
