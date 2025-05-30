const express = require('express');
const router = express.Router();
const currencyRateController = require('../controllers/currencyRateController');

// Get current currency rate - accessible to all users
router.get('/', currencyRateController.getCurrentRate);

// Update currency rate
router.put('/', currencyRateController.updateRate);

module.exports = router;
