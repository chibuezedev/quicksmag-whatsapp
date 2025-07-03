const express = require("express");
const router = express();

const restaurantRoutes = require("./restaurant");
const foodRoutes = require("./food");
const categoryRoutes = require("./category");
const orderRoutes = require("./order");
const analyticsRoutes = require("./dashboard");
const sessionRoutes = require("./session");
const authRoutes = require("./auth");
const paymentRoutes = require("./payment")

router.use(express.json());

router.use("/restaurants", restaurantRoutes);
router.use("/foods", foodRoutes);
router.use("/categories", categoryRoutes);
router.use("/orders", orderRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/sessions", sessionRoutes);
router.use("/auth", authRoutes);
router.use("/payment", paymentRoutes)

module.exports = router;
