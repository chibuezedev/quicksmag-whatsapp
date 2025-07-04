const express = require("express");
const PaystackService = require("../controllers/payment");
const PendingPayment = require("../models/paymentPending");
const Order = require("../models/order");
const WhatsAppBot = require("../bot");

const router = express.Router();

router.post(
  "/paystack/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["x-paystack-signature"];
    const payload = req.body;

    try {
      const paystackService = new PaystackService();
      const whatsappBot = new WhatsAppBot();

      const payloadString = payload.toString();
      const parsedPayload = JSON.parse(payloadString);

      if (!paystackService.verifyWebhookSignature(parsedPayload, signature)) {
        console.error("Invalid webhook signature");
        return res.status(400).json({ error: "Invalid signature" });
      }

      const event = parsedPayload;
      console.log("Paystack webhook received:", event.event);

      switch (event.event) {
        case "charge.success":
          await handleChargeSuccess(event.data, whatsappBot);
          break;

        case "charge.failed":
          await handleChargeFailed(event.data, whatsappBot);
          break;

        case "transfer.success":
          await handleTransferSuccess(event.data, whatsappBot);
          break;

        case "transfer.failed":
          await handleTransferFailed(event.data, whatsappBot);
          break;

        default:
          console.log(`Unhandled webhook event: ${event.event}`);
      }

      res.status(200).json({ message: "Webhook processed successfully" });
    } catch (error) {
      console.error("Error processing webhook:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

async function handleChargeSuccess(data, whatsappBot) {
  const reference = data.reference;
  console.log(`Processing successful charge for reference: ${reference}`);

  try {
    const pendingPayment = await PendingPayment.findOneAndUpdate(
      { reference, paymentStatus: "pending" },
      { paymentStatus: "processing" },
      { new: true }
    );

    if (!pendingPayment) {
      console.log(
        `No pending payment found for reference: ${reference} or already processed`
      );
      return;
    }

    const existingOrder = await Order.findOne({ paymentReference: reference });
    if (existingOrder) {
      console.log(`Order already exists for reference: ${reference}`);
      if (pendingPayment.paymentStatus !== "paid") {
        pendingPayment.paymentStatus = "paid";
        await pendingPayment.save();
      }
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
      paymentMethod: "paystack",
      paymentReference: reference,
      status: "confirmed",
      paymentStatus: "paid",
      paymentDetails: {
        transactionId: data.id,
        channel: data.channel,
        brand: data.authorization?.brand,
        last4: data.authorization?.last4,
        authorization: data.authorization,
      },
    });

    await order.save();

    pendingPayment.paymentStatus = "paid";
    await pendingPayment.save();

    const confirmationMessage = `✅ *Payment Confirmed & Order Placed!*

📋 *Order #:* ${order.orderNumber}
💳 *Payment:* ₦${order.totalAmount.toLocaleString()} (Paid via Paystack)

🍽️ *Your Order:*
${pendingPayment.items
  .map(
    (item) =>
      `• ${item.name} x${item.quantity} - ₦${(
        item.price * item.quantity
      ).toLocaleString()}`
  )
  .join("\n")}

📍 *Delivery Address:* ${order.deliveryAddress}

⏱️ *Estimated Delivery:* 45-60 minutes

Your order is now being prepared! 👨‍🍳

Thank you for your order, ${order.customerName}! 🙏`;

    await whatsappBot.sendMessage(
      pendingPayment.customerPhone,
      confirmationMessage
    );

    console.log(`Order created successfully for reference: ${reference}`);
  } catch (error) {
    console.error("Error handling charge success:", error);
    try {
      await PendingPayment.findOneAndUpdate(
        { reference },
        { paymentStatus: "pending" }
      );
    } catch (resetError) {
      console.error("Error resetting payment status:", resetError);
    }
  }
}
async function handleChargeFailed(data, whatsappBot) {
  const reference = data.reference;
  console.log(`Processing failed charge for reference: ${reference}`);

  try {
    const pendingPayment = await PendingPayment.findOne({ reference });

    if (!pendingPayment) {
      console.log(`No pending payment found for reference: ${reference}`);
      return;
    }

    pendingPayment.paymentStatus = "failed";
    await pendingPayment.save();

    const failureMessage = `❌ *Payment Failed*

📋 *Order #:* ${pendingPayment.orderNumber}
💳 *Amount:* ₦${pendingPayment.totalAmount.toLocaleString()}

Reason: ${data.gateway_response || "Payment was not successful"}

Please try placing your order again or contact support if you need assistance.`;

    await whatsappBot.sendMessage(pendingPayment.customerPhone, failureMessage);

    console.log(`Payment failure processed for reference: ${reference}`);
  } catch (error) {
    console.error("Error handling charge failure:", error);
  }
}

async function handleTransferSuccess(data, whatsappBot) {
  console.log("Transfer success:", data);

  try {
    const reference = data.reference;
    const pendingPayment = await PendingPayment.findOne({ reference });

    if (!pendingPayment) {
      console.log(`No pending payment found for reference: ${reference}`);
      return;
    }

    const successMessage = `✅ *Transfer Successful!*

Your refund or payout of ₦${data.amount / 100} has been processed successfully.

Reference: ${reference}
Status: ${data.status}

Thank you for using our service!`;

    await whatsappBot.sendMessage(pendingPayment.customerPhone, successMessage);
  } catch (error) {
    console.error("Error handling transfer success:", error);
  }
}

async function handleTransferFailed(data, whatsappBot) {
  console.log("Transfer failed:", data);

  try {
    const reference = data.reference;
    const pendingPayment = await PendingPayment.findOne({ reference });

    if (!pendingPayment) {
      console.log(`No pending payment found for reference: ${reference}`);
      return;
    }

    const failedMessage = `❌ *Transfer Failed!*

We were unable to process your refund or payout of ₦${data.amount / 100}.

Reference: ${reference}
Reason: ${data.reason || "Unknown error"}

Please contact support for assistance.`;

    await whatsappBot.sendMessage(pendingPayment.customerPhone, failedMessage);
  } catch (error) {
    console.error("Error handling transfer failed:", error);
  }
}

router.get("/paystack/callback", async (req, res) => {
  const { reference, trxref } = req.query;

  try {
    const paystackService = new PaystackService();
    const verification = await paystackService.verifyPayment(
      reference || trxref
    );

    if (
      verification.status === true &&
      verification.data.status === "success"
    ) {
      res.status(200).json({
        success: true,
        message: "Payment verified successfully",
        reference: reference || trxref,
        data: verification.data,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Payment verification failed",
        reference: reference || trxref,
        data: verification.data,
      });
    }
  } catch (error) {
    console.error("Error in payment callback:", error);
    res.status(500).json({
      success: false,
      message: "Payment verification error",
      reference: reference || trxref,
      error: error.message,
    });
  }
});

router.get("/paystack/status/:reference", async (req, res) => {
  const { reference } = req.params;

  try {
    const paystackService = new PaystackService();
    const verification = await paystackService.verifyPayment(reference);

    res.json({
      status: "success",
      data: verification.data,
    });
  } catch (error) {
    console.error("Error checking payment status:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to check payment status",
    });
  }
});

module.exports = router;
