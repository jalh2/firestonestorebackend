const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

// Create a new transaction
router.post('/', transactionController.createTransaction);

// Create a return transaction
router.post('/return', transactionController.createReturnTransaction);

// Get all transactions
router.get('/', transactionController.getTransactions);

// Get transactions by date range
router.get('/range', transactionController.getTransactionsByDateRange);

// Get sales report (daily/weekly/monthly/yearly)
router.get('/report', transactionController.getSalesReport);

// Get top selling products
router.get('/top-products', transactionController.getTopProducts);

// Get transactions by product and store (must come before /:id)
router.get('/product/:productId/:store', transactionController.getTransactionsByProduct);

// Get transactions by date (must come before /:id)
router.get('/date/:date', transactionController.getTransactionsByDate);

// Get a specific transaction (must come last)
router.get('/:id', transactionController.getTransactionById);

module.exports = router;
