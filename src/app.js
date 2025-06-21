require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");

const WhatsAppBusinessBot = require("./bot");
const {
  Restaurant,
  FoodItem,
  Order,
  UserSession,
  Category,
} = require("./models");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let whatsappBot;

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB");
    whatsappBot = new WhatsAppBusinessBot();
  })
  .catch((error) => console.error("MongoDB connection error:", error));

app.get("/webhook/whatsapp", (req, res) => {
  if (whatsappBot) {
    whatsappBot.verifyWebhook(req, res);
  } else {
    res.sendStatus(500);
  }
});

app.post("/webhook/whatsapp", (req, res) => {
  if (whatsappBot) {
    whatsappBot.handleWebhook(req, res);
  } else {
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "FoodBot API is running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/restaurants", async (req, res) => {
  try {
    const restaurants = await Restaurant.find().sort({ createdAt: -1 });
    res.json(restaurants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/restaurants", async (req, res) => {
  try {
    const restaurant = new Restaurant(req.body);
    await restaurant.save();
    res.status(201).json(restaurant);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/restaurants/:id", async (req, res) => {
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
});

app.delete("/api/restaurants/:id", async (req, res) => {
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
});

app.get("/api/foods", async (req, res) => {
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
});

app.post("/api/foods", async (req, res) => {
  try {
    const food = new FoodItem(req.body);
    await food.save();
    await food.populate("restaurant");
    res.status(201).json(food);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/foods/:id", async (req, res) => {
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
});

app.delete("/api/foods/:id", async (req, res) => {
  try {
    const food = await FoodItem.findByIdAndDelete(req.params.id);
    if (!food) {
      return res.status(404).json({ error: "Food item not found" });
    }
    res.json({ message: "Food item deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/categories", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/categories", async (req, res) => {
  try {
    const category = new Category(req.body);
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put("/api/categories/:id", async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json(category);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const { status, restaurant, phone } = req.query;
    let query = {};

    if (status) query.status = status;
    if (restaurant) query.restaurant = restaurant;
    if (phone) query.customerPhone = phone;

    const orders = await Order.find(query)
      .populate("items.food")
      .populate("restaurant")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/orders/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("items.food")
      .populate("restaurant");
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/orders/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    )
      .populate("items.food")
      .populate("restaurant");

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (whatsappBot) {
      const statusMessages = {
        confirmed: `✅ Your order #${order.orderNumber} has been confirmed! We're preparing your food.`,
        preparing: `👨‍🍳 Your order #${
          order.orderNumber
        } is being prepared. Estimated time: ${
          order.restaurant?.deliveryTime || "30-45 mins"
        }`,
        ready: `🍽️ Your order #${order.orderNumber} is ready! Our delivery person is on the way.`,
        delivered: `✅ Your order #${order.orderNumber} has been delivered! Thank you for choosing us! 🙏`,
        cancelled: `❌ Sorry, your order #${order.orderNumber} has been cancelled. You will be refunded if payment was made.`,
      };

      const message = statusMessages[status];
      if (message) {
        try {
          await whatsappBot.sendOrderUpdate(order.customerPhone, message);
        } catch (error) {
          console.error("Error sending WhatsApp notification:", error);
        }
      }
    }

    res.json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
app.get("/api/analytics/dashboard", async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const activeRestaurants = await Restaurant.countDocuments({
      isActive: true,
    });
    const totalFoodItems = await FoodItem.countDocuments({ isAvailable: true });

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
});

// User Session Management
app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await UserSession.find()
      .sort({ lastActivity: -1 })
      .limit(50);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

cron.schedule("0 * * * *", async () => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await UserSession.deleteMany({ lastActivity: { $lt: oneDayAgo } });
    console.log("Cleaned up old user sessions");
  } catch (error) {
    console.error("Error cleaning up sessions:", error);
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    whatsappBot: whatsappBot ? "Connected" : "Disconnected",
  });
});

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
