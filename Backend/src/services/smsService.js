const TEXTBEE_API_BASE_URL = "https://api.textbee.dev/api/v1";

const sendSMS = async (phoneNumber, message) => {
    const apiKey = process.env.TEXTBEE_API_KEY;
    const deviceId = process.env.TEXTBEE_DEVICE_ID;

    if (!apiKey || !deviceId) {
        throw new Error("TextBee configuration is missing");
    }

    const response = await fetch(
        `${TEXTBEE_API_BASE_URL}/gateway/devices/${encodeURIComponent(deviceId)}/sendSMS`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey
            },
            body: JSON.stringify({
                recipients: [phoneNumber],
                message
            })
        }
    );

    const responseText = await response.text();
    let responseBody;

    try {
        responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
        responseBody = { message: responseText };
    }

    if (!response.ok) {
        throw new Error(`TextBee SMS request failed with status ${response.status}`);
    }

    return responseBody;
};

module.exports = {
    sendSMS
};