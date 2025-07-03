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
    const sortedKeys = Object.keys(data).sort();
    const signString = sortedKeys.map((key) => `${key}=${data[key]}`).join("&");

    const signature = crypto
      .createHmac("sha512", this.privateKey)
      .update(signString)
      .digest("hex");

    return signature;
  }

  async createPayment(orderData) {
    const requestData = {
      reference: orderData.reference,
      mchShortName: "QuickSmag",
      productName: "Food Order",
      productDesc: `Order #${orderData.orderNumber}`,
      userPhone: `+${orderData.customerPhone}`,
      userRequestIp: "127.0.0.1",
      amount: Math.round(orderData.totalAmount * 100),
      currency: "NGN",
      payMethods: ["account", "qrcode", "ussd", "transfer"],
      payTypes: ["BalancePayment", "BonusPayment"],
      callbackUrl: `${process.env.BASE_URL}/api/payment/callback`,
      returnUrl: `${process.env.BASE_URL}/api/payment/return`,
      expireAt: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
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
            MerchantId: this.merchantId,
            Authorization: `Bearer ${this.publicKey}`,
            signature: signature,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error(
        "Opay payment creation error:",
        error.response?.data || error.message
      );
      throw new Error("Failed to create payment");
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
            MerchantId: this.merchantId,
            Authorization: `Bearer ${this.publicKey}`,
            signature: signature,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error(
        "Opay payment verification error:",
        error.response?.data || error.message
      );
      throw new Error("Failed to verify payment");
    }
  }
}

module.exports = OpayService;
