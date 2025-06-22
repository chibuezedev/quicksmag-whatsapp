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

      userSession.lastActivity = new Date();
      await userSession.save();

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
    console.log("Searching for:", query);

    // Enhanced case-insensitive search with trimmed and normalized query
    const normalizedQuery = query.toLowerCase().trim();

    // First, search for matching categories
    const matchingCategories = await Category.find({
      $and: [
        { isActive: true },
        { name: { $regex: normalizedQuery, $options: "i" } },
      ],
    });

    console.log("Matching categories:", matchingCategories.length);

    // Search for foods by name, description, tags, and category
    const foods = await FoodItem.find({
      $and: [
        { isAvailable: true },
        {
          $or: [
            { name: { $regex: normalizedQuery, $options: "i" } },
            { description: { $regex: normalizedQuery, $options: "i" } },
            { tags: { $in: [new RegExp(normalizedQuery, "i")] } },
            // Also search by category name
            ...(matchingCategories.length > 0
              ? [
                  {
                    category: { $in: matchingCategories.map((cat) => cat._id) },
                  },
                ]
              : []),
          ],
        },
      ],
    })
      .populate("restaurant")
      .populate("category")
      .limit(15);

    console.log("Search results count:", foods.length);

    if (foods.length === 0) {
      await this.sendMessage(
        phoneNumber,
        `😔 Sorry, I couldn't find any food matching "${query}". Try searching for something else or type "menu" to browse categories.`
      );
      userSession.currentStep = "initial";
      userSession.searchQuery = null;
      userSession.searchResults = [];
      await userSession.save();
      return;
    }

    // Group results by category if we found category matches
    const sections = [];

    if (matchingCategories.length > 0) {
      matchingCategories.forEach((category) => {
        const categoryFoods = foods.filter(
          (food) =>
            food.category &&
            food.category._id.toString() === category._id.toString()
        );

        if (categoryFoods.length > 0) {
          sections.push({
            title: this.truncateText(
              `${category.name} (${categoryFoods.length})`,
              24
            ),
            rows: categoryFoods.map((food) => ({
              id: `food_${food._id}`,
              title: this.truncateText(`${food.name} - ₦${food.price}`, 24),
              description: this.truncateText(
                `📍 ${food.restaurant.name} • ${food.preparationTime}`,
                72
              ),
            })),
          });
        }
      });

      // Add other matching foods that don't belong to the matched categories
      const otherFoods = foods.filter(
        (food) =>
          !matchingCategories.some(
            (cat) =>
              food.category &&
              food.category._id.toString() === cat._id.toString()
          )
      );

      if (otherFoods.length > 0) {
        sections.push({
          title: this.truncateText(`Other Results (${otherFoods.length})`, 24),
          rows: otherFoods.map((food) => ({
            id: `food_${food._id}`,
            title: this.truncateText(`${food.name} - ₦${food.price}`, 24),
            description: this.truncateText(
              `📍 ${food.restaurant.name} • ${food.preparationTime}`,
              72
            ),
          })),
        });
      }
    } else {
      // No category matches, show all results in one section
      let sectionTitle = `${foods.length} Results`;
      if (query.length <= 12) {
        sectionTitle = `${foods.length} ${query} items`;
      }

      sections.push({
        title: this.truncateText(sectionTitle, 24),
        rows: foods.map((food) => ({
          id: `food_${food._id}`,
          title: this.truncateText(`${food.name} - ₦${food.price}`, 24),
          description: this.truncateText(
            `📍 ${food.restaurant.name} • ${food.preparationTime}`,
            72
          ),
        })),
      });
    }

    const searchMessage =
      matchingCategories.length > 0
        ? `🔍 Found ${foods.length} items in ${matchingCategories.length} categories for "${query}":`
        : `🔍 Found ${foods.length} items for "${query}":`;

    await this.sendListMessage(phoneNumber, searchMessage, sections);

    userSession.currentStep = "viewing_options";
    userSession.searchResults = foods.map((f) => f._id);
    console.log(
      "Updated searchResults:",
      userSession.searchResults.length,
      "items"
    );
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
      isAvailable: true,
      category: categoryId,
    })
      .populate("restaurant")
      .populate("category")
      .limit(15);

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
      `🍴 ${category.name} items (${foods.length} found):`,
      sections
    );

    userSession.searchResults = foods.map((f) => f._id);
    await userSession.save();
  }

  async showFoodDetails(phoneNumber, userSession, foodId) {
    console.log("Showing food details for ID:", foodId);

    const food = await FoodItem.findById(foodId).populate("restaurant");

    if (!food) {
      console.log("Food not found for ID:", foodId);
      await this.sendMessage(
        phoneNumber,
        "Sorry, that item is no longer available."
      );
      userSession.currentStep = "initial";
      await userSession.save();
      return;
    }

    console.log("Found food:", food.name);

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
      "Custom Amount",
    ]);

    userSession.currentStep = "adding_to_cart";
    userSession.selectedFood = foodId;
    console.log("Set selectedFood to:", foodId);
    await userSession.save();

    console.log("Updated user session:", {
      currentStep: userSession.currentStep,
      selectedFood: userSession.selectedFood,
    });
  }

  async handleQuantitySelection(phoneNumber, userSession, messageText) {
    let quantity;
    console.log("Handling quantity selection:", messageText);
    console.log("User session:", userSession);

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

    if (!userSession.selectedFood) {
      console.log("No selectedFood in session:", userSession);
      await this.sendMessage(
        phoneNumber,
        "Sorry, there was an issue with your selection. Please search for the item again."
      );
      userSession.currentStep = "initial";
      userSession.searchQuery = null;
      userSession.searchResults = [];
      await userSession.save();
      return;
    }

    const food = await FoodItem.findById(userSession.selectedFood);

    if (!food) {
      await this.sendMessage(
        phoneNumber,
        "Sorry, that item is no longer available. Please search for another item."
      );
      userSession.currentStep = "initial";
      userSession.selectedFood = null;
      await userSession.save();
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

    await this.sendButtonMessage(
      phoneNumber,
      `✅ Added ${quantity}x ${food.name} to your cart!\n\nWhat would you like to do next?`,
      ["Continue Shopping", "View Cart", "Checkout"]
    );

    userSession.currentStep = "cart_management";
    userSession.selectedFood = null;
    await userSession.save();
  }

  async handleCartManagement(phoneNumber, userSession, messageText) {
    console.log("Cart management - received:", messageText);

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
      // User is searching for new items
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
      userSession.currentStep = "initial";
      await userSession.save();
      return;
    }

    try {
      // Properly populate cart items with food details
      const cartItems = await Promise.all(
        userSession.cart.map(async (item) => {
          const food = await FoodItem.findById(item.food).populate(
            "restaurant"
          );
          if (!food) {
            console.log("Food item not found:", item.food);
            return null;
          }
          return {
            ...(item._doc || item), // Handle both document and plain object
            foodDetails: food,
          };
        })
      );

      // Filter out null items (deleted food items)
      const validCartItems = cartItems.filter((item) => item !== null);

      if (validCartItems.length === 0) {
        await this.sendMessage(
          phoneNumber,
          "🛒 Your cart appears to be empty or contains unavailable items. Start by telling me what you'd like to eat!"
        );
        userSession.cart = [];
        userSession.currentStep = "initial";
        await userSession.save();
        return;
      }

      let cartMessage = "🛒 *Your Cart:*\n\n";
      let total = 0;

      validCartItems.forEach((item, index) => {
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
    } catch (error) {
      console.error("Error showing cart:", error);
      await this.sendMessage(
        phoneNumber,
        "Sorry, there was an error displaying your cart. Please try again."
      );
    }
  }

  async initiateCheckout(phoneNumber, userSession) {
    if (!userSession.cart || userSession.cart.length === 0) {
      await this.sendMessage(
        phoneNumber,
        "🛒 Your cart is empty. Add some items first!"
      );
      userSession.currentStep = "initial";
      await userSession.save();
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

    try {
      // Create order
      const orderNumber = "ORD" + Date.now();
      const cartItems = await Promise.all(
        userSession.cart.map(async (item) => {
          const food = await FoodItem.findById(item.food);
          if (!food) {
            throw new Error(`Food item ${item.food} not found`);
          }
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
    } catch (error) {
      console.error("Error during checkout:", error);
      await this.sendMessage(
        phoneNumber,
        "Sorry, there was an error processing your order. Please try again or contact support."
      );
    }
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
