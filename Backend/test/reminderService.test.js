const assert = require("node:assert/strict");
const test = require("node:test");
const { getReminderForExpiry } = require("../src/services/reminderService");

const today = new Date("2026-10-14T06:00:00.000Z");

test("matches an expiry three IST calendar days away", () => {
    assert.equal(
        getReminderForExpiry(new Date("2026-10-17T00:00:00.000Z"), today)?.field,
        "threeDay"
    );
});

test("matches expiries two and one IST calendar days away", () => {
    assert.equal(
        getReminderForExpiry(new Date("2026-10-16T00:00:00.000Z"), today)?.field,
        "twoDay"
    );
    assert.equal(
        getReminderForExpiry(new Date("2026-10-15T00:00:00.000Z"), today)?.field,
        "oneDay"
    );
});

test("uses IST calendar dates rather than elapsed 24-hour periods", () => {
    const expiryAtStartOfIstDay = new Date("2026-10-15T18:30:00.000Z");
    assert.equal(
        getReminderForExpiry(expiryAtStartOfIstDay, today)?.field,
        "twoDay"
    );
});

test("does not make reminders eligible for past, same-day, or later expiries", () => {
    for (const expiryDate of [
        new Date("2026-10-13T00:00:00.000Z"),
        new Date("2026-10-14T00:00:00.000Z"),
        new Date("2026-10-18T00:00:00.000Z")
    ]) {
        assert.equal(getReminderForExpiry(expiryDate, today), null);
    }
});

test("does not re-qualify a reminder whose existing notification flag is set", () => {
    assert.equal(
        getReminderForExpiry(
            new Date("2026-10-17T00:00:00.000Z"),
            today,
            { threeDay: true }
        ),
        null
    );
});

test("ignores invalid expiry dates", () => {
    assert.equal(getReminderForExpiry(new Date("invalid"), today), null);
});
