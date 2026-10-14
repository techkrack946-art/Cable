const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const mongoose = require("mongoose");
require("dotenv").config();
const connectDB = require("./config/db");
const customerRoutes = require("./routes/customerRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const smsRoutes = require("./routes/smsRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const { checkExpiryReminders } = require("./services/reminderService");
const DailyReminderRun = require("./models/dailyReminderRun");
const {
    createReminderScheduler,
    IST_TIMEZONE,
    REMINDER_CRON_EXPRESSION
} = require("./services/reminderScheduler");

const app = express();

// Middleware
const configuredFrontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
app.use(cors({
    origin: configuredFrontendOrigin || true
}));
app.use(express.json());
app.use("/api/customers", customerRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/health", (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;
    res.status(databaseConnected ? 200 : 503).json({
        status: databaseConnected ? "ok" : "degraded",
        database: databaseConnected ? "connected" : "disconnected"
    });
});

app.get("/", (req, res) => {
    res.json({
        message: "Cable Recharge API is running 🚀"
    });

    app.use((req, res) => {
        res.status(404).json({ message: "Route not found" });
    });

    app.use((error, req, res, next) => {
        console.error("Unhandled API error:", error.message);
        res.status(500).json({ message: "Internal server error" });
    });
});

const PORT = process.env.PORT || 5000;
const reminderSchedulerKey = Symbol.for("cable-connect.reminder-scheduler");

const startReminderScheduler = () => {
    if (global[reminderSchedulerKey]) {
        return global[reminderSchedulerKey];
    }

    const scheduler = createReminderScheduler({
        DailyReminderRun,
        runReminders: checkExpiryReminders
    });
    const scheduledTask = cron.schedule(
        REMINDER_CRON_EXPRESSION,
        async () => {
            try {
                await scheduler.runScheduled();
            } catch (error) {
                console.error(JSON.stringify({
                    event: "scheduled_reminder_callback_failed",
                    error: error.name
                }));
            }
        },
        { timezone: IST_TIMEZONE, noOverlap: true }
    );
    console.log(JSON.stringify({
        event: "reminder_scheduler_registered",
        cron: REMINDER_CRON_EXPRESSION,
        timezone: IST_TIMEZONE
    }));
    global[reminderSchedulerKey] = { scheduler, scheduledTask };
    return global[reminderSchedulerKey];
};

const startServer = async () => {
    await connectDB();
    await DailyReminderRun.init();
    const { scheduler } = startReminderScheduler();
    try {
        await scheduler.recoverOnStartup();
    } catch (error) {
        console.error(JSON.stringify({
            event: "startup_reminder_recovery_failed",
            error: error.name
        }));
    }

    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
};

startServer().catch((error) => {
    console.error("Unable to start server:", error.message);
    process.exit(1);
});