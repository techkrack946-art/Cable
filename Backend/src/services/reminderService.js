const Customer = require("../models/customer");
const { completeSettings, DEFAULT_SMS_TEMPLATES } = require("../controllers/settingsController");
const { sendSMS } = require("./smsService");

const IST_TIMEZONE = "Asia/Kolkata";
const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const reminders = [
    { days: 3, field: "threeDay", label: "THREE_DAY" },
    { days: 2, field: "twoDay", label: "TWO_DAY" },
    { days: 1, field: "oneDay", label: "ONE_DAY" }
];
let executionInProgress = false;

const logEvent = (level, event, details = {}) => {
    console[level](JSON.stringify({ event, ...details }));
};

const istDayNumber = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
};

const formatIstDate = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return `${values.day}-${values.month}-${values.year}`;
};

const getReminderForExpiry = (expiryDate, today, notificationStatus = {}) => {
    const validExpiryDate = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
    if (Number.isNaN(validExpiryDate.getTime())) {
        return null;
    }

    const daysRemaining = (istDayNumber(validExpiryDate) - istDayNumber(today)) / ONE_DAY_IN_MILLISECONDS;
    return reminders.find(({ days, field }) => (
        days === daysRemaining && !notificationStatus[field]
    )) || null;
};

const replaceTemplatePlaceholders = (template, customer, expiryDate, daysLeft) => template
    .replaceAll("{name}", customer.name)
    .replaceAll("{expiryDate}", formatIstDate(expiryDate))
    .replaceAll("{daysLeft}", String(daysLeft));

const checkExpiryReminders = async (runContext = {}) => {
    if (executionInProgress) {
        logEvent("warn", "reminder_processing_skipped", { reason: "process_overlap" });
        return;
    }

    executionInProgress = true;

    try {
        const customers = await Customer.find();
        let templates = DEFAULT_SMS_TEMPLATES;
        try {
            const settings = await completeSettings();
            templates = settings.smsTemplates;
        } catch {
            logEvent("error", "reminder_templates_load_failed", { usingDefaults: true });
        }
        const today = istDayNumber(new Date());
        const eligibleCustomers = [];
        let invalidExpiryDates = 0;

        for (const customer of customers) {
            const expiryDate = new Date(customer.expiryDate);

            if (Number.isNaN(expiryDate.getTime())) {
                invalidExpiryDates += 1;
                continue;
            }

            const reminder = getReminderForExpiry(
                expiryDate,
                new Date(today),
                customer.notificationStatus
            );
            if (reminder) {
                eligibleCustomers.push({ customer, expiryDate, reminder });
            }
        }

        logEvent("log", "reminder_eligibility_checked", {
            runDate: runContext.runDate,
            startedAtIST: runContext.startedAtIST,
            customerCount: customers.length,
            eligibleByReminder: Object.fromEntries(
                reminders.map(({ field, label }) => [
                    label,
                    eligibleCustomers.filter(({ reminder }) => reminder.field === field).length
                ])
            ),
            invalidExpiryDateCount: invalidExpiryDates
        });

        let sentCount = 0;
        let failedCount = 0;
        for (const { customer, expiryDate, reminder } of eligibleCustomers) {
            const message = replaceTemplatePlaceholders(
                templates[reminder.field],
                customer,
                expiryDate,
                reminder.days
            );

            try {
                await sendSMS(customer.phone, message);
            } catch (error) {
                failedCount += 1;
                logEvent("error", "reminder_sms_failed", {
                    reminder: reminder.label,
                    error: error.name
                });
                continue;
            }

            try {
                if (!customer.notificationStatus) customer.notificationStatus = {};
                customer.notificationStatus[reminder.field] = true;
                await customer.save();
            } catch (error) {
                failedCount += 1;
                logEvent("error", "reminder_status_save_failed_after_sms_acceptance", {
                    reminder: reminder.label,
                    error: error.name
                });
                continue;
            }

            sentCount += 1;
            logEvent("log", "reminder_sms_sent", { reminder: reminder.label });
        }

        logEvent("log", "reminder_processing_completed", {
            runDate: runContext.runDate,
            sentCount,
            failedCount
        });
    } catch (error) {
        logEvent("error", "reminder_processing_failed", { error: error.name });
        throw error;
    } finally {
        executionInProgress = false;
    }
};

module.exports = {
    checkExpiryReminders,
    getReminderForExpiry
};