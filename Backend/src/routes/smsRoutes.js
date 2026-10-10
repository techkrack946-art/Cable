const express = require("express");
const { sendSMS } = require("../services/smsService");

const router = express.Router();

router.post("/test", async (req, res) => {
    try {
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                message: "phone and message are required"
            });
        }

        const textBeeResponse = await sendSMS(phone, message);

        return res.status(200).json({
            message: "SMS sent successfully",
            textBeeResponse
        });
    } catch (error) {
        console.error("SMS test request failed:", error.message);
        return res.status(502).json({
            message: "Unable to send SMS"
        });
    }
});

module.exports = router;