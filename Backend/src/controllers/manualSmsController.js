const mongoose = require("mongoose");
const Customer = require("../models/customer");
const { sendSMS, SmsServiceError } = require("../services/smsService");

const inFlightCustomerIds = new Set();

const logManualSmsEvent = (level, event, details = {}) => {
    console[level](JSON.stringify({ event, ...details }));
};

const normalizePhoneNumber = (phone) => (
    typeof phone === "string" ? phone.trim().replace(/[\s()-]/g, "") : ""
);

const isValidPhoneNumber = (phone) => /^\+?[1-9]\d{7,14}$/.test(phone);

const createManualSmsController = ({
    CustomerModel = Customer,
    sendSms = sendSMS,
    inFlightIds = inFlightCustomerIds
} = {}) => async (req, res) => {
    logManualSmsEvent("info", "manual_sms_request_received");
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
    }

    const message = req.body?.message;
    if (typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "SMS message cannot be empty" });
    }

    if (inFlightIds.has(id)) {
        return res.status(409).json({ message: "An SMS request for this customer is already in progress" });
    }

    inFlightIds.add(id);
    try {
        let customer;
        try {
            customer = await CustomerModel.findById(id);
        } catch (error) {
            console.error("Manual SMS customer lookup failed:", error.name);
            return res.status(500).json({ message: "Unable to load customer" });
        }

        if (!customer) {
            logManualSmsEvent("warn", "manual_sms_customer_not_found");
            return res.status(404).json({ message: "Customer not found" });
        }
        logManualSmsEvent("info", "manual_sms_customer_lookup_succeeded");

        const phoneNumber = normalizePhoneNumber(customer.phone);
        if (!isValidPhoneNumber(phoneNumber)) {
            logManualSmsEvent("warn", "manual_sms_customer_phone_invalid");
            return res.status(400).json({ message: "Customer has an invalid registered phone number" });
        }

        const personalizedMessage = message.trim().replaceAll("{name}", customer.name);
        try {
            await sendSms(phoneNumber, personalizedMessage);
        } catch (error) {
            if (error instanceof SmsServiceError) {
                const providerFailure = error.code === "provider_rejected";
                logManualSmsEvent("error", "manual_sms_provider_failed", {
                    failure: error.code,
                    providerStatus: error.statusCode
                });
                if (error.code === "configuration_missing") {
                    return res.status(503).json({ message: "SMS provider is not configured" });
                }
                if (providerFailure) {
                    return res.status(502).json({
                        message: "TextBee rejected the SMS request",
                        providerStatus: error.statusCode
                    });
                }
                return res.status(502).json({ message: "Unable to reach TextBee" });
            }

            logManualSmsEvent("error", "manual_sms_internal_error", {
                errorName: error instanceof Error ? error.name : "UnknownError"
            });
            return res.status(500).json({ message: "Internal SMS service error" });
        }

        logManualSmsEvent("info", "manual_sms_sent");
        return res.status(200).json({ message: "SMS sent successfully" });
    } finally {
        inFlightIds.delete(id);
    }
};

module.exports = {
    createManualSmsController,
    isValidPhoneNumber,
    normalizePhoneNumber
};
