const UserSession = require("../models/user");

const sessionController = {
  getAllSessions: async (req, res) => {
    try {
      const sessions = await UserSession.find()
        .sort({ lastActivity: -1 })
        .limit(50);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
};

module.exports = sessionController;