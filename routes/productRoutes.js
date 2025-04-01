const express = require('express');
const router = express.Router();
const { createProduct, getProducts, getProductById, updateProduct, deleteProduct, deleteAllProducts, getInventorySummary } = require('../controllers/productController');
const upload = require('../middleware/upload');

// Product routes will be added here

// Get inventory summary
router.get('/summary', getInventorySummary);

// Get all products
router.get('/', getProducts);

// Get a specific product
router.get('/:id', getProductById);

// Create a new product with image upload
router.post('/', upload.single('image'), createProduct);

// Update a product with optional image upload
router.put('/:id', upload.single('image'), updateProduct);

// Delete all products for a store
router.delete('/all', deleteAllProducts);

// Delete a product
router.delete('/:id', deleteProduct);

module.exports = router;
