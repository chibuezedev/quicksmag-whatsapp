const mongoose = require("mongoose");

const userSessionSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
    },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
    },
    currentStep: {
      type: String,
      default: "initial",
    },
    searchQuery: String,
    selectedCategory: String,
    selectedFood: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodItem",
    },
    searchResults: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FoodItem",
      },
    ],
    cart: [
      {
        food: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "FoodItem",
        },
        quantity: {
          type: Number,
          default: 1,
        },
        specialInstructions: String,
      },
    ],
    lastActivity: {
      type: Date,

      default: Date.now,
    },
    isFirstVisit: {
      type: Boolean,
    },
    contactData: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

const UserSession = mongoose.model("UserSession", userSessionSchema);

module.exports = UserSession;
