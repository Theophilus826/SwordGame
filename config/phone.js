const { parsePhoneNumberFromString } = require("libphonenumber-js");

// 🇳🇬 Normalize Nigerian numbers
const formatPhone = (phone) => {
  if (!phone) return null;

  try {
    const phoneNumber = parsePhoneNumberFromString(phone, "NG");

    if (!phoneNumber || !phoneNumber.isValid()) {
      return null;
    }

    return phoneNumber.number; // returns +234 format
  } catch (err) {
    return null;
  }
};

module.exports = { formatPhone };
