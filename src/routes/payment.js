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

router.get("/cancel", async (req, res) => {
  try {
    const { reference } = req.query;

    console.log(`Payment cancelled: reference=${reference}`);

    if (reference) {
      const pendingPayment = await PendingPayment.findOne({ reference });
      if (pendingPayment) {
        pendingPayment.paymentStatus = "cancelled";
        await pendingPayment.save();
      }
    }

    res.send(`
      <html>
        <head>
          <title>Payment Cancelled</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #fffbf0;">
          <div style="max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #ffc107;">⚠️ Payment Cancelled</h2>
            <p>You have cancelled the payment process.</p>
            ${
              reference ? `<p><strong>Reference:</strong> ${reference}</p>` : ""
            }
            <p style="background: #fff8e1; padding: 15px; border-radius: 5px; margin: 20px 0;">
              Your order is still in your cart. Return to WhatsApp to try again or modify your order.
            </p>
            <p style="color: #666; font-size: 14px;">This window will close automatically in 10 seconds.</p>
          </div>
          <script>
            setTimeout(() => {
              window.close();
            }, 10000);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Payment cancel error:", error);
    res.status(500).send("Internal server error");
  }
});

module.exports = router;
