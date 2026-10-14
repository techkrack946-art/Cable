const { Settings, DEFAULT_SMS_TEMPLATES } = require("../models/settings");

const templateFields = ["threeDay", "twoDay", "oneDay"];
const supportedPlaceholders = new Set(["name", "expiryDate", "daysLeft"]);
const DEFAULT_ADMIN_DETAILS = {
    businessName: "CableConnect",
    contactNumber: "",
    villageArea: "Village Cable Network"
};

const completeSettings = async () => {
    let settings = await Settings.findOne({ key: "global" });

    if (!settings) {
        settings = await Settings.create({ key: "global", smsTemplates: DEFAULT_SMS_TEMPLATES });
        return settings;
    }

    const missingTemplates = {};
    templateFields.forEach((field) => {
        if (!settings.smsTemplates?.[field]) {
            missingTemplates[`smsTemplates.${field}`] = DEFAULT_SMS_TEMPLATES[field];
        }
    });

    if (Object.keys(missingTemplates).length) {
        settings = await Settings.findOneAndUpdate(
            { key: "global" },
            { $set: missingTemplates },
            { returnDocument: "after", runValidators: true }
        );
    }

    const missingAdminDetails = {};
    Object.entries(DEFAULT_ADMIN_DETAILS).forEach(([field, value]) => {
        if (typeof settings.adminDetails?.[field] !== "string") {
            missingAdminDetails[`adminDetails.${field}`] = value;
        }
    });

    if (Object.keys(missingAdminDetails).length) {
        settings = await Settings.findOneAndUpdate(
            { key: "global" },
            { $set: missingAdminDetails },
            { returnDocument: "after", runValidators: true }
        );
    }

    return settings;
};

const validateTemplates = (templates) => {
    const errors = {};

    templateFields.forEach((field) => {
        const message = templates?.[field];
        if (typeof message !== "string" || !message.trim()) {
            errors[field] = "Template cannot be empty.";
            return;
        }

        const placeholders = [...message.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
        const unsupported = placeholders.filter((placeholder) => !supportedPlaceholders.has(placeholder));
        if (unsupported.length) {
            errors[field] = `Unsupported placeholder: {${unsupported[0]}}.`;
        }
    });

    return errors;
};

const buildSettingsUpdate = (body) => {
    const updates = {};
    if (body?.smsTemplates) updates.smsTemplates = body.smsTemplates;
    if (body?.adminDetails) {
        const { businessName, contactNumber, villageArea } = body.adminDetails;
        if (![businessName, contactNumber, villageArea].every((value) => typeof value === "string")) {
            return { error: "Admin details must be valid strings" };
        }
        if (!businessName.trim() || !villageArea.trim()) {
            return { error: "Business name and village / area are required" };
        }
        updates.adminDetails = {
            businessName: businessName.trim(),
            contactNumber: contactNumber.trim(),
            villageArea: villageArea.trim()
        };
    }

    if (!Object.keys(updates).length) {
        return { error: "Settings update cannot be empty" };
    }

    const setOnInsert = { key: "global" };
    if (!Object.prototype.hasOwnProperty.call(updates, "smsTemplates")) {
        setOnInsert.smsTemplates = DEFAULT_SMS_TEMPLATES;
    }

    return { update: { $set: updates, $setOnInsert: setOnInsert } };
};

const getSettings = async (req, res) => {
    try {
        const settings = await completeSettings();
        return res.status(200).json({ smsTemplates: settings.smsTemplates, adminDetails: settings.adminDetails });
    } catch (error) {
        console.error("Settings API error:", error);
        return res.status(500).json({ message: "Unable to load settings" });
    }
};

const updateSettings = async (req, res) => {
    const errors = req.body?.smsTemplates ? validateTemplates(req.body.smsTemplates) : {};
    if (Object.keys(errors).length) {
        return res.status(400).json({ message: "Template validation failed", errors });
    }

    const { update, error } = buildSettingsUpdate(req.body);
    if (error) {
        return res.status(400).json({ message: error });
    }

    try {
        const settings = await Settings.findOneAndUpdate(
            { key: "global" },
            update,
            { upsert: true, returnDocument: "after", runValidators: true }
        );
        return res.status(200).json({ message: "Settings saved successfully", smsTemplates: settings.smsTemplates, adminDetails: settings.adminDetails });
    } catch (error) {
        console.error("Settings API error:", error);
        return res.status(500).json({ message: "Unable to save settings" });
    }
};

module.exports = { getSettings, updateSettings, completeSettings, buildSettingsUpdate };
