const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: String,
    location: String,
    phone: String,
    isActive: {
      type: Boolean,
      default: true,
    },
    deliveryTime: {
      type: String,
      default: "30-45 mins",
    },
    rating: { type: Number, default: 4.0 },
    image: String,
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const Restaurant = mongoose.model("Restaurant", restaurantSchema);

module.exports = Restaurant;
