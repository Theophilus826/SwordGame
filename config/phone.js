const { parsePhoneNumberFromString } = require("libphonenumber-js");
const crypto = require("crypto");

const formatPhone = (phone) => {
  if (!phone) return null;

  try {
    const phoneNumber = parsePhoneNumberFromString(phone, "NG");

    if (!phoneNumber || !phoneNumber.isValid()) {
      return null;
    }

    return phoneNumber.number;
  } catch {
    return null;
  }
};

const hashPhone = (phone) => {
  return crypto
    .createHash("sha256")
    .update(phone)
    .digest("hex");
};

module.exports = {
  formatPhone,
  hashPhone,
};
