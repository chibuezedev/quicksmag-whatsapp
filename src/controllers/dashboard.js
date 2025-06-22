const Order = require("../models/order");
const Restaurant = require("../models/restaurant");
const FoodItem = require("../models/food");

const analyticsController = {
  getDashboard: async (req, res) => {
    try {
      const totalOrders = await Order.countDocuments();
      const totalRevenue = await Order.aggregate([
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);
      const activeRestaurants = await Restaurant.countDocuments({
        isActive: true,
      });
      const totalFoodItems = await FoodItem.countDocuments({
        isAvailable: true,
      });

      const recentOrders = await Order.find()
        .populate("restaurant")
        .sort({ createdAt: -1 })
        .limit(5);

      const ordersByStatus = await Order.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);

      res.json({
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        activeRestaurants,
        totalFoodItems,
        recentOrders,
        ordersByStatus,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = analyticsController;
