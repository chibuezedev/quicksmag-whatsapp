const express = require("express");
const router = express.Router();
const restaurantController = require("../controllers/restaurant");

router.get("/", restaurantController.getAllRestaurants);

router.get("/:id", restaurantController.getARestaurant);

router.post("/", restaurantController.createRestaurant);

router.put("/:id", restaurantController.updateRestaurant);

router.delete("/:id", restaurantController.deleteRestaurant);

module.exports = router;
