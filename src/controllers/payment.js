const crypto = require("crypto");
const axios = require("axios");
require("dotenv").config();

class OpayService {
  constructor() {
    this.merchantId = process.env.OPAY_MERCHANT_ID;
    this.publicKey = process.env.OPAY_PUBLIC_KEY;
    this.privateKey = process.env.OPAY_PRIVATE_KEY;
    this.baseUrl = process.env.OPAY_BASE_URL;
  }

  generateSignature(data) {
    const jsonString = JSON.stringify(data);
    const signature = crypto
      .createHmac("sha512", this.privateKey)
      .update(jsonString)
      .digest("hex");
    return signature;
  }

  async createPayment(orderData) {
    const requestData = {
      country: "NG",
      reference: orderData.reference,
      amount: {
        total: Math.round(orderData.totalAmount * 100),
        currency: "NGN",
      },
      returnUrl: `${process.env.BASE_URL}/api/payment/return`,
      callbackUrl: `${process.env.BASE_URL}/api/payment/callback`,
      cancelUrl: `${process.env.BASE_URL}/api/payment/cancel`,
      userInfo: {
        userEmail: orderData.customerEmail || "customer@example.com",
        userId: orderData.reference,
        userMobile: orderData.customerPhone,
        userName: orderData.customerName || "Customer",
      },
      product: {
        name: "Food Order",
        description: `Order #${orderData.orderNumber}`,
      },
      expireAt: 1800,
    };

    const signature = this.generateSignature(requestData);

    console.log("Request Data:", JSON.stringify(requestData, null, 2));
    console.log("Signature:", signature);

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/international/cashier/create`,
        requestData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.publicKey}`,
            MerchantId: this.merchantId,
            signature: signature,
          },
        }
      );

      console.log("Opay Response:", response.data);
      return response.data;
    } catch (error) {
      console.error("Opay payment creation error:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      throw new Error(
        `Failed to create payment: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  async verifyPayment(reference) {
    const requestData = {
      reference: reference,
      orderNo: reference,
    };

    const signature = this.generateSignature(requestData);

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/international/cashier/status`,
        requestData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.publicKey}`,
            MerchantId: this.merchantId,
            signature: signature,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Opay payment verification error:", {
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

  verifyCallbackSignature(payload, signature) {
    const calculatedSignature = crypto
      .createHmac("sha512", this.privateKey)
      .update(JSON.stringify(payload))
      .digest("hex");
    return calculatedSignature === signature;
  }
}

module.exports = OpayService;
