const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/dashboard");

router.get("/dashboard", analyticsController.getDashboard);

module.exports = router;
