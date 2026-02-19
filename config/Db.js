// config/Db.js
const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB connection failed:`, error.message);
        console.error(`Check your MongoDB URI, cluster status, and IP whitelist.`);
        process.exit(1);
    }
};

module.exports = connectDB;
