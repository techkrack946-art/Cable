const express = require("express");
const {
    createCustomer,
    rechargeCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    deleteCustomer
} = require("../controllers/customerController");

const router = express.Router();

router.route("/")
    .post(createCustomer)
    .get(getCustomers);

router.post("/:id/recharge", rechargeCustomer);

router.route("/:id")
    .get(getCustomerById)
    .put(updateCustomer)
    .delete(deleteCustomer);

module.exports = router;