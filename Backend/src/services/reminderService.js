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

const checkExpiryReminders = async () => {
    if (executionInProgress) {
        console.warn("Reminder execution skipped: another execution is still in progress");
        return;
    }

    executionInProgress = true;
    console.log(`Reminder execution started (${new Date().toISOString()})`);

    try {
        const customers = await Customer.find();
        let templates = DEFAULT_SMS_TEMPLATES;
        try {
            const settings = await completeSettings();
            templates = settings.smsTemplates;
        } catch {
            console.error("Unable to load SMS templates; using defaults");
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

        const eligibleCounts = reminders.map(({ field, label }) => (
            `${label}=${eligibleCustomers.filter(({ reminder }) => reminder.field === field).length}`
        ));
        console.log(
            `Reminder eligibility: customers=${customers.length}, ${eligibleCounts.join(", ")}, invalidExpiryDates=${invalidExpiryDates}`
        );

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
                console.error(`SMS failed (reminder=${reminder.label}, error=${error.name})`);
                continue;
            }

            try {
                if (!customer.notificationStatus) customer.notificationStatus = {};
                customer.notificationStatus[reminder.field] = true;
                await customer.save();
            } catch (error) {
                failedCount += 1;
                console.error(
                    `SMS accepted but reminder status save failed (reminder=${reminder.label}, error=${error.name})`
                );
                continue;
            }

            sentCount += 1;
            console.log(`SMS sent successfully (reminder=${reminder.label})`);
        }

        console.log(`Reminder execution completed: sent=${sentCount}, failed=${failedCount}`);
    } catch (error) {
        console.error(`Reminder execution failed unexpectedly (error=${error.name})`);
        throw error;
    } finally {
        executionInProgress = false;
    }
};

module.exports = {
    checkExpiryReminders,
    getReminderForExpiry
};