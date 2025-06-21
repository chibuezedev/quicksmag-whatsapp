const express = require("express");
const axios = require("axios");
const {
  FoodItem,
  Restaurant,
  UserSession,
  Order,
  Category,
} = require("../models");

class WhatsAppBusinessBot {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    this.baseURL = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;
  }

  verifyWebhook(req, res) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
      if (mode === "subscribe" && token === this.webhookSecret) {
        console.log("Webhook verified");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    }
  }

  async handleWebhook(req, res) {
    const body = req.body;

    if (body.object === "whatsapp_business_account") {
      body.entry.forEach((entry) => {
        const changes = entry.changes;
        changes.forEach((change) => {
          if (change.field === "messages") {
            const messages = change.value.messages;
            if (messages) {
              messages.forEach((message) => {
                this.processMessage(message, change.value.contacts[0]);
              });
            }
          }
        });
      });
      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }
  }

  extractMessageContent(message) {
    let messageText = "";
    let isInteractive = false;

    if (message.text?.body) {
      messageText = message.text.body.toLowerCase().trim();
    } else if (message.interactive) {
      isInteractive = true;
      if (message.interactive.type === "button_reply") {
        messageText = message.interactive.button_reply.title
          .toLowerCase()
          .trim();
      } else if (message.interactive.type === "list_reply") {
        messageText = message.interactive.list_reply.id;
      }
    }

    return { messageText, isInteractive };
  }

  async processMessage(message, contact) {
    const phoneNumber = message.from;
    const { messageText, isInteractive } = this.extractMessageContent(message);

    if (!messageText) return;

    try {
      let userSession = await UserSession.findOne({ phoneNumber });

      if (!userSession) {
        userSession = new UserSession({ phoneNumber });
        await userSession.save();
      }

      // Update last activity
      userSession.lastActivity = new Date();
      await userSession.save();

      // Route message based on current step
      switch (userSession.currentStep) {
        case "initial":
          await this.handleInitialMessage(
            phoneNumber,
            userSession,
            messageText,
            isInteractive
          );
          break;
        case "searching":
          await this.searchFood(phoneNumber, userSession, messageText);
          break;
        case "viewing_options":
          await this.handleFoodSelection(phoneNumber, userSession, messageText);
          break;
        case "adding_to_cart":
          await this.handleQuantitySelection(
            phoneNumber,
            userSession,
            messageText
          );
          break;
        case "cart_management":
          await this.handleCartManagement(
            phoneNumber,
            userSession,
            messageText
          );
          break;
        case "checkout":
          await this.handleCheckout(phoneNumber, userSession, messageText);
          break;
        default:
          await this.handleInitialMessage(
            phoneNumber,
            userSession,
            messageText,
            isInteractive
          );
      }
    } catch (error) {
      console.error("Error processing message:", error);
      await this.sendMessage(
        phoneNumber,
        "Sorry, something went wrong. Please try again."
      );
    }
  }

  async sendMessage(to, text) {
    try {
      const response = await axios.post(
        this.baseURL,
        {
          messaging_product: "whatsapp",
          to: to,
          type: "text",
          text: { body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error sending message:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async sendButtonMessage(to, text, buttons) {
    try {
      const response = await axios.post(
        this.baseURL,
        {
          messaging_product: "whatsapp",
          to: to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: text },
            action: {
              buttons: buttons.map((button, index) => ({
                type: "reply",
                reply: {
                  id: `btn_${index}`,
                  title: button,
                },
              })),
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error sending button message:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  async sendListMessage(to, text, sections) {
    try {
      const processedSections = sections.map((section) => ({
        ...section,
        title: this.truncateText(section.title, 24),
        rows: section.rows.map((row) => ({
          ...row,
          title: this.truncateText(row.title, 24),
          description: this.truncateText(row.description || "", 72),
        })),
      }));

      const response = await axios.post(
        this.baseURL,
        {
          messaging_product: "whatsapp",
          to: to,
          type: "interactive",
          interactive: {
            type: "list",
            body: { text: text },
            action: {
              button: "Choose Option",
              sections: processedSections,
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(
        "Error sending list message:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  async handleInitialMessage(
    phoneNumber,
    userSession,
    messageText,
    isInteractive
  ) {
    const welcomeMessage = `🍽️ Welcome to FoodBot! 🤖

I can help you order delicious food from various restaurants.

What would you like to eat today? You can:
• Type a food name (e.g., "pizza", "burger", "pasta")
• Browse by category
• Check your cart
• Get help

Just tell me what you're craving! 😋`;

    if (isInteractive) {
      if (messageText === "browse menu") {
        await this.showCategories(phoneNumber, userSession);
        return;
      } else if (messageText === "view cart") {
        await this.showCart(phoneNumber, userSession);
        return;
      } else if (messageText === "help") {
        await this.showHelp(phoneNumber);
        return;
      }
    }

    if (messageText === "menu") {
      await this.showCategories(phoneNumber, userSession);
    } else if (messageText === "cart") {
      await this.showCart(phoneNumber, userSession);
    } else if (messageText === "help") {
      await this.showHelp(phoneNumber);
    } else if (messageText.length > 2) {
      userSession.searchQuery = messageText;
      userSession.currentStep = "searching";
      await userSession.save();
      await this.searchFood(phoneNumber, userSession, messageText);
    } else {
      await this.sendButtonMessage(phoneNumber, welcomeMessage, [
        "Browse Menu",
        "View Cart",
        "Help",
      ]);
    }
  }

  async showCategories(phoneNumber, userSession) {
    const categories = await Category.find({ isActive: true });

    if (categories.length === 0) {
      await this.sendMessage(
        phoneNumber,
        "No categories available at the moment."
      );
      return;
    }

    const sections = [
      {
        title: "Categories",
        rows: categories.map((category, index) => ({
          id: `cat_${category._id}`,
          title: this.truncateText(category.name, 24),
          description: this.truncateText(category.description || "", 72),
        })),
      },
    ];

    await this.sendListMessage(
      phoneNumber,
      "🍴 Choose a food category to browse:",
      sections
    );

    userSession.currentStep = "viewing_options";
    await userSession.save();
  }

  async searchFood(phoneNumber, userSession, query) {
    const foods = await FoodItem.find({
      $and: [
        { isAvailable: true },
        {
          $or: [
            { name: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } },
            { tags: { $in: [new RegExp(query, "i")] } },
          ],
        },
      ],
    })
      .populate("restaurant")
      .limit(10);

    if (foods.length === 0) {
      await this.sendMessage(
        phoneNumber,
        `😔 Sorry, I couldn't find any food matching "${query}". Try searching for something else or type "menu" to browse categories.`
      );
      userSession.currentStep = "initial";
      await userSession.save();
      return;
    }

    let sectionTitle = `${foods.length} Results`;
    if (query.length <= 12) {
      sectionTitle = `${foods.length} ${query} items`;
    }

    const sections = [
      {
        title: this.truncateText(sectionTitle, 24),
        rows: foods.map((food, index) => ({
          id: `food_${food._id}`,
          title: this.truncateText(`${food.name} - ₦${food.price}`, 24),
          description: this.truncateText(
            `📍 ${food.restaurant.name} • ${food.preparationTime}`,
            72
          ),
        })),
      },
    ];

    await this.sendListMessage(
      phoneNumber,
      `🔍 Found ${foods.length} items for "${query}":`,
      sections
    );

    userSession.currentStep = "viewing_options";
    userSession.searchResults = foods.map((f) => f._id);
    await userSession.save();
  }

  async handleFoodSelection(phoneNumber, userSession, messageText) {
    if (messageText.startsWith("food_")) {
      const foodId = messageText.replace("food_", "");
      await this.showFoodDetails(phoneNumber, userSession, foodId);
      return;
    }

    if (messageText.startsWith("cat_")) {
      const categoryId = messageText.replace("cat_", "");
      await this.showFoodsByCategory(phoneNumber, userSession, categoryId);
      return;
    }

    if (messageText.length > 2) {
      userSession.searchQuery = messageText;
      userSession.currentStep = "searching";
      await userSession.save();
      await this.searchFood(phoneNumber, userSession, messageText);
      return;
    }

    await this.sendMessage(
      phoneNumber,
      "Please select a food item or search for something new."
    );
  }

  async showFoodsByCategory(phoneNumber, userSession, categoryId) {
    const category = await Category.findById(categoryId);
    if (!category) {
      await this.sendMessage(phoneNumber, "Category not found.");
      return;
    }

    const foods = await FoodItem.find({
      category: categoryId,
      isAvailable: true,
    })
      .populate("restaurant")
      .limit(10);

    if (foods.length === 0) {
      await this.sendMessage(
        phoneNumber,
        `😔 No items available in ${category.name} category at the moment.`
      );
      userSession.currentStep = "initial";
      await userSession.save();
      return;
    }

    const sections = [
      {
        title: this.truncateText(category.name, 24),
        rows: foods.map((food, index) => ({
          id: `food_${food._id}`,
          title: this.truncateText(`${food.name} - ₦${food.price}`, 24),
          description: this.truncateText(
            `📍 ${food.restaurant.name} • ${food.preparationTime}`,
            72
          ),
        })),
      },
    ];

    await this.sendListMessage(
      phoneNumber,
      `🍴 ${category.name} items:`,
      sections
    );

    userSession.searchResults = foods.map((f) => f._id);
    await userSession.save();
  }

  async showFoodDetails(phoneNumber, userSession, foodId) {
    const food = await FoodItem.findById(foodId).populate("restaurant");

    if (!food) {
      await this.sendMessage(
        phoneNumber,
        "Sorry, that item is no longer available."
      );
      return;
    }

    const foodDetails = `🍽️ *${food.name}*
📍 ${food.restaurant.name}
💰 ₦${food.price}
📝 ${food.description}
⏱️ Prep time: ${food.preparationTime}
🚚 Delivery: ${food.restaurant.deliveryTime}

How many would you like to add to your cart?`;

    await this.sendButtonMessage(phoneNumber, foodDetails, [
      "1",
      "2",
      "3",
      "Custom Amount",
    ]);

    userSession.currentStep = "adding_to_cart";
    userSession.selectedFood = foodId;
    await userSession.save();
  }

  async handleQuantitySelection(phoneNumber, userSession, messageText) {
    let quantity;

    if (messageText === "custom amount") {
      await this.sendMessage(
        phoneNumber,
        "Please enter the quantity you want (1-10):"
      );
      return;
    }

    quantity = parseInt(messageText);

    if (isNaN(quantity) || quantity < 1) {
      await this.sendMessage(
        phoneNumber,
        "Please enter a valid quantity (1-10)"
      );
      return;
    }

    if (quantity > 10) {
      await this.sendMessage(
        phoneNumber,
        "Maximum quantity is 10 items per order. Please enter a smaller number."
      );
      return;
    }

    const cartItem = {
      food: userSession.selectedFood,
      quantity: quantity,
    };

    if (!userSession.cart) {
      userSession.cart = [];
    }

    const existingItemIndex = userSession.cart.findIndex(
      (item) => item.food.toString() === userSession.selectedFood.toString()
    );

    if (existingItemIndex > -1) {
      userSession.cart[existingItemIndex].quantity += quantity;
    } else {
      userSession.cart.push(cartItem);
    }

    const food = await FoodItem.findById(userSession.selectedFood);

    await this.sendButtonMessage(
      phoneNumber,
      `✅ Added ${quantity}x ${food.name} to your cart!\n\nWhat would you like to do next?`,
      ["Continue Shopping", "View Cart", "Checkout"]
    );

    userSession.currentStep = "cart_management";
    await userSession.save();
  }

  async handleCartManagement(phoneNumber, userSession, messageText) {
    if (messageText === "view cart" || messageText === "cart") {
      await this.showCart(phoneNumber, userSession);
    } else if (messageText === "checkout") {
      await this.initiateCheckout(phoneNumber, userSession);
    } else if (messageText === "continue shopping") {
      await this.sendMessage(phoneNumber, "What would you like to search for?");
      userSession.currentStep = "initial";
      await userSession.save();
    } else if (messageText === "clear cart") {
      userSession.cart = [];
      await userSession.save();
      await this.sendMessage(
        phoneNumber,
        "🛒 Cart cleared! What would you like to order?"
      );
      userSession.currentStep = "initial";
      await userSession.save();
    } else {
      userSession.searchQuery = messageText;
      userSession.currentStep = "searching";
      await userSession.save();
      await this.searchFood(phoneNumber, userSession, messageText);
    }
  }

  async showCart(phoneNumber, userSession) {
    if (!userSession.cart || userSession.cart.length === 0) {
      await this.sendMessage(
        phoneNumber,
        "🛒 Your cart is empty. Start by telling me what you'd like to eat!"
      );
      return;
    }

    const cartItems = await Promise.all(
      userSession.cart.map(async (item) => {
        const food = await FoodItem.findById(item.food).populate("restaurant");
        return { ...item, foodDetails: food };
      })
    );

    let cartMessage = "🛒 *Your Cart:*\n\n";
    let total = 0;

    cartItems.forEach((item, index) => {
      const subtotal = item.foodDetails.price * item.quantity;
      total += subtotal;

      cartMessage += `${index + 1}. *${item.foodDetails.name}*\n`;
      cartMessage += `   📍 ${item.foodDetails.restaurant.name}\n`;
      cartMessage += `   Qty: ${item.quantity} × ₦${item.foodDetails.price} = ₦${subtotal}\n\n`;
    });

    cartMessage += `💰 *Total: ₦${total}*`;

    await this.sendButtonMessage(phoneNumber, cartMessage, [
      "Checkout",
      "Continue Shopping",
      "Clear Cart",
    ]);

    userSession.currentStep = "cart_management";
    await userSession.save();
  }

  async initiateCheckout(phoneNumber, userSession) {
    if (!userSession.cart || userSession.cart.length === 0) {
      await this.sendMessage(
        phoneNumber,
        "🛒 Your cart is empty. Add some items first!"
      );
      return;
    }

    const checkoutMessage = `🏁 Ready to checkout!

Please provide your delivery address:
(Example: "123 Main Street, Victoria Island, Lagos")`;

    await this.sendMessage(phoneNumber, checkoutMessage);
    userSession.currentStep = "checkout";
    await userSession.save();
  }

  async handleCheckout(phoneNumber, userSession, messageText) {
    const address = messageText.trim();

    if (address.length < 10) {
      await this.sendMessage(
        phoneNumber,
        "Please provide a more detailed delivery address."
      );
      return;
    }

    // Create order
    const orderNumber = "ORD" + Date.now();
    const cartItems = await Promise.all(
      userSession.cart.map(async (item) => {
        const food = await FoodItem.findById(item.food);
        return {
          food: item.food,
          quantity: item.quantity,
          price: food.price,
        };
      })
    );

    const totalAmount = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const order = new Order({
      orderNumber,
      customerPhone: userSession.phoneNumber,
      items: cartItems,
      totalAmount,
      deliveryAddress: address,
      restaurant: cartItems[0]
        ? (await FoodItem.findById(cartItems[0].food)).restaurant
        : null,
    });

    await order.save();

    // Clear cart and reset session
    userSession.cart = [];
    userSession.currentStep = "initial";
    await userSession.save();

    const confirmationMessage = `✅ *Order Confirmed!*

📋 Order #: ${orderNumber}
💰 Total: ₦${totalAmount}
📍 Delivery to: ${address}
⏱️ Estimated delivery: 45-60 minutes

Payment: Cash on delivery
You'll receive updates on your order status.

Thank you for your order! 🙏`;

    await this.sendMessage(phoneNumber, confirmationMessage);
  }

  async showHelp(phoneNumber) {
    const helpMessage = `🤖 *FoodBot Help*

*How to order:*
1. Tell me what food you want
2. Choose from the results
3. Select quantity
4. Continue shopping or checkout
5. Provide delivery address
6. Confirm your order

*Commands:*
• Search food: Just type what you want
• Browse menu: Say "menu"
• View cart: Say "cart"
• Get help: Say "help"

Need assistance? Just ask! 😊`;

    await this.sendMessage(phoneNumber, helpMessage);
  }

  async sendOrderUpdate(phoneNumber, message) {
    await this.sendMessage(phoneNumber, message);
  }
}

module.exports = WhatsAppBusinessBot;
