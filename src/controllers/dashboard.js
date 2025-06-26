const Order = require("../models/order");
const Restaurant = require("../models/restaurant");
const FoodItem = require("../models/food");

const analyticsController = {
  getDashboard: async (req, res) => {
    try {
      const { restaurant } = req.query;
      let matchQuery = {};

      if (restaurant) {
        matchQuery.restaurant = restaurant;
      }

      const totalOrders = await Order.countDocuments(matchQuery);

      const totalRevenue = await Order.aggregate([
        ...(restaurant ? [{ $match: matchQuery }] : []),
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);

      const activeRestaurants = await Restaurant.countDocuments({
        isActive: true,
      });

      let foodItemQuery = { isAvailable: true };
      if (restaurant) {
        foodItemQuery.restaurant = restaurant;
      }
      const totalFoodItems = await FoodItem.countDocuments(foodItemQuery);

      const recentOrders = await Order.find(matchQuery)
        .populate("restaurant")
        .sort({ createdAt: -1 })
        .limit(5);

      const ordersByStatus = await Order.aggregate([
        ...(restaurant ? [{ $match: matchQuery }] : []),
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);

      let restaurantSpecificData = {};
      if (restaurant) {
        const restaurantInfo = await Restaurant.findById(restaurant);

        const topSellingItems = await Order.aggregate([
          { $match: matchQuery },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.foodItem",
              totalSold: { $sum: "$items.quantity" },
              revenue: {
                $sum: { $multiply: ["$items.quantity", "$items.price"] },
              },
            },
          },
          { $sort: { totalSold: -1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: "fooditems",
              localField: "_id",
              foreignField: "_id",
              as: "foodItem",
            },
          },
          { $unwind: "$foodItem" },
        ]);

        const monthlyRevenue = await Order.aggregate([
          { $match: matchQuery },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              revenue: { $sum: "$totalAmount" },
              orders: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": -1, "_id.month": -1 } },
          { $limit: 12 },
        ]);

        restaurantSpecificData = {
          restaurantInfo,
          topSellingItems,
          monthlyRevenue,
        };
      }

      res.json({
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        activeRestaurants,
        totalFoodItems,
        recentOrders,
        ordersByStatus,
        ...(restaurant && { restaurantSpecificData }),
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({
        error: error.message,
        message: "Failed to fetch dashboard data",
      });
    }
  },
};

module.exports = analyticsController;
