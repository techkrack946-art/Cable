const mongoose = require("mongoose");
const Customer = require("../models/customer");

const isValidCustomerId = (id) => mongoose.Types.ObjectId.isValid(id);

// Calendar dates are stored at UTC midnight so MongoDB does not shift their date.
const parseCalendarDate = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
        parsedDate.getUTCFullYear() !== year
        || parsedDate.getUTCMonth() !== month - 1
        || parsedDate.getUTCDate() !== day
    ) {
        return null;
    }

    return parsedDate;
};

const calculateExpiryDate = (rechargeDate) => {
    const parsedRechargeDate = parseCalendarDate(rechargeDate);

    if (!parsedRechargeDate) {
        return null;
    }

    parsedRechargeDate.setUTCDate(parsedRechargeDate.getUTCDate() + 30);
    return parsedRechargeDate;
};

const handleCustomerError = (error, res) => {
    if (error.code === 11000) {
        return res.status(409).json({
            message: "A customer with this stbNumber already exists"
        });
    }

    if (error.name === "ValidationError" || error.name === "CastError") {
        return res.status(400).json({
            message: "Validation failed",
            errors: error.errors
                ? Object.fromEntries(
                    Object.entries(error.errors).map(([field, fieldError]) => [field, fieldError.message])
                )
                : { [error.path]: error.message }
        });
    }

    console.error("Customer API error:", error);
    return res.status(500).json({ message: "Internal server error" });
};

const createCustomer = async (req, res) => {
    try {
        const customerData = { ...req.body };
        delete customerData.expiryDate;

        const parsedRechargeDate = parseCalendarDate(customerData.rechargeDate);
        const expiryDate = calculateExpiryDate(customerData.rechargeDate);

        if (!parsedRechargeDate || !expiryDate) {
            return res.status(400).json({
                message: "rechargeDate must be a valid calendar date in YYYY-MM-DD format"
            });
        }

        customerData.rechargeDate = parsedRechargeDate;
        customerData.expiryDate = expiryDate;
        const customer = await Customer.create(customerData);

        return res.status(201).json({
            message: "Customer created successfully",
            customer
        });
    } catch (error) {
        return handleCustomerError(error, res);
    }
};

const rechargeCustomer = async (req, res) => {
    try {
        if (!isValidCustomerId(req.params.id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const { amount, rechargeDate } = req.body;
        const parsedRechargeDate = parseCalendarDate(rechargeDate);
        const expiryDate = calculateExpiryDate(rechargeDate);

        if (typeof amount !== "number" || !Number.isFinite(amount)) {
            return res.status(400).json({
                message: "amount must be a valid number"
            });
        }

        if (!parsedRechargeDate || !expiryDate) {
            return res.status(400).json({
                message: "rechargeDate must be a valid calendar date in YYYY-MM-DD format"
            });
        }

        const customer = await Customer.findById(req.params.id);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        customer.amount = amount;
        customer.rechargeDate = parsedRechargeDate;
        customer.expiryDate = expiryDate;
        customer.notificationStatus = {
            threeDay: false,
            twoDay: false,
            oneDay: false
        };

        await customer.save();

        return res.status(200).json({
            message: "Customer recharged successfully",
            customer
        });
    } catch (error) {
        return handleCustomerError(error, res);
    }
};

const getCustomers = async (req, res) => {
    try {
        const customers = await Customer.find().sort({ _id: -1 });

        return res.status(200).json({ customers });
    } catch (error) {
        return handleCustomerError(error, res);
    }
};

const getCustomerById = async (req, res) => {
    try {
        if (!isValidCustomerId(req.params.id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customer = await Customer.findById(req.params.id);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        return res.status(200).json({ customer });
    } catch (error) {
        return handleCustomerError(error, res);
    }
};

const updateCustomer = async (req, res) => {
    try {
        if (!isValidCustomerId(req.params.id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customerData = { ...req.body };
        delete customerData.expiryDate;

        if (Object.prototype.hasOwnProperty.call(customerData, "rechargeDate")) {
            const parsedRechargeDate = parseCalendarDate(customerData.rechargeDate);
            const expiryDate = calculateExpiryDate(customerData.rechargeDate);

            if (!parsedRechargeDate || !expiryDate) {
                return res.status(400).json({
                    message: "rechargeDate must be a valid calendar date in YYYY-MM-DD format"
                });
            }

            customerData.rechargeDate = parsedRechargeDate;
            customerData.expiryDate = expiryDate;
        }

        if (!Object.keys(customerData).length) {
            return res.status(400).json({ message: "Request body cannot be empty" });
        }

        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            customerData,
            { returnDocument: "after", runValidators: true }
        );

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        return res.status(200).json({
            message: "Customer updated successfully",
            customer
        });
    } catch (error) {
        return handleCustomerError(error, res);
    }
};

const deleteCustomer = async (req, res) => {
    try {
        if (!isValidCustomerId(req.params.id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customer = await Customer.findByIdAndDelete(req.params.id);

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        return res.status(200).json({
            message: "Customer deleted successfully",
            customer
        });
    } catch (error) {
        return handleCustomerError(error, res);
    }
};

module.exports = {
    createCustomer,
    rechargeCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer
};