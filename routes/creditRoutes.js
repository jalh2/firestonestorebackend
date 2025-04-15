const express = require('express');
const router = express.Router();
const creditController = require('../controllers/creditController');

// Create a new credit
router.post('/', creditController.createCredit);

// Pay for a credit
router.post('/:id/pay', creditController.payCredit);

// Get credit balance summary
router.get('/balance', creditController.getCreditBalance);

// Get all credits
router.get('/', creditController.getCredits);

// Get credits by date range
router.get('/range', creditController.getCreditsByDateRange);

// Get credits by customer name
router.get('/customer', creditController.getCreditsByCustomer);

// Get a specific credit
router.get('/:id', creditController.getCreditById);

module.exports = router;
