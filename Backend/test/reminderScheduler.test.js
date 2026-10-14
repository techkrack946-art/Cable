const assert = require("node:assert/strict");
const test = require("node:test");
const { createReminderScheduler, getIstDateKey } = require("../src/services/reminderScheduler");

const createRunStore = (records = new Map()) => ({
    records,
    async findOneAndUpdate(filter, update) {
        const record = records.get(filter.runDate);
        if (
            !record
            || record.status !== filter.status
            || (filter.ownerToken && record.ownerToken !== filter.ownerToken)
        ) {
            return null;
        }
        if (
            filter.leaseExpiresAt
            && record.leaseExpiresAt > filter.leaseExpiresAt.$lte
        ) {
            return null;
        }

        Object.assign(record, update.$set);
        if (update.$unset) {
            for (const key of Object.keys(update.$unset)) delete record[key];
        }
        return record;
    },
    async create(record) {
        if (records.has(record.runDate)) {
            const error = new Error("Duplicate run date");
            error.code = 11000;
            throw error;
        }
        records.set(record.runDate, { ...record });
        return records.get(record.runDate);
    },
    async findOne({ runDate }) {
        return records.get(runDate) || null;
    },
    async updateOne(filter, update) {
        const record = records.get(filter.runDate);
        if (!record || record.status !== filter.status || record.ownerToken !== filter.ownerToken) {
            return { modifiedCount: 0 };
        }
        Object.assign(record, update.$set);
        return { modifiedCount: 1 };
    }
});

const createHarness = ({
    currentTime,
    records = new Map(),
    runReminders,
    leaseDurationMs,
    now
}) => {
    let smsDeliveryCount = 0;
    const smsDelivery = async () => {
        smsDeliveryCount += 1;
    };
    const executeReminders = runReminders || (async () => smsDelivery());
    const logger = { log() {}, warn() {}, error() {} };
    const scheduler = createReminderScheduler({
        DailyReminderRun: createRunStore(records),
        runReminders: executeReminders,
        now: now || (() => new Date(currentTime)),
        logger,
        leaseDurationMs
    });

    return {
        scheduler,
        records,
        getSmsDeliveryCount: () => smsDeliveryCount
    };
};

test("startup before 09:00 IST waits for the cron schedule", async () => {
    const harness = createHarness({ currentTime: "2026-10-14T03:29:59.000Z" });

    assert.deepEqual(await harness.scheduler.recoverOnStartup(), { status: "not-due" });
    assert.equal(harness.getSmsDeliveryCount(), 0);
    assert.equal(harness.records.size, 0);
});

test("startup after 09:00 IST recovers today's missed run once", async () => {
    const harness = createHarness({ currentTime: "2026-10-14T04:00:00.000Z" });

    assert.deepEqual(await harness.scheduler.recoverOnStartup(), { status: "completed" });
    assert.equal(harness.getSmsDeliveryCount(), 1);
    assert.equal(harness.records.get("2026-10-14").status, "completed");
});

test("repeated restarts do not rerun a completed day", async () => {
    const records = new Map();
    const firstProcess = createHarness({ currentTime: "2026-10-14T04:00:00.000Z", records });
    const restartedProcess = createHarness({ currentTime: "2026-10-14T05:00:00.000Z", records });

    assert.deepEqual(await firstProcess.scheduler.recoverOnStartup(), { status: "completed" });
    assert.deepEqual(await restartedProcess.scheduler.recoverOnStartup(), { status: "already-completed" });
    assert.equal(firstProcess.getSmsDeliveryCount(), 1);
    assert.equal(restartedProcess.getSmsDeliveryCount(), 0);
    assert.equal(records.get("2026-10-14").status, "completed");
});

test("an already-completed daily run is not repeated", async () => {
    const records = new Map([[
        "2026-10-14",
        {
            runDate: "2026-10-14",
            status: "completed",
            ownerToken: "previous-run",
            startedAt: new Date("2026-10-14T03:30:00.000Z"),
            completedAt: new Date("2026-10-14T03:31:00.000Z")
        }
    ]]);
    const harness = createHarness({ currentTime: "2026-10-14T05:00:00.000Z", records });

    assert.deepEqual(await harness.scheduler.recoverOnStartup(), { status: "already-completed" });
    assert.equal(harness.getSmsDeliveryCount(), 0);
});

test("an expired in-progress run is recovered after a restart", async () => {
    const records = new Map([[
        "2026-10-14",
        {
            runDate: "2026-10-14",
            status: "running",
            ownerToken: "stopped-process",
            startedAt: new Date("2026-10-14T03:30:00.000Z"),
            leaseExpiresAt: new Date("2026-10-14T03:35:00.000Z")
        }
    ]]);
    const harness = createHarness({ currentTime: "2026-10-14T04:00:00.000Z", records });

    assert.deepEqual(await harness.scheduler.recoverOnStartup(), { status: "completed" });
    assert.equal(harness.getSmsDeliveryCount(), 1);
    assert.equal(records.get("2026-10-14").status, "completed");
});

test("startup retries an active claim after its lease expires", async () => {
    const startupTime = new Date("2026-10-14T04:00:00.000Z");
    const realStart = Date.now();
    const now = () => new Date(startupTime.getTime() + Date.now() - realStart);
    const runDate = getIstDateKey(startupTime);
    const records = new Map([[
        runDate,
        {
            runDate,
            status: "running",
            ownerToken: "previous-process",
            startedAt: new Date(startupTime.getTime() - 1000),
            leaseExpiresAt: new Date(startupTime.getTime() + 100)
        }
    ]]);
    const harness = createHarness({
        currentTime: startupTime,
        records,
        leaseDurationMs: 1000,
        now
    });

    assert.equal((await harness.scheduler.recoverOnStartup()).status, "already-claimed");
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(harness.getSmsDeliveryCount(), 1);
    assert.equal(records.get(runDate).status, "completed");
});

test("overlapping same-process triggers do not execute reminders twice", async () => {
    let releaseExecution;
    let executionStarted;
    const executionStartedPromise = new Promise((resolve) => {
        executionStarted = resolve;
    });
    const blockedExecution = new Promise((resolve) => {
        releaseExecution = resolve;
    });
    const harness = createHarness({
        currentTime: "2026-10-14T04:00:00.000Z",
        runReminders: async () => {
            executionStarted();
            await blockedExecution;
        }
    });

    const firstRun = harness.scheduler.recoverOnStartup();
    await executionStartedPromise;
    assert.deepEqual(await harness.scheduler.runScheduled(), { status: "overlapping" });
    releaseExecution();
    assert.deepEqual(await firstRun, { status: "completed" });
    assert.equal(harness.records.get("2026-10-14").status, "completed");
});
