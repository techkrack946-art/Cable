const TEXTBEE_API_BASE_URL = "https://api.textbee.dev/api/v1";

class SmsServiceError extends Error {
    constructor(code, { statusCode } = {}) {
        super(code);
        this.name = "SmsServiceError";
        this.code = code;
        this.statusCode = statusCode;
    }
}

const createSmsService = ({
    environment = process.env,
    fetchImpl = globalThis.fetch
} = {}) => async (phoneNumber, message) => {
    const apiKey = environment.TEXTBEE_API_KEY;
    const deviceId = environment.TEXTBEE_DEVICE_ID;

    if (!apiKey || !deviceId) {
        throw new SmsServiceError("configuration_missing");
    }

    let response;
    try {
        response = await fetchImpl(
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
    } catch {
        throw new SmsServiceError("network_error");
    }

    let responseText;
    try {
        responseText = await response.text();
    } catch {
        throw new SmsServiceError("network_error");
    }
    let responseBody;

    try {
        responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
        responseBody = { message: responseText };
    }

    if (!response.ok) {
        throw new SmsServiceError("provider_rejected", { statusCode: response.status });
    }

    return responseBody;
};

const sendSMS = createSmsService();

module.exports = {
    sendSMS,
    createSmsService,
    SmsServiceError
};