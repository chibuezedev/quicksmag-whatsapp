const FoodItem = require("../models/food");

const foodController = {
  getAllFoods: async (req, res) => {
    try {
      const { restaurant, category, search } = req.query;
      let query = {};

      if (restaurant) query.restaurant = restaurant;
      if (category) query.category = category;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      const foods = await FoodItem.find(query)
        .populate("restaurant")
        .sort({ createdAt: -1 });
      res.json(foods);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  createFood: async (req, res) => {
    try {
      const food = new FoodItem(req.body);
      await food.save();
      await food.populate("restaurant");
      res.status(201).json(food);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  updateFood: async (req, res) => {
    try {
      const food = await FoodItem.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      }).populate("restaurant");
      if (!food) {
        return res.status(404).json({ error: "Food item not found" });
      }
      res.json(food);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  },

  deleteFood: async (req, res) => {
    try {
      const food = await FoodItem.findByIdAndDelete(req.params.id);
      if (!food) {
        return res.status(404).json({ error: "Food item not found" });
      }
      res.json({ message: "Food item deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = foodController;
