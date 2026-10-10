const express = require("express");
const { getExpiryDashboard } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/expiry", getExpiryDashboard);

module.exports = router;