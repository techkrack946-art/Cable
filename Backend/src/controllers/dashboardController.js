const Customer = require("../models/customer");

// Convert an instant to its calendar day in India, independent of server timezone.
const istDayNumber = (date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
};

const getExpiryDashboard = async (req, res) => {
    try {
        const customers = await Customer.find();
        const today = istDayNumber(new Date());
        const oneDay = 24 * 60 * 60 * 1000;

        const expiryGroups = {
            threeDays: [],
            twoDays: [],
            oneDay: [],
            expired: []
        };

        customers.forEach((customer) => {
            const expiryDate = new Date(customer.expiryDate);
            // Use the expiry instant's IST calendar date; never compare raw timestamps.
            const daysUntilExpiry = (istDayNumber(expiryDate) - today) / oneDay;

            if (daysUntilExpiry <= 0) {
                expiryGroups.expired.push(customer);
            } else if (daysUntilExpiry === 1) {
                expiryGroups.oneDay.push(customer);
            } else if (daysUntilExpiry === 2) {
                expiryGroups.twoDays.push(customer);
            } else if (daysUntilExpiry === 3) {
                expiryGroups.threeDays.push(customer);
            }
        });

        return res.status(200).json(expiryGroups);
    } catch (error) {
        console.error("Expiry dashboard error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    getExpiryDashboard
};