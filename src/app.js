require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");

const Bot = require("./bot");
const Routes = require("./routes/main");
const connectDB = require("./db");

const UserSession = require("./models/user");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let whatsappBot;

(async () => {
  try {
    await connectDB();
    whatsappBot = new Bot();
    console.log("Connected to Database!!");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
})();

app.get("/webhook/whatsapp", (req, res) => {
  if (whatsappBot) {
    whatsappBot.verifyWebhook(req, res);
  } else {
    res.sendStatus(500);
  }
});

app.post("/webhook/whatsapp", (req, res) => {
  if (whatsappBot) {
    whatsappBot.handleWebhook(req, res);
  } else {
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.json({
    status: "Quicksmag Whatsapp API!!",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    whatsappBot: whatsappBot ? "Connected" : "Disconnected",
  });
});

app.use("/api", Routes);

app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// cron.schedule("0 * * * *", async () => {
//   try {
//     const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
//     await UserSession.deleteMany({ lastActivity: { $lt: oneDayAgo } });
//     console.log("Cleaned up old user sessions");
//   } catch (error) {
//     console.error("Error cleaning up sessions:", error);
//   }
// });
