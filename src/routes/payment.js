const express = require("express");
const PendingPayment = require("../models/paymentPending");

const router = express.Router();

router.post("/callback", async (req, res) => {
  try {
    const { reference, status } = req.body;

    if (status === "SUCCESS") {
      const pendingPayment = await PendingPayment.findOne({ reference });
      if (pendingPayment) {
        pendingPayment.paymentStatus = "paid";
        await pendingPayment.save();
      }
    }

    res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Payment callback error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/return", (req, res) => {
  const { reference, status } = req.query;

  if (status === "SUCCESS") {
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>✅ Payment Successful!</h2>
          <p>Your payment has been processed successfully.</p>
          <p><strong>Reference:</strong> ${reference}</p>
          <p>Please return to WhatsApp and type "confirm payment" to complete your order.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 5000);
          </script>
        </body>
      </html>
    `);
  } else {
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ Payment Failed</h2>
          <p>Your payment was not successful.</p>
          <p>Please try again or contact support.</p>
          <script>
            setTimeout(() => {
              window.close();
            }, 5000);
          </script>
        </body>
      </html>
    `);
  }
});


module.exports = router;