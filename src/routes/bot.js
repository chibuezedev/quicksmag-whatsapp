const express = require("express");
const router = express.Router();
const Bot = require("../bot/bot");
const FoodItem = require("../models/food");
const UserSession = require("../models/user");
const Order = require("../models/order");
const Category = require("../models/category");

const authenticateWebApp = (req, res, next) => {
  const token =
    req.query.token || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Token required" });
  }

  const bot = new Bot();
  const decoded = bot.verifyUserToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = decoded;
  next();
};

router.get("/api/webapp/cart", authenticateWebApp, async (req, res) => {
  try {
    const userSession = await UserSession.findOne({
      phoneNumber: req.user.phone,
    });

    if (!userSession || !userSession.cart?.length) {
      return res.json({ cart: [], total: 0 });
    }

    const cartItems = await Promise.all(
      userSession.cart.map(async (item) => {
        const food = await FoodItem.findById(item.food).populate("restaurant");
        return {
          id: item.food,
          name: food.name,
          price: food.price,
          quantity: item.quantity,
          restaurant: food.restaurant.name,
          image: food.imageUrl,
          subtotal: food.price * item.quantity,
        };
      })
    );

    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    res.json({ cart: cartItems, total });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

router.post("/api/webapp/cart/add", authenticateWebApp, async (req, res) => {
  try {
    const { foodId, quantity = 1 } = req.body;

    let userSession = await UserSession.findOne({
      phoneNumber: req.user.phone,
    });
    if (!userSession) {
      userSession = new UserSession({ phoneNumber: req.user.phone });
    }

    if (!userSession.cart) userSession.cart = [];

    const existingItemIndex = userSession.cart.findIndex(
      (item) => item.food.toString() === foodId
    );

    if (existingItemIndex > -1) {
      userSession.cart[existingItemIndex].quantity += quantity;
    } else {
      userSession.cart.push({ food: foodId, quantity });
    }

    await userSession.save();

    const food = await FoodItem.findById(foodId);
    res.json({
      success: true,
      message: `Added ${quantity}x ${food.name} to cart`,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to add item to cart" });
  }
});

router.get("/api/webapp/menu", authenticateWebApp, async (req, res) => {
  try {
    const { category, search } = req.query;

    let query = { isAvailable: true };

    if (category) {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const foods = await FoodItem.find(query)
      .populate("restaurant")
      .populate("category")
      .limit(50);

    const categories = await Category.find({ isActive: true });

    res.json({ foods, categories });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch menu" });
  }
});

router.post("/api/webapp/order", authenticateWebApp, async (req, res) => {
  try {
    const { deliveryAddress } = req.body;

    const userSession = await UserSession.findOne({
      phoneNumber: req.user.phone,
    });

    if (!userSession?.cart?.length) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    const orderNumber = "ORD" + Date.now();

    const cartItems = await Promise.all(
      userSession.cart.map(async (item) => {
        const food = await FoodItem.findById(item.food);
        return {
          food: item.food,
          quantity: item.quantity,
          price: food.price,
          name: food.name,
        };
      })
    );

    const totalAmount = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const order = new Order({
      orderNumber,
      customerPhone: req.user.phone,
      items: cartItems.map((item) => ({
        food: item.food,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount,
      deliveryAddress,
      restaurant: cartItems[0]
        ? (await FoodItem.findById(cartItems[0].food)).restaurant
        : null,
    });

    await order.save();

    userSession.cart = [];
    await userSession.save();

    const bot = new Bot();
    await bot.sendOrderUpdate(
      req.user.phone,
      `✅ Order confirmed! Order #${orderNumber}\nTotal: ₦${totalAmount}\nDelivery to: ${deliveryAddress}`
    );

    res.json({
      success: true,
      orderNumber,
      message: "Order placed successfully!",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to process order" });
  }
});

module.exports = router;
