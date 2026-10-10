const mongoose = require("mongoose");

const DEFAULT_SMS_TEMPLATES = {
    threeDay: "Dear {name}, your cable TV recharge will expire in 3 days on {expiryDate}. Please recharge to continue your service.",
    twoDay: "Dear {name}, your cable TV recharge will expire in 2 days on {expiryDate}. Please recharge to continue your service.",
    oneDay: "Dear {name}, your cable TV recharge will expire tomorrow on {expiryDate}. Please recharge to continue your service."
};

const settingsSchema = new mongoose.Schema({
    key: {
        type: String,
        unique: true,
        default: "global"
    },
    smsTemplates: {
        threeDay: { type: String, required: true },
        twoDay: { type: String, required: true },
        oneDay: { type: String, required: true }
    },
    adminDetails: {
        businessName: { type: String, default: "CableConnect" },
        contactNumber: { type: String, default: "" },
        villageArea: { type: String, default: "Village Cable Network" }
    }
});

const Settings = mongoose.model("Settings", settingsSchema);

module.exports = { Settings, DEFAULT_SMS_TEMPLATES };
