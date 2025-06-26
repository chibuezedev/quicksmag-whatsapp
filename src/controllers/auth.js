const jwt = require("jsonwebtoken");
require("dotenv").config();

const User = require("../models/users");

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const authController = {
  register: async (req, res) => {
    try {
      const { email, password, role, restaurantId } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      const user = new User({
        email,
        password,
        role,
        restaurantId: role === "restaurant" ? restaurantId : undefined,
      });

      await user.save();

      const token = generateToken(user._id);

      res.status(201).json({
        message: "User created successfully",
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
        },
        token,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = generateToken(user._id);

      res.json({
        message: "Login successful",
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
        },
        token,
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },

  getMe: async (req, res) => {
    try {
      const user = await User.findById(req.user.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
        },
      });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },
};

module.exports = authController;
