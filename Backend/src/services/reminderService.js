const Customer = require("../models/customer");
const { completeSettings, DEFAULT_SMS_TEMPLATES } = require("../controllers/settingsController");
const { sendSMS } = require("./smsService");

const IST_TIMEZONE = "Asia/Kolkata";
const ONE_DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

// Build a calendar-day number from the date as seen in IST.
// Using local date parts avoids comparing timestamp hours or shifting dates.
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

const replaceTemplatePlaceholders = (template, customer, expiryDate, daysLeft) => template
    .replaceAll("{name}", customer.name)
    .replaceAll("{expiryDate}", formatIstDate(expiryDate))
    .replaceAll("{daysLeft}", String(daysLeft));

const checkExpiryReminders = async () => {
    try {
        const customers = await Customer.find();
        let templates = DEFAULT_SMS_TEMPLATES;
        try {
            const settings = await completeSettings();
            templates = settings.smsTemplates;
        } catch (error) {
            console.error("Unable to load SMS templates; using defaults:", error.message);
        }
        const today = istDayNumber(new Date());
        const reminders = [
            { days: 3, field: "threeDay", label: "THREE_DAY" },
            { days: 2, field: "twoDay", label: "TWO_DAY" },
            { days: 1, field: "oneDay", label: "ONE_DAY" }
        ];

        for (const customer of customers) {
            const expiryDate = new Date(customer.expiryDate);

            if (Number.isNaN(expiryDate.getTime())) {
                console.error(`Skipping customer ${customer._id}: invalid expiryDate`);
                continue;
            }

            const daysRemaining = (istDayNumber(expiryDate) - today) / ONE_DAY_IN_MILLISECONDS;
            const reminder = reminders.find(({ days }) => days === daysRemaining);

            if (!reminder || customer.notificationStatus?.[reminder.field]) {
                continue;
            }

            const message = replaceTemplatePlaceholders(
                templates[reminder.field],
                customer,
                expiryDate,
                reminder.days
            );

            console.log(`Customer: ${customer.name}`);
            console.log(`Reminder: ${reminder.label}`);
            console.log(`Phone: ${customer.phone}`);
            console.log("Sending SMS...");

            try {
                await sendSMS(customer.phone, message);

                if (!customer.notificationStatus) {
                    customer.notificationStatus = {};
                }

                customer.notificationStatus[reminder.field] = true;
                await customer.save();

                console.log("SMS sent successfully");
                console.log(`notificationStatus.${reminder.field} = true`);
            } catch (error) {
                console.error(
                    `SMS failed for ${customer.name} (${reminder.label}): ${error.message}`
                );
            }
        }
    } catch (error) {
        console.error("Reminder check failed:", error);
    }
};

module.exports = {
    checkExpiryReminders
};