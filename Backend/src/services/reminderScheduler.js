const { randomUUID } = require("node:crypto");

const IST_TIMEZONE = "Asia/Kolkata";
const SCHEDULE_HOUR = 9;
const SCHEDULE_MINUTE = 0;
const REMINDER_CRON_EXPRESSION = "0 9 * * *";
const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;

const formatIstDateTime = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}+05:30`;
};

const logEvent = (logger, level, event, details = {}) => {
    const log = logger[level] || logger.log;
    log.call(logger, JSON.stringify({ event, ...details }));
};

const getIstDateKey = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return `${values.year}-${values.month}-${values.day}`;
};

const isReminderTimeReached = (date) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: IST_TIMEZONE,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const hour = Number(values.hour);
    const minute = Number(values.minute);

    return hour > SCHEDULE_HOUR || (hour === SCHEDULE_HOUR && minute >= SCHEDULE_MINUTE);
};

const createReminderScheduler = ({
    DailyReminderRun,
    runReminders,
    now = () => new Date(),
    logger = console,
    leaseDurationMs = DEFAULT_LEASE_DURATION_MS
}) => {
    let executionInProgress = false;

    const runForDate = async (runDate, trigger = "scheduled") => {
        if (executionInProgress) {
            logEvent(logger, "warn", "reminder_run_skipped", { reason: "process_overlap" });
            return { status: "overlapping" };
        }

        executionInProgress = true;
        const ownerToken = randomUUID();
        const startedAt = now();
        const leaseExpiresAt = new Date(startedAt.getTime() + leaseDurationMs);
        let runClaimed = false;

        try {
            const expiredRun = await DailyReminderRun.findOneAndUpdate(
                {
                    runDate,
                    status: "running",
                    leaseExpiresAt: { $lte: startedAt }
                },
                {
                    $set: { ownerToken, leaseExpiresAt, startedAt }
                },
                { returnDocument: "after" }
            );

            if (expiredRun) {
                runClaimed = true;
            } else {
                try {
                    await DailyReminderRun.create({
                        runDate,
                        status: "running",
                        ownerToken,
                        leaseExpiresAt,
                        startedAt
                    });
                    runClaimed = true;
                } catch (error) {
                    if (error.code !== 11000) {
                        throw error;
                    }
                }
            }

            if (!runClaimed) {
                const existingRun = await DailyReminderRun.findOne({ runDate });
                const status = existingRun?.status === "completed" ? "already-completed" : "already-claimed";
                logEvent(logger, "log", "reminder_run_skipped", { runDate, status });
                return status === "already-claimed"
                    ? { status, retryAt: existingRun?.leaseExpiresAt }
                    : { status };
            }

            logEvent(logger, "log", "reminder_run_started", {
                runDate,
                startedAtIST: formatIstDateTime(startedAt),
                trigger
            });
            let leaseLost = false;
            const heartbeat = setInterval(async () => {
                try {
                    const result = await DailyReminderRun.updateOne(
                        { runDate, status: "running", ownerToken },
                        { $set: { leaseExpiresAt: new Date(now().getTime() + leaseDurationMs) } }
                    );
                    if (result.modifiedCount !== 1) {
                        leaseLost = true;
                        logEvent(logger, "error", "reminder_run_lease_lost", { runDate });
                    }
                } catch (error) {
                    leaseLost = true;
                    logEvent(logger, "error", "reminder_run_lease_renewal_failed", {
                        runDate,
                        error: error.name
                    });
                }
            }, Math.max(1000, Math.floor(leaseDurationMs / 3)));
            heartbeat.unref?.();

            try {
                await runReminders({
                    runDate,
                    startedAt,
                    startedAtIST: formatIstDateTime(startedAt)
                });
                if (leaseLost) {
                    throw new Error("Reminder run lease was lost before completion");
                }

                const completedAt = now();
                const completion = await DailyReminderRun.findOneAndUpdate(
                    { runDate, status: "running", ownerToken },
                    { $set: { status: "completed", completedAt, leaseExpiresAt: completedAt } },
                    { returnDocument: "after" }
                );
                if (!completion) {
                    throw new Error("Reminder run ownership was lost before completion");
                }

                logEvent(logger, "log", "reminder_run_completed", {
                    runDate,
                    completedAtIST: formatIstDateTime(completedAt)
                });
                return { status: "completed" };
            } catch (error) {
                await DailyReminderRun.updateOne(
                    { runDate, status: "running", ownerToken },
                    { $set: { leaseExpiresAt: now() } }
                );
                logEvent(logger, "error", "reminder_run_failed", {
                    runDate,
                    error: error.name
                });
                throw error;
            } finally {
                clearInterval(heartbeat);
            }
        } finally {
            executionInProgress = false;
        }
    };

    const recoverRun = async (runDate) => {
        const result = await runForDate(runDate, "startup_recovery");
        if (result.status === "already-claimed" && result.retryAt) {
            const retryDelay = Math.max(0, new Date(result.retryAt).getTime() - now().getTime()) + 50;
            const retry = setTimeout(() => {
                recoverRun(runDate).catch((error) => {
                    logEvent(logger, "error", "startup_reminder_recovery_retry_failed", {
                        runDate,
                        error: error.name
                    });
                });
            }, retryDelay);
            retry.unref?.();
        }
        return result;
    };

    const recoverOnStartup = async () => {
        const startupTime = now();
        if (!isReminderTimeReached(startupTime)) {
            logEvent(logger, "log", "reminder_startup_recovery_skipped", {
                reason: "before_scheduled_time",
                checkedAtIST: formatIstDateTime(startupTime)
            });
            return { status: "not-due" };
        }

        const result = await recoverRun(getIstDateKey(startupTime));
        if (result.status !== "already-claimed") {
            logEvent(logger, "log", "reminder_startup_recovery_checked", {
                runDate: getIstDateKey(startupTime),
                status: result.status,
                checkedAtIST: formatIstDateTime(startupTime)
            });
        }
        return result;
    };

    const runScheduled = async () => runForDate(getIstDateKey(now()));

    return { recoverOnStartup, runScheduled };
};

module.exports = {
    createReminderScheduler,
    formatIstDateTime,
    getIstDateKey,
    isReminderTimeReached,
    IST_TIMEZONE,
    REMINDER_CRON_EXPRESSION
};
