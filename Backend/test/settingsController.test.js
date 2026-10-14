const assert = require("node:assert/strict");
const test = require("node:test");
const { buildSettingsUpdate } = require("../src/controllers/settingsController");
const { DEFAULT_SMS_TEMPLATES } = require("../src/models/settings");

const clone = (value) => structuredClone(value);

const applyUpsert = (existing, update) => {
    const result = existing ? clone(existing) : clone(update.$setOnInsert);
    Object.assign(result, clone(update.$set));
    return result;
};

test("adds initial SMS templates without conflicting insert operators", () => {
    const smsTemplates = {
        ...DEFAULT_SMS_TEMPLATES,
        threeDay: "New {name} message for {daysLeft} days"
    };
    const { update, error } = buildSettingsUpdate({ smsTemplates });

    assert.equal(error, undefined);
    assert.deepEqual(update.$set, { smsTemplates });
    assert.deepEqual(update.$setOnInsert, { key: "global" });
    assert.equal(update.$setOnInsert.smsTemplates, undefined);

    const created = applyUpsert(null, update);
    assert.deepEqual(created.smsTemplates, smsTemplates);
});

test("edits an existing SMS template without replacing unrelated settings", () => {
    const existing = {
        key: "global",
        smsTemplates: { ...DEFAULT_SMS_TEMPLATES },
        adminDetails: {
            businessName: "Existing Cable",
            contactNumber: "123",
            villageArea: "Existing Area"
        }
    };
    const smsTemplates = {
        ...existing.smsTemplates,
        twoDay: "Updated {name} template"
    };
    const { update } = buildSettingsUpdate({ smsTemplates });

    const saved = applyUpsert(existing, update);
    assert.equal(saved.smsTemplates.twoDay, "Updated {name} template");
    assert.equal(saved.smsTemplates.threeDay, DEFAULT_SMS_TEMPLATES.threeDay);
    assert.deepEqual(saved.adminDetails, existing.adminDetails);
});

test("admin-only updates preserve existing templates and initialize defaults on insert", () => {
    const adminDetails = {
        businessName: "New Cable",
        contactNumber: "456",
        villageArea: "New Area"
    };
    const { update } = buildSettingsUpdate({ adminDetails });
    const existing = {
        key: "global",
        smsTemplates: { ...DEFAULT_SMS_TEMPLATES, oneDay: "Existing custom template" },
        adminDetails: { businessName: "Old Cable" }
    };

    assert.deepEqual(
        applyUpsert(existing, update).smsTemplates,
        existing.smsTemplates
    );
    assert.deepEqual(
        applyUpsert(null, update).smsTemplates,
        DEFAULT_SMS_TEMPLATES
    );
});
