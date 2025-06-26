const Restaurant = require("../models/restaurant");
const FoodItem = require("../models/food");

const restaurantController = {
  getAllRestaurants: async (req, res) => {
    try {
      const restaurants = await Restaurant.find()
        .sort({ createdAt: -1 })
        .populate("owner");
      res.json(restaurants);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  getARestaurant: async (req, res) => {
    try {
      const restaurant = await Restaurant.findById(req.params.id).populate(
        "owner"
      );
      res.json(restaurant);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  createRestaurant: async (req, res) => {
    try {
      const restaurant = new Restaurant(req.body);
      await restaurant.save();
      res.status(201).json(restaurant);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  updateRestaurant: async (req, res) => {
    try {
      const restaurant = await Restaurant.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!restaurant) {
        return res.status(404).json({ error: "Restaurant not found" });
      }
      res.json(restaurant);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  deleteRestaurant: async (req, res) => {
    try {
      const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
      if (!restaurant) {
        return res.status(404).json({ error: "Restaurant not found" });
      }
      await FoodItem.deleteMany({ restaurant: req.params.id });
      res.json({ message: "Restaurant deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = restaurantController;
