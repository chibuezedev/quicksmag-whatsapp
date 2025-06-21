const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    location: String,
    phone: String,
    isActive: { type: Boolean, default: true },
    deliveryTime: { type: String, default: "30-45 mins" },
    rating: { type: Number, default: 4.0 },
    image: String,
  },
  { timestamps: true }
);

const foodItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    category: { type: String, required: true },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    image: String,
    isAvailable: { type: Boolean, default: true },
    preparationTime: { type: String, default: "15-20 mins" },
    tags: [String],
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, required: true },
    customerPhone: { type: String, required: true },
    customerName: String,
    items: [
      {
        food: { type: mongoose.Schema.Types.ObjectId, ref: "FoodItem" },
        quantity: { type: Number, default: 1 },
        price: Number,
        specialInstructions: String,
      },
    ],
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    deliveryAddress: String,
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "transfer"],
      default: "cash",
    },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
  },
  { timestamps: true }
);
const userSessionSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, unique: true },
    currentStep: { type: String, default: "initial" },
    searchQuery: String,
    selectedCategory: String,
    cart: [
      {
        food: { type: mongoose.Schema.Types.ObjectId, ref: "FoodItem" },
        quantity: { type: Number, default: 1 },
        specialInstructions: String,
      },
    ],
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
const FoodItem = mongoose.model("FoodItem", foodItemSchema);
const Order = mongoose.model("Order", orderSchema);
const UserSession = mongoose.model("UserSession", userSessionSchema);
const Category = mongoose.model("Category", categorySchema);

module.exports = {
  Restaurant,
  FoodItem,
  Order,
  UserSession,
  Category,
};
