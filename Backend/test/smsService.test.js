const assert = require("node:assert/strict");
const test = require("node:test");
const { createSmsService, SmsServiceError } = require("../src/services/smsService");

const providerResponse = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
});

test("uses backend TextBee credentials, configured device, and one-recipient payload", async () => {
    let request;
    let requestCount = 0;
    const sendSMS = createSmsService({
        environment: {
            TEXTBEE_API_KEY: "test-secret-key",
            TEXTBEE_DEVICE_ID: "registered-device-id"
        },
        fetchImpl: async (url, options) => {
            requestCount += 1;
            request = { url, options };
            return providerResponse(200, { success: true });
        }
    });

    await sendSMS("+919876543210", "Hello customer");

    assert.equal(
        request.url,
        "https://api.textbee.dev/api/v1/gateway/devices/registered-device-id/sendSMS"
    );
    assert.equal(request.options.method, "POST");
    assert.equal(requestCount, 1);
    assert.equal(request.options.headers["x-api-key"], "test-secret-key");
    assert.deepEqual(JSON.parse(request.options.body), {
        recipients: ["+919876543210"],
        message: "Hello customer"
    });
});

test("fails with a distinct configuration error when backend TextBee settings are missing", async () => {
    const sendSMS = createSmsService({
        environment: {},
        fetchImpl: async () => {
            assert.fail("TextBee should not be called without configuration");
        }
    });

    await assert.rejects(sendSMS("+919876543210", "Hello"), (error) => (
        error instanceof SmsServiceError && error.code === "configuration_missing"
    ));
});

test("preserves only the TextBee HTTP status for provider rejections", async () => {
    const sendSMS = createSmsService({
        environment: {
            TEXTBEE_API_KEY: "test-secret-key",
            TEXTBEE_DEVICE_ID: "registered-device-id"
        },
        fetchImpl: async () => providerResponse(403, { message: "private provider response" })
    });

    await assert.rejects(sendSMS("+919876543210", "Hello"), (error) => (
        error instanceof SmsServiceError
        && error.code === "provider_rejected"
        && error.statusCode === 403
        && !error.message.includes("private provider response")
    ));
});

test("classifies transport failures separately from provider HTTP errors", async () => {
    const sendSMS = createSmsService({
        environment: {
            TEXTBEE_API_KEY: "test-secret-key",
            TEXTBEE_DEVICE_ID: "registered-device-id"
        },
        fetchImpl: async () => { throw new TypeError("network unavailable"); }
    });

    await assert.rejects(sendSMS("+919876543210", "Hello"), (error) => (
        error instanceof SmsServiceError && error.code === "network_error"
    ));
});
