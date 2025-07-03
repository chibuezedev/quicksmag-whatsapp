const mongoose = require("mongoose");

const pendingPaymentSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      unique: true,
      required: true,
    },
    orderNumber: {
      type: String,
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
        quantity: Number,
        price: Number,
        name: String,
        specialInstructions: String,
      },
    ],
    totalAmount: {
      type: Number,
      required: true,
    },
    deliveryAddress: String,
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },
    paymentUrl: String,
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "expired", "cancelled"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      default: Date.now,
      expires: 1800, // 30 minutes
    },
  },
  { timestamps: true }
);

const PendingPayment = mongoose.model("PendingPayment", pendingPaymentSchema);
module.exports = PendingPayment;
