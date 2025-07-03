const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const FoodItem = require("../models/food");
const UserSession = require("../models/user");
const Order = require("../models/order");
const Category = require("../models/category");
const PendingPayment = require("../models/paymentPending");
const OpayService = require("../controllers/payment");

class Bot {
  constructor() {
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    this.baseURL = `https://graph.facebook.com/v18.0/${this.phoneNumberId}/messages`;

    this.intents = {
      greeting: [
        "hi",
        "hello",
        "hey",
        "good morning",
        "good afternoon",
        "good evening",
        "start",
      ],
      menu: [
        "menu",
        "browse",
        "categories",
        "category",
        "show menu",
        "what do you have",
      ],
      cart: ["cart", "my cart", "view cart", "show cart", "my order"],
      help: ["help", "how", "what can you do", "commands", "guide"],
      checkout: ["checkout", "order", "pay", "confirm order", "place order"],
      search: ["search", "find", "looking for", "want", "need"],
      cancel: ["cancel", "stop", "quit", "exit", "clear"],
      reset: ["reset", "restart", "start over", "begin again"],
      yes: ["yes", "yeah", "yep", "ok", "okay", "sure", "correct"],
      no: ["no", "nope", "cancel", "back"],
    };
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
        console.log("List reply ID:", messageText);
      }
    }

    console.log("Extracted message content:", { messageText, isInteractive });
    return { messageText, isInteractive };
  }

  detectIntent(messageText) {
    const text = messageText.toLowerCase().trim();

    for (const [intent, keywords] of Object.entries(this.intents)) {
      if (
        keywords.some((keyword) => text === keyword || text.includes(keyword))
      ) {
        return intent;
      }
    }

    if (this.isFoodSearch(text)) {
      return "food_search";
    }

    if (/^\d+$/.test(text) && parseInt(text) > 0 && parseInt(text) <= 10) {
      return "quantity";
    }

    if (text.length > 15 && text.includes(" ")) {
      return "address";
    }

    return "unknown";
  }

  isFoodSearch(text) {
    const foodKeywords = [
      "rice",
      "pasta",
      "pizza",
      "burger",
      "chicken",
      "beef",
      "fish",
      "soup",
      "stew",
      "jollof",
      "fried",
      "grilled",
      "beans",
      "yam",
      "plantain",
      "egusi",
      "okra",
      "pepper",
      "tomato",
      "salad",
      "sandwich",
      "shawarma",
      "suya",
      "pounded",
      "amala",
      "fufu",
      "garri",
      "bread",
      "cake",
      "drink",
    ];

    return (
      foodKeywords.some((keyword) => text.includes(keyword)) ||
      (text.length > 2 && !this.isCommonWord(text))
    );
  }

  isCommonWord(text) {
    const commonWords = [
      "the",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "up",
      "about",
      "into",
      "through",
      "during",
      "before",
      "after",
      "above",
      "below",
      "between",
      "among",
      "is",
      "are",
      "was",
      "were",
    ];
    return commonWords.includes(text);
  }

  async processMessage(message, contact) {
    const phoneNumber = message.from;
    const { messageText, isInteractive } = this.extractMessageContent(message);

    if (!messageText) return;

    try {
      let userSession = await UserSession.findOne({ phoneNumber });
      let isNewUser = false;

      if (!userSession) {
        isNewUser = true;
        const userName = contact?.profile?.name || "there";

        userSession = new UserSession({
          phoneNumber,
          userName: userName,
          isFirstVisit: true,
          contactData: contact,
        });
        await userSession.save();
      }

      userSession.lastActivity = new Date();
      await userSession.save();
      if (isNewUser || userSession.isFirstVisit) {
        await this.sendWelcomeMessage(phoneNumber, userSession);
        return;
      }

      const intent = this.detectIntent(messageText);
      console.log(`Detected intent: ${intent} for message: ${messageText}`);

      await this.routeMessage(
        phoneNumber,
        userSession,
        messageText,
        intent,
        isInteractive
      );
    } catch (error) {
      console.error("Error processing message:", error);
      await this.sendMessage(
        phoneNumber,
        "Sorry, something went wrong. Please try again or type 'help' for assistance."
      );
    }
  }

  async sendWelcomeMessage(phoneNumber, userSession) {
    const welcomeMessage = `🍽️ Hello ${userSession.userName}! Welcome to QuickSmag! 🤖

I'm your personal food ordering assistant. I can help you discover and order delicious meals from various restaurants around Awka.

Here's what I can do for you:
• 🔍 Search for specific dishes
• 📋 Browse our menu categories  
• 🛒 Manage your cart
• 🚚 Process your orders
• ❓ Provide help and guidance

What would you like to do today? 😋`;

    await this.sendButtonMessage(phoneNumber, welcomeMessage, [
      "Browse Menu",
      "Search Food",
      "Help",
    ]);

    userSession.currentStep = "initial";
    userSession.isFirstVisit = false;
    await userSession.save();
  }

  async routeMessage(
    phoneNumber,
    userSession,
    messageText,
    intent,
    isInteractive
  ) {
    console.log("Routing message:", {
      phoneNumber,
      messageText,
      intent,
      isInteractive,
      currentStep: userSession.currentStep,
    });
    if (isInteractive) {
      await this.handleInteractiveResponse(
        phoneNumber,
        userSession,
        messageText
      );
      return;
    }

    switch (userSession.currentStep) {
      case "initial":
        await this.handleInitialStep(
          phoneNumber,
          userSession,
          messageText,
          intent
        );
        break;
      case "searching":
        if (intent === "food_search" || intent === "unknown") {
          await this.searchFood(phoneNumber, userSession, messageText);
        } else {
          await this.handleInitialStep(
            phoneNumber,
            userSession,
            messageText,
            intent
          );
        }
        break;
      case "viewing_options":
        await this.handleFoodSelection(phoneNumber, userSession, messageText);
        break;
      case "adding_to_cart":
        if (intent === "quantity") {
          await this.handleQuantitySelection(
            phoneNumber,
            userSession,
            messageText
          );
        } else {
          await this.handleQuantityStep(
            phoneNumber,
            userSession,
            messageText,
            intent
          );
        }
        break;
      case "cart_management":
        await this.handleCartManagement(
          phoneNumber,
          userSession,
          messageText,
          intent
        );
        break;
      case "checkout":
        if (intent === "reset" || intent === "cancel") {
          await this.handleCheckoutStep(
            phoneNumber,
            userSession,
            messageText,
            intent
          );
        } else if (messageText && messageText.trim().length > 0) {
          await this.handleCheckout(phoneNumber, userSession, messageText);
        } else {
          await this.handleCheckoutStep(
            phoneNumber,
            userSession,
            messageText,
            intent
          );
        }
        break;
      case "awaiting_payment":
        if (intent === "reset") {
          await this.sendMessage(phoneNumber, "🔄 Starting over...");
          userSession.currentStep = "initial";
          userSession.pendingPaymentReference = null;
          await userSession.save();
          await this.sendGreetingResponse(phoneNumber, userSession);
          return;
        }

        if (
          messageText.toLowerCase().includes("confirm payment") ||
          messageText.toLowerCase().includes("payment confirm") ||
          messageText.toLowerCase().includes("paid")
        ) {
          await this.handlePaymentConfirmation(phoneNumber, userSession);
        } else {
          await this.sendMessage(
            phoneNumber,
            `⏳ Waiting for payment confirmation...

Type "confirm payment" after you've completed the payment to verify and complete your order.

Need help? Type "help" for assistance.`
          );
        }
        break;
      default:
        await this.handleInitialStep(
          phoneNumber,
          userSession,
          messageText,
          intent
        );
    }
  }

  async handleInitialStep(phoneNumber, userSession, messageText, intent) {
    if (intent === "reset") {
      await this.sendMessage(phoneNumber, "🔄 Starting over...");
      userSession.currentStep = "initial";
      userSession.cart = userSession.cart || [];
      userSession.selectedFood = null;
      userSession.searchQuery = null;
      userSession.searchResults = [];
      await userSession.save();
      await this.sendGreetingResponse(phoneNumber, userSession);
      return;
    }
    switch (intent) {
      case "greeting":
        await this.sendGreetingResponse(phoneNumber, userSession);
        break;
      case "menu":
        await this.showCategories(phoneNumber, userSession);
        break;
      case "cart":
        await this.showCart(phoneNumber, userSession);
        break;
      case "help":
        await this.showHelp(phoneNumber);
        break;
      case "food_search":
        userSession.searchQuery = messageText;
        userSession.currentStep = "searching";
        await userSession.save();
        await this.searchFood(phoneNumber, userSession, messageText);
        break;
      default:
        await this.sendOptionsMessage(phoneNumber, userSession, messageText);
        break;
    }
  }

  async handleInteractiveResponse(phoneNumber, userSession, messageText) {
    if (userSession.currentStep === "adding_to_cart") {
      const intent = this.detectIntent(messageText);
      if (
        intent === "quantity" ||
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(
          messageText
        )
      ) {
        await this.handleQuantitySelection(
          phoneNumber,
          userSession,
          messageText
        );
        return;
      }
      if (messageText === "custom amount") {
        await this.sendMessage(
          phoneNumber,
          "Please enter the quantity you want (1-10):"
        );
        return;
      }
    }
    if (messageText.startsWith("food_")) {
      const foodId = messageText.replace("food_", "");
      console.log("Food selected:", foodId);
      await this.showFoodDetails(phoneNumber, userSession, foodId);
      return;
    }

    if (messageText.startsWith("cat_")) {
      const categoryId = messageText.replace("cat_", "");
      console.log("Category selected:", categoryId);
      await this.showFoodsByCategory(phoneNumber, userSession, categoryId);
      return;
    }

    if (messageText === "browse menu") {
      await this.showCategories(phoneNumber, userSession);
    } else if (messageText === "search food") {
      await this.sendMessage(
        phoneNumber,
        "🔍 What would you like to search for? (e.g., 'jollof rice', 'pizza', 'chicken')"
      );
      userSession.currentStep = "searching";
      await userSession.save();
    } else if (messageText === "view cart") {
      await this.showCart(phoneNumber, userSession);
    } else if (messageText === "help") {
      await this.showHelp(phoneNumber);
    } else if (messageText === "continue shopping") {
      await this.sendMessage(
        phoneNumber,
        "What would you like to search for next?"
      );
      userSession.currentStep = "initial";
      await userSession.save();
    } else if (messageText === "checkout") {
      await this.initiateCheckout(phoneNumber, userSession);
    } else if (messageText === "clear cart") {
      userSession.cart = [];
      await userSession.save();
      await this.sendMessage(
        phoneNumber,
        "🛒 Cart cleared! What would you like to order?"
      );
      userSession.currentStep = "initial";
      await userSession.save();
    }
  }

  async handleQuantityStep(phoneNumber, userSession, messageText, intent) {
    if (intent === "reset") {
      await this.sendMessage(phoneNumber, "🔄 Starting over...");
      userSession.currentStep = "initial";
      userSession.cart = userSession.cart || [];
      userSession.selectedFood = null;
      userSession.searchQuery = null;
      userSession.searchResults = [];
      await userSession.save();
      await this.sendGreetingResponse(phoneNumber, userSession);
      return;
    }
    if (intent === "cancel") {
      await this.sendMessage(
        phoneNumber,
        "Cancelled. What would you like to do next?"
      );
      userSession.currentStep = "initial";
      userSession.selectedFood = null;
      await userSession.save();
      return;
    }

    if (messageText === "custom amount") {
      await this.sendMessage(
        phoneNumber,
        "Please enter the quantity you want (1-10):"
      );
      return;
    }

    const quantity = parseInt(messageText);
    if (!isNaN(quantity) && quantity >= 1 && quantity <= 10) {
      await this.handleQuantitySelection(phoneNumber, userSession, messageText);
    } else {
      await this.sendMessage(
        phoneNumber,
        "Please enter a valid quantity (1-10) or type 'cancel' to go back."
      );
    }
  }

  async handleCheckoutStep(phoneNumber, userSession, messageText, intent) {
    if (intent === "reset") {
      await this.sendMessage(phoneNumber, "🔄 Starting over...");
      userSession.currentStep = "initial";
      userSession.cart = userSession.cart || [];
      userSession.selectedFood = null;
      userSession.searchQuery = null;
      userSession.searchResults = [];
      await userSession.save();
      await this.sendGreetingResponse(phoneNumber, userSession);
      return;
    }
    if (intent === "cancel") {
      await this.sendMessage(
        phoneNumber,
        "Checkout cancelled. What would you like to do?"
      );
      userSession.currentStep = "cart_management";
      await userSession.save();
      return;
    }

    await this.sendMessage(
      phoneNumber,
      "Please provide your delivery address (e.g., 'Our Ladies 3 Hostel, Yahoo Junction, Awka.'):"
    );
  }

  async sendGreetingResponse(phoneNumber, userSession) {
    const greetingMessage = `Hello again ${userSession.userName}! 👋

Welcome back to QuickSmag! What can I help you with today?`;

    await this.sendButtonMessage(phoneNumber, greetingMessage, [
      "Browse Menu",
      "View Cart",
      "Search Food",
    ]);
  }

  async sendOptionsMessage(phoneNumber, userSession, messageText) {
    const optionsMessage = `I'm not sure what you're looking for. Here are some things I can help you with:

• 🍽️ Browse our menu categories
• 🔍 Search for specific food items
• 🛒 Check your cart
• ❓ Get help

What would you like to do?`;

    await this.sendButtonMessage(phoneNumber, optionsMessage, [
      "Browse Menu",
      "Search Food",
      "View Cart",
    ]);
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

  async showCategories(phoneNumber, userSession) {
    const categories = await Category.find({ isActive: true });

    if (categories.length === 0) {
      await this.sendMessage(
        phoneNumber,
        "No categories available at the moment. You can search for specific food items instead!"
      );
      return;
    }

    const sections = [
      {
        title: "Food Categories",
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
    const normalizedQuery = query.toLowerCase().trim();

    await this.sendMessage(phoneNumber, `🔍 Searching for "${query}"...`);

    const matchingCategories = await Category.find({
      $and: [
        { isActive: true },
        { name: { $regex: normalizedQuery, $options: "i" } },
      ],
    });

    const foods = await FoodItem.find({
      $and: [
        { isAvailable: true },
        {
          $or: [
            { name: { $regex: normalizedQuery, $options: "i" } },
            { description: { $regex: normalizedQuery, $options: "i" } },
            { tags: { $in: [new RegExp(normalizedQuery, "i")] } },
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

    if (foods.length === 0) {
      await this.sendMessage(
        phoneNumber,
        `😔 Sorry, I couldn't find any food matching "${query}". 

Try searching for:
• Different keywords (e.g., "rice" instead of "jollof rice")
• Popular dishes like "pizza", "chicken", "pasta"
• Or browse our menu categories`
      );

      await this.sendButtonMessage(phoneNumber, "What would you like to do?", [
        "Browse Menu",
        "Try Another Search",
        "View Cart",
      ]);

      userSession.currentStep = "initial";
      userSession.searchQuery = null;
      userSession.searchResults = [];
      await userSession.save();
      return;
    }

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
    await userSession.save();
  }

  async handleFoodSelection(phoneNumber, userSession, messageText) {
    console.log("handleFoodSelection called with:", {
      messageText,
      currentStep: userSession.currentStep,
    });

    if (messageText.startsWith("food_")) {
      const foodId = messageText.replace("food_", "");
      console.log("Food selected:", foodId);
      await this.showFoodDetails(phoneNumber, userSession, foodId);
      return;
    }

    if (messageText.startsWith("cat_")) {
      const categoryId = messageText.replace("cat_", "");
      console.log("Category selected:", categoryId);
      await this.showFoodsByCategory(phoneNumber, userSession, categoryId);
      return;
    }

    const intent = this.detectIntent(messageText);
    console.log("Intent detected in food selection:", intent);

    if (intent === "greeting") {
      await this.sendGreetingResponse(phoneNumber, userSession);
      return;
    }

    if (intent === "menu") {
      await this.showCategories(phoneNumber, userSession);
      return;
    }

    if (intent === "cart") {
      await this.showCart(phoneNumber, userSession);
      return;
    }

    if (intent === "help") {
      await this.showHelp(phoneNumber);
      return;
    }

    if (intent === "food_search" || intent === "search") {
      userSession.searchQuery = messageText;
      userSession.currentStep = "searching";
      await userSession.save();
      await this.searchFood(phoneNumber, userSession, messageText);
      return;
    }

    await this.sendButtonMessage(
      phoneNumber,
      "I'm not sure what you're looking for. Please select a food item from the list above, or choose an option below:",
      ["Browse Menu", "Search Food", "View Cart"]
    );

    userSession.currentStep = "initial";
    await userSession.save();
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
    const food = await FoodItem.findById(foodId).populate("restaurant");

    if (!food) {
      await this.sendMessage(
        phoneNumber,
        "Sorry, that item is no longer available."
      );
      userSession.currentStep = "initial";
      await userSession.save();
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

  async handleCartManagement(phoneNumber, userSession, messageText, intent) {
    if (intent === "reset") {
      await this.sendMessage(phoneNumber, "🔄 Starting over...");
      userSession.currentStep = "initial";
      userSession.cart = userSession.cart || [];
      userSession.selectedFood = null;
      userSession.searchQuery = null;
      userSession.searchResults = [];
      await userSession.save();
      await this.sendGreetingResponse(phoneNumber, userSession);
      return;
    }
    switch (intent) {
      case "cart":
        await this.showCart(phoneNumber, userSession);
        break;
      case "checkout":
        await this.initiateCheckout(phoneNumber, userSession);
        break;
      case "food_search":
        await this.sendMessage(
          phoneNumber,
          "🔍 What would you like to search for?"
        );
        userSession.currentStep = "searching";
        userSession.searchQuery = messageText;
        await userSession.save();
        await this.searchFood(phoneNumber, userSession, messageText);
        break;
      case "cancel":
        userSession.cart = [];
        await userSession.save();
        await this.sendMessage(
          phoneNumber,
          "🛒 Cart cleared! What would you like to order?"
        );
        userSession.currentStep = "initial";
        await userSession.save();
        break;
      default:
        if (messageText === "view cart" || messageText === "cart") {
          await this.showCart(phoneNumber, userSession);
        } else if (messageText === "checkout") {
          await this.initiateCheckout(phoneNumber, userSession);
        } else if (messageText === "continue shopping") {
          await this.sendMessage(
            phoneNumber,
            "🔍 What would you like to search for?"
          );
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
            ...(item._doc || item),
            foodDetails: food,
          };
        })
      );

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

  //   async handleCheckout(phoneNumber, userSession, messageText) {
  //     const address = messageText.trim();

  //     if (address.length < 10) {
  //       await this.sendMessage(
  //         phoneNumber,
  //         "Please provide a more detailed delivery address (at least 10 characters)."
  //       );
  //       return;
  //     }

  //     try {
  //       const orderNumber = "ORD" + Date.now();

  //       const cartItems = await Promise.all(
  //         userSession.cart.map(async (item) => {
  //           const food = await FoodItem.findById(item.food);
  //           if (!food) {
  //             throw new Error(`Food item ${item.food} not found`);
  //           }
  //           return {
  //             food: item.food,
  //             quantity: item.quantity,
  //             price: food.price,
  //             name: food.name,
  //             specialInstructions: item.specialInstructions || null,
  //           };
  //         })
  //       );

  //       const totalAmount = cartItems.reduce(
  //         (sum, item) => sum + item.price * item.quantity,
  //         0
  //       );

  //       const order = new Order({
  //         orderNumber,
  //         customerPhone: userSession.phoneNumber,
  //         customerName: userSession.userName || "Customer",
  //         items: cartItems.map((item) => ({
  //           food: item.food,
  //           quantity: item.quantity,
  //           price: item.price,
  //           specialInstructions: item.specialInstructions,
  //         })),
  //         totalAmount,
  //         deliveryAddress: address,
  //         restaurant: cartItems[0]
  //           ? (await FoodItem.findById(cartItems[0].food)).restaurant
  //           : null,
  //       });

  //       await order.save();

  //       const orderItemsText = cartItems
  //         .map((item) => {
  //           const itemTotal = item.price * item.quantity;
  //           let itemText = `• ${item.name} x${item.quantity} - ₦${itemTotal}`;

  //           if (item.specialInstructions) {
  //             itemText += `\n  (${item.specialInstructions})`;
  //           }

  //           return itemText;
  //         })
  //         .join("\n");

  //       userSession.cart = [];
  //       userSession.currentStep = "initial";
  //       await userSession.save();

  //       const confirmationMessage = `✅ *Order Confirmed!*

  // 📋 *Order #:* ${orderNumber}

  // 👋 *Customer:* ${userSession.userName || "Customer"}

  // 🍽️ *Your Order:*
  // ${orderItemsText}

  // 💰 *Subtotal:* ₦${totalAmount}
  // 🚚 *Delivery Fee:* ₦0 (Free delivery)
  // 💳 *Total Amount:* ₦${totalAmount}

  // 📍 *Delivery Address:*
  // ${address}

  // ⏱️ *Estimated Delivery:* 45-60 minutes
  // 💵 *Payment:* Cash or Transfer on delivery

  // You'll receive updates on your order status from our team.

  // Thank you for your order, ${userSession.userName || ""}! 🙏`;

  //       await this.sendMessage(phoneNumber, confirmationMessage);
  //     } catch (error) {
  //       console.error("Error during checkout:", error);
  //       await this.sendMessage(
  //         phoneNumber,
  //         "Sorry, there was an error processing your order. Please try again or contact support."
  //       );
  //     }
  //   }

  async handleCheckout(phoneNumber, userSession, messageText) {
    const address = messageText.trim();

    if (address.length < 10) {
      await this.sendMessage(
        phoneNumber,
        "Please provide a more detailed delivery address (at least 10 characters)."
      );
      return;
    }

    try {
      const orderNumber = "ORD" + Date.now();
      const reference = uuidv4();

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
            name: food.name,
            specialInstructions: item.specialInstructions || null,
          };
        })
      );

      const totalAmount = cartItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      const pendingPayment = new PendingPayment({
        reference,
        orderNumber,
        customerPhone: userSession.phoneNumber,
        customerName: userSession.userName || "Customer",
        items: cartItems,
        totalAmount,
        deliveryAddress: address,
        restaurant: cartItems[0]
          ? (await FoodItem.findById(cartItems[0].food)).restaurant
          : null,
      });

      await pendingPayment.save();

      const opayService = new OpayService();
      const paymentResponse = await opayService.createPayment({
        reference,
        orderNumber,
        customerPhone: userSession.phoneNumber,
        totalAmount,
      });
console.log(paymentResponse)
      if (paymentResponse.code === "00000") {
        pendingPayment.paymentUrl = paymentResponse.data.payUrl;
        await pendingPayment.save();

        const orderItemsText = cartItems
          .map((item) => {
            const itemTotal = item.price * item.quantity;
            return `• ${item.name} x${item.quantity} - ₦${itemTotal}`;
          })
          .join("\n");

        const paymentMessage = `💳 *Payment Required*

📋 *Order #:* ${orderNumber}

🍽️ *Your Order:*
${orderItemsText}

💰 *Total Amount:* ₦${totalAmount}
📍 *Delivery Address:* ${address}

🔗 *Payment Link:* ${paymentResponse.data.payUrl}

⏰ *Payment expires in 30 minutes*

After making payment, return here and type "confirm payment" to complete your order.

⚠️ *Important:* Your order will only be processed after successful payment confirmation.`;

        await this.sendMessage(phoneNumber, paymentMessage);
        userSession.cart = [];
        userSession.currentStep = "awaiting_payment";
        userSession.pendingPaymentReference = reference;
        await userSession.save();
      } else {
        throw new Error("Failed to create payment link");
      }
    } catch (error) {
      console.error("Error during checkout:", error);
      await this.sendMessage(
        phoneNumber,
        "Sorry, there was an error processing your payment. Please try again or contact support."
      );
    }
  }

  async handlePaymentConfirmation(phoneNumber, userSession) {
    if (!userSession.pendingPaymentReference) {
      await this.sendMessage(
        phoneNumber,
        "No pending payment found. Please place a new order."
      );
      userSession.currentStep = "initial";
      await userSession.save();
      return;
    }

    try {
      const opayService = new OpayService();
      const paymentStatus = await opayService.verifyPayment(
        userSession.pendingPaymentReference
      );

      if (
        paymentStatus.code === "00000" &&
        paymentStatus.data.status === "SUCCESS"
      ) {
        const pendingPayment = await PendingPayment.findOne({
          reference: userSession.pendingPaymentReference,
        });

        if (!pendingPayment) {
          await this.sendMessage(
            phoneNumber,
            "Payment record not found. Please contact support."
          );
          return;
        }

        const order = new Order({
          orderNumber: pendingPayment.orderNumber,
          customerPhone: pendingPayment.customerPhone,
          customerName: pendingPayment.customerName,
          items: pendingPayment.items.map((item) => ({
            food: item.food,
            quantity: item.quantity,
            price: item.price,
            specialInstructions: item.specialInstructions,
          })),
          totalAmount: pendingPayment.totalAmount,
          deliveryAddress: pendingPayment.deliveryAddress,
          restaurant: pendingPayment.restaurant,
          paymentMethod: "opay",
          paymentReference: userSession.pendingPaymentReference,
          status: "confirmed",
        });

        await order.save();

        pendingPayment.paymentStatus = "paid";
        await pendingPayment.save();

        const confirmationMessage = `✅ *Payment Confirmed & Order Placed!*

📋 *Order #:* ${order.orderNumber}
💳 *Payment:* ₦${order.totalAmount} (Paid via Opay)

🍽️ *Your Order:*
${pendingPayment.items
  .map(
    (item) =>
      `• ${item.name} x${item.quantity} - ₦${item.price * item.quantity}`
  )
  .join("\n")}

📍 *Delivery Address:* ${order.deliveryAddress}

⏱️ *Estimated Delivery:* 45-60 minutes

Your order is now being prepared! 👨‍🍳

Thank you for your order, ${order.customerName}! 🙏`;

        await this.sendMessage(phoneNumber, confirmationMessage);

        // Reset session
        userSession.currentStep = "initial";
        userSession.pendingPaymentReference = null;
        await userSession.save();
      } else {
        await this.sendMessage(
          phoneNumber,
          `❌ Payment verification failed or payment is still pending. 

Current status: ${paymentStatus.data?.status || "Unknown"}

Please try again in a few minutes or contact support if payment was made.`
        );
      }
    } catch (error) {
      console.error("Error verifying payment:", error);
      await this.sendMessage(
        phoneNumber,
        "Sorry, there was an error verifying your payment. Please try again or contact support."
      );
    }
  }

  async showHelp(phoneNumber) {
    const helpMessage = `🤖 *QuickSmag Help*

*How to order:*
1. Tell me what food you want (e.g., "jollof rice")
2. Choose from the results
3. Select quantity
4. Continue shopping or checkout
5. Provide delivery address
6. Confirm your order

*Quick Commands:*
• "menu" - Browse food categories
• "cart" - View your cart
• "checkout" - Start checkout
• "clear" - Empty your cart
• "help" - Show this message

Need assistance? Just ask! 😊`;

    await this.sendMessage(phoneNumber, helpMessage);
  }

  async sendOrderUpdate(phoneNumber, message) {
    await this.sendMessage(phoneNumber, message);
  }

  async cleanupInactiveSessions(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    await UserSession.deleteMany({ lastActivity: { $lt: cutoff } });
    console.log(`Cleaned up sessions inactive for more than ${hours} hours`);
  }
}

module.exports = Bot;
