const mongoose = require("mongoose");

const dailyReminderRunSchema = new mongoose.Schema({
    runDate: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ["running", "completed"],
        required: true
    },
    ownerToken: {
        type: String,
        required: true
    },
    leaseExpiresAt: {
        type: Date,
        required: true
    },
    startedAt: {
        type: Date,
        required: true
    },
    completedAt: {
        type: Date
    }
});

module.exports = mongoose.models.DailyReminderRun
    || mongoose.model("DailyReminderRun", dailyReminderRunSchema);
