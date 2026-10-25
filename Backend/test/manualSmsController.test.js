const assert = require("node:assert/strict");
const test = require("node:test");
const { createManualSmsController } = require("../src/controllers/manualSmsController");
const { SmsServiceError } = require("../src/services/smsService");

const customerId = "507f1f77bcf86cd799439011";
const makeResponse = () => ({
    statusCode: 200,
    body: undefined,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(body) {
        this.body = body;
        return this;
    }
});

const makeRequest = (overrides = {}) => ({
    params: { id: customerId },
    body: { message: "Hello {name}" },
    ...overrides
});

const makeHandler = ({ customer, sendSms = async () => {}, inFlightIds = new Set() } = {}) => {
    const lookups = [];
    const handler = createManualSmsController({
        CustomerModel: {
            findById: async (id) => {
                lookups.push(id);
                return customer;
            }
        },
        sendSms,
        inFlightIds
    });
    return { handler, lookups };
};

test("sends one personalized SMS only to the selected customer's registered number", async () => {
    const calls = [];
    const customer = { name: "Ravi Kumar", phone: "+91 98765-43210" };
    const { handler, lookups } = makeHandler({
        customer,
        sendSms: async (...args) => calls.push(args)
    });
    const response = makeResponse();

    await handler(makeRequest({
        body: { message: "Hello {name}", phone: "+1 555 0100" }
    }), response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.message, "SMS sent successfully");
    assert.deepEqual(lookups, [customerId]);
    assert.deepEqual(calls, [["+919876543210", "Hello Ravi Kumar"]]);
});

test("rejects an invalid customer ID without looking up or sending", async () => {
    const calls = [];
    const { handler, lookups } = makeHandler({
        customer: { name: "Ravi", phone: "9876543210" },
        sendSms: async (...args) => calls.push(args)
    });
    const response = makeResponse();

    await handler(makeRequest({ params: { id: "invalid" } }), response);

    assert.equal(response.statusCode, 400);
    assert.deepEqual(lookups, []);
    assert.deepEqual(calls, []);
});

test("does not send when the customer does not exist", async () => {
    const calls = [];
    const { handler } = makeHandler({ customer: null, sendSms: async (...args) => calls.push(args) });
    const response = makeResponse();

    await handler(makeRequest(), response);

    assert.equal(response.statusCode, 404);
    assert.deepEqual(calls, []);
});

test("rejects invalid registered phone numbers and empty messages", async () => {
    const calls = [];
    const invalidPhone = makeHandler({
        customer: { name: "Ravi", phone: "not-a-number" },
        sendSms: async (...args) => calls.push(args)
    });
    const invalidPhoneResponse = makeResponse();
    await invalidPhone.handler(makeRequest(), invalidPhoneResponse);

    const validPhone = makeHandler({
        customer: { name: "Ravi", phone: "9876543210" },
        sendSms: async (...args) => calls.push(args)
    });
    const emptyMessageResponse = makeResponse();
    await validPhone.handler(makeRequest({ body: { message: "  " } }), emptyMessageResponse);

    assert.equal(invalidPhoneResponse.statusCode, 400);
    assert.equal(emptyMessageResponse.statusCode, 400);
    assert.deepEqual(calls, []);
});

test("returns a gateway error when TextBee fails", async () => {
    const { handler } = makeHandler({
        customer: { name: "Ravi", phone: "9876543210" },
        sendSms: async () => { throw new SmsServiceError("provider_rejected", { statusCode: 401 }); }
    });
    const response = makeResponse();

    await handler(makeRequest(), response);

    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.body, {
        message: "TextBee rejected the SMS request",
        providerStatus: 401
    });
});

test("reports missing TextBee configuration separately from a provider rejection", async () => {
    const { handler } = makeHandler({
        customer: { name: "Ravi", phone: "9876543210" },
        sendSms: async () => { throw new SmsServiceError("configuration_missing"); }
    });
    const response = makeResponse();

    await handler(makeRequest(), response);

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { message: "SMS provider is not configured" });
});

test("returns an internal error instead of misreporting unexpected exceptions as TextBee 502s", async () => {
    const { handler } = makeHandler({
        customer: { name: "Ravi", phone: "9876543210" },
        sendSms: async () => { throw new TypeError("unexpected implementation failure"); }
    });
    const response = makeResponse();

    await handler(makeRequest(), response);

    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { message: "Internal SMS service error" });
});

test("rejects duplicate in-flight requests for the same customer", async () => {
    let finishCustomerLookup;
    const customerLookup = new Promise((resolve) => { finishCustomerLookup = resolve; });
    const calls = [];
    const handler = createManualSmsController({
        CustomerModel: {
            findById: async () => customerLookup
        },
        sendSms: async (...args) => {
            calls.push(args);
        }
    });
    const firstResponse = makeResponse();
    const duplicateResponse = makeResponse();
    const firstRequest = handler(makeRequest(), firstResponse);
    await handler(makeRequest(), duplicateResponse);
    finishCustomerLookup({ name: "Ravi", phone: "9876543210" });
    await firstRequest;

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(duplicateResponse.statusCode, 409);
    assert.equal(calls.length, 1);
});
