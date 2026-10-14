const { randomUUID } = require("node:crypto");

const IST_TIMEZONE = "Asia/Kolkata";
const SCHEDULE_HOUR = 9;
const SCHEDULE_MINUTE = 0;
const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;

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

    const runForDate = async (runDate) => {
        if (executionInProgress) {
            logger.warn("Reminder run skipped: another run is active in this process");
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
                logger.log(`Reminder run for ${runDate} skipped (${status})`);
                return status === "already-claimed"
                    ? { status, retryAt: existingRun?.leaseExpiresAt }
                    : { status };
            }

            logger.log(`Reminder run claimed for ${runDate}`);
            let leaseLost = false;
            const heartbeat = setInterval(async () => {
                try {
                    const result = await DailyReminderRun.updateOne(
                        { runDate, status: "running", ownerToken },
                        { $set: { leaseExpiresAt: new Date(now().getTime() + leaseDurationMs) } }
                    );
                    if (result.modifiedCount !== 1) {
                        leaseLost = true;
                        logger.error(`Reminder run lease lost for ${runDate}`);
                    }
                } catch (error) {
                    leaseLost = true;
                    logger.error(`Reminder run lease renewal failed (error=${error.name})`);
                }
            }, Math.max(1000, Math.floor(leaseDurationMs / 3)));
            heartbeat.unref?.();

            try {
                await runReminders();
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

                logger.log(`Reminder run completed for ${runDate}`);
                return { status: "completed" };
            } catch (error) {
                await DailyReminderRun.updateOne(
                    { runDate, status: "running", ownerToken },
                    { $set: { leaseExpiresAt: now() } }
                );
                throw error;
            } finally {
                clearInterval(heartbeat);
            }
        } finally {
            executionInProgress = false;
        }
    };

    const recoverRun = async (runDate) => {
        const result = await runForDate(runDate);
        if (result.status === "already-claimed" && result.retryAt) {
            const retryDelay = Math.max(0, new Date(result.retryAt).getTime() - now().getTime()) + 50;
            const retry = setTimeout(() => {
                recoverRun(runDate).catch((error) => {
                    logger.error(`Startup reminder recovery retry failed (error=${error.name})`);
                });
            }, retryDelay);
            retry.unref?.();
        }
        return result;
    };

    const recoverOnStartup = async () => {
        const startupTime = now();
        if (!isReminderTimeReached(startupTime)) {
            logger.log("Reminder startup recovery skipped: before 09:00 Asia/Kolkata");
            return { status: "not-due" };
        }

        return recoverRun(getIstDateKey(startupTime));
    };

    const runScheduled = async () => runForDate(getIstDateKey(now()));

    return { recoverOnStartup, runScheduled };
};

module.exports = {
    createReminderScheduler,
    getIstDateKey,
    isReminderTimeReached
};
