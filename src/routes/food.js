const express = require("express");
const router = express.Router();
const foodController = require("../controllers/food");

router.get("/", foodController.getAllFoods);

router.post("/", foodController.createFood);

router.put("/:id", foodController.updateFood);

router.delete("/:id", foodController.deleteFood);

module.exports = router;