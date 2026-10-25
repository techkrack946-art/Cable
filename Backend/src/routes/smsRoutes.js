const express = require("express");
const { sendSMS, SmsServiceError } = require("../services/smsService");
const { createManualSmsController } = require("../controllers/manualSmsController");

const router = express.Router();
const sendManualSms = createManualSmsController();

router.post("/customers/:id/manual", sendManualSms);

router.post("/test", async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                message: "phone and message are required"
            });
        }

        await sendSMS(phone, message);

        return res.status(200).json({
            message: "SMS sent successfully"
        });
    } catch (error) {
        if (error instanceof SmsServiceError) {
            console.error(JSON.stringify({
                event: "sms_test_provider_failed",
                failure: error.code,
                providerStatus: error.statusCode
            }));
            if (error.code === "configuration_missing") {
                return res.status(503).json({ message: "SMS provider is not configured" });
            }
            if (error.code === "provider_rejected") {
                return res.status(502).json({
                    message: "TextBee rejected the SMS request",
                    providerStatus: error.statusCode
                });
            }
            return res.status(502).json({ message: "Unable to reach TextBee" });
        }

        console.error(JSON.stringify({
            event: "sms_test_internal_error",
            errorName: error instanceof Error ? error.name : "UnknownError"
        }));
        return res.status(500).json({ message: "Internal SMS service error" });
    }
});

module.exports = router;