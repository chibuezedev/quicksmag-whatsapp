const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    customerName: String,
    items: [
      {
        food: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "FoodItem",
        },
        quantity: {
          type: Number,
          default: 1,
        },
        price: Number,
        specialInstructions: String,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
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
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
