const Order = require("../models/order");
const Bot = require("../bot");

const whatsappBot = new Bot();

const orderController = {
  getAllOrders: async (req, res) => {
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
  },

  getOrderById: async (req, res) => {
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
  },

  updateOrderStatus: async (req, res) => {
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

      if (typeof whatsappBot !== 'undefined' && whatsappBot) {
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
  }
};

module.exports = orderController;