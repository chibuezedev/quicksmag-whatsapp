const express = require("express");
const PendingPayment = require("../models/paymentPending");
const OpayService = require("../controllers/payment");

const router = express.Router();
const opayService = new OpayService();

router.post("/callback", async (req, res) => {
  try {
    console.log("Callback received:", JSON.stringify(req.body, null, 2));

    const { payload, sha512, type } = req.body;

    if (!payload || !sha512) {
      console.error("Invalid callback - missing payload or signature");
      return res.status(400).json({ error: "Invalid callback data" });
    }

    if (!opayService.verifyCallbackSignature(payload, sha512)) {
      console.error("Invalid callback signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { reference, status, amount, currency } = payload;

    console.log(`Callback for reference: ${reference}, status: ${status}`);

    if (status === "SUCCESS") {
      const pendingPayment = await PendingPayment.findOne({ reference });
      if (pendingPayment) {
        pendingPayment.paymentStatus = "paid";
        pendingPayment.transactionId = payload.transactionId;
        pendingPayment.amount = amount;
        pendingPayment.currency = currency;
        await pendingPayment.save();
        console.log(`Payment confirmed for reference: ${reference}`);
      } else {
        console.error(`Pending payment not found for reference: ${reference}`);
      }
    } else if (status === "FAIL") {
      const pendingPayment = await PendingPayment.findOne({ reference });
      if (pendingPayment) {
        pendingPayment.paymentStatus = "failed";
        pendingPayment.failureReason = payload.displayedFailure;
        await pendingPayment.save();
        console.log(`Payment failed for reference: ${reference}`);
      }
    }

    res.status(200).json({ status: "success" });
  } catch (error) {
    console.error("Payment callback error:", error);
    res.status(200).json({ status: "error", message: error.message });
  }
});

router.get("/return", async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>❌ Invalid Payment Reference</h2>
            <p>No payment reference found.</p>
            <p>Please contact support if you believe this is an error.</p>
          </body>
        </html>
      `);
    }

    try {
      const verificationResult = await opayService.verifyPayment(reference);
      const isSuccess = verificationResult.data?.status === "SUCCESS";

      if (isSuccess) {
        const pendingPayment = await PendingPayment.findOne({ reference });
        if (pendingPayment && pendingPayment.paymentStatus !== "paid") {
          pendingPayment.paymentStatus = "paid";
          await pendingPayment.save();
        }

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
              <h2>❌ Payment Not Completed</h2>
              <p>Your payment was not successful or is still pending.</p>
              <p><strong>Reference:</strong> ${reference}</p>
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
    } catch (verificationError) {
      console.error("Payment verification error:", verificationError);
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>⚠️ Payment Verification Failed</h2>
            <p>Unable to verify payment status at this time.</p>
            <p><strong>Reference:</strong> ${reference}</p>
            <p>Please contact support for assistance.</p>
            <script>
              setTimeout(() => {
                window.close();
              }, 8000);
            </script>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error("Payment return error:", error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ System Error</h2>
          <p>An error occurred while processing your request.</p>
          <p>Please contact support.</p>
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
