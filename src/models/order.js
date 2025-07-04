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
    customerEmail: String,
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
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    deliveryAddress: String,
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "transfer", "paystack", "opay"],
      default: "cash",
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },
    paymentReference: {
      type: String,
      unique: true,
      sparse: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentDetails: {
      transactionId: String,
      channel: String,
      brand: String,
      last4: String,
      authorization: {
        authorization_code: String,
        bin: String,
        card_type: String,
        bank: String,
      },
    },
    deliveryFee: {
      type: Number,
      default: 0,
    },
    notes: String,
    estimatedDeliveryTime: Date,
    actualDeliveryTime: Date,
    cancelReason: String,
    refundAmount: Number,
    refundReason: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

orderSchema.virtual("totalWithDelivery").get(function () {
  return this.totalAmount + this.deliveryFee;
});

orderSchema.index({ customerPhone: 1, createdAt: -1 });
orderSchema.index({ paymentReference: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
