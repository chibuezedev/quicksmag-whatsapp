const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    this.baseUrl = "https://api.paystack.co";
  }

  async initializePayment(orderData) {
    const requestData = {
      email:
        orderData.customerEmail ||
        `${orderData.customerPhone
          .replace("+", "")
          .replace(/\D/g, "")}@quicksmag.com`,
      amount: Math.round(orderData.totalAmount * 100),
      reference: orderData.reference,
      currency: "NGN",
      callback_url: `${process.env.BASE_URL}/api/payment/paystack/callback`,
      metadata: {
        orderNumber: orderData.orderNumber,
        customerPhone: orderData.customerPhone,
        customerName: orderData.customerName || "Customer",
        custom_fields: [
          {
            display_name: "Order Number",
            variable_name: "order_number",
            value: orderData.orderNumber,
          },
          {
            display_name: "Customer Phone",
            variable_name: "customer_phone",
            value: orderData.customerPhone,
          },
        ],
      },
      channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        requestData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      console.log("Paystack Initialize Response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Paystack payment initialization error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      throw new Error(
        `Failed to initialize payment: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async verifyPayment(reference) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Paystack payment verification error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      throw new Error(
        `Failed to verify payment: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  verifyWebhookSignature(payload, signature) {
    const hmac = crypto.createHmac("sha512", this.secretKey);
    const expectedSignature = hmac.update(payload).digest("hex");
    return expectedSignature === signature;
  }

  async getAllTransactions(page = 1, perPage = 50) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transaction?page=${page}&perPage=${perPage}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Paystack get transactions error:", error.response?.data);
      throw new Error(
        `Failed to get transactions: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async getTransactionTimeline(reference) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/transaction/timeline/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Paystack get timeline error:", error.response?.data);
      throw new Error(
        `Failed to get transaction timeline: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async refundTransaction(reference, amount = null) {
    const requestData = {
      transaction: reference,
    };

    if (amount) {
      requestData.amount = Math.round(amount * 100); // Convert to kobo
    }

    try {
      const response = await axios.post(`${this.baseUrl}/refund`, requestData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.secretKey}`,
        },
      });

      return response.data;
    } catch (error) {
      console.error("Paystack refund error:", error.response?.data);
      throw new Error(
        `Failed to process refund: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }
}

module.exports = PaystackService;
