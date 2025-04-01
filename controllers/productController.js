const Product = require('../models/Product');
const Transaction = require('../models/Transaction');

const createProduct = async (req, res) => {
  try {
    const productData = {
      ...req.body,
      image: req.file ? `/uploads/${req.file.filename}` : null
    };

    // Ensure store is provided
    if (!productData.store) {
      throw new Error('Store is required');
    }

    // Calculate totals manually in case they're not provided
    if (productData.pieces && productData.priceLRD) {
      productData.totalLRD = productData.pieces * productData.priceLRD;
    }
    
    if (productData.pieces && productData.priceUSD) {
      productData.totalUSD = productData.pieces * productData.priceUSD;
    }

    const product = new Product(productData);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const store = req.query.store;
    const lowStock = req.query.lowStock === 'true';
    const barcode = req.query.barcode;
    const skip = (page - 1) * limit;

    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    // Build query
    const query = { store };
    
    // Add low stock filter if requested
    if (lowStock) {
      query.pieces = { $lte: 7 };
    }

    // Add barcode filter if provided
    if (barcode) {
      query.barcode = barcode;
      console.log('Searching for barcode:', barcode);
      console.log('Query:', query);
    }

    // Get total count for pagination with store filter
    const totalCount = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit);

    // Get paginated products for specific store
    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(lowStock || barcode ? 0 : skip) // Skip pagination for low stock items or barcode search
      .limit(lowStock || barcode ? 100 : limit); // Use higher limit for low stock items or barcode search
    
    // Get transactions for each product to calculate totals
    const productsWithTotals = await Promise.all(products.map(async (product) => {
      const transactions = await Transaction.find({
        'productsSold.product': product._id,
        type: 'sale'
      });

      let totalSalesLRD = 0;
      let totalSalesUSD = 0;
      let totalQuantitySold = 0;

      transactions.forEach(transaction => {
        const productSold = transaction.productsSold.find(
          p => p.product.toString() === product._id.toString()
        );
        if (productSold) {
          totalQuantitySold += productSold.quantity;
          if (transaction.currency === 'LRD') {
            totalSalesLRD += productSold.quantity * productSold.price;
          } else {
            totalSalesUSD += productSold.quantity * productSold.price;
          }
        }
      });

      return {
        ...product.toObject(),
        totalSalesLRD,
        totalSalesUSD,
        totalQuantitySold
      };
    }));

    res.json({
      products: productsWithTotals,
      pagination: {
        currentPage: page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        totalItems: totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Get transactions for this product
    const transactions = await Transaction.find({
      'productsSold.product': product._id,
      type: 'sale'
    });

    let totalSalesLRD = 0;
    let totalSalesUSD = 0;
    let totalQuantitySold = 0;

    transactions.forEach(transaction => {
      const productSold = transaction.productsSold.find(
        p => p.product.toString() === product._id.toString()
      );
      if (productSold) {
        totalQuantitySold += productSold.quantity;
        if (transaction.currency === 'LRD') {
          totalSalesLRD += productSold.quantity * productSold.price;
        } else {
          totalSalesUSD += productSold.quantity * productSold.price;
        }
      }
    });

    res.json({
      ...product.toObject(),
      totalSalesLRD,
      totalSalesUSD,
      totalQuantitySold
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Calculate totals if pieces or prices are being updated
    if ((updates.pieces || updates.priceLRD) && (updates.pieces !== undefined || updates.priceLRD !== undefined)) {
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      const pieces = updates.pieces !== undefined ? updates.pieces : product.pieces;
      const priceLRD = updates.priceLRD !== undefined ? updates.priceLRD : product.priceLRD;
      
      if (pieces && priceLRD) {
        updates.totalLRD = pieces * priceLRD;
      }
    }
    
    if ((updates.pieces || updates.priceUSD) && (updates.pieces !== undefined || updates.priceUSD !== undefined)) {
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      const pieces = updates.pieces !== undefined ? updates.pieces : product.pieces;
      const priceUSD = updates.priceUSD !== undefined ? updates.priceUSD : product.priceUSD;
      
      if (pieces && priceUSD) {
        updates.totalUSD = pieces * priceUSD;
      }
    }
    
    const product = await Product.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateProductInventory = async (req, res) => {
  try {
    const updateData = {
      ...req.body
    };

    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }

    // Calculate totals if pieces or prices are being updated
    if ((updateData.pieces || updateData.priceLRD) && (updateData.pieces !== undefined || updateData.priceLRD !== undefined)) {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const pieces = updateData.pieces !== undefined ? updateData.pieces : product.pieces;
      const priceLRD = updateData.priceLRD !== undefined ? updateData.priceLRD : product.priceLRD;
      
      if (pieces && priceLRD) {
        updateData.totalLRD = pieces * priceLRD;
      }
    }
    
    if ((updateData.pieces || updateData.priceUSD) && (updateData.pieces !== undefined || updateData.priceUSD !== undefined)) {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }
      
      const pieces = updateData.pieces !== undefined ? updateData.pieces : product.pieces;
      const priceUSD = updateData.priceUSD !== undefined ? updateData.priceUSD : product.priceUSD;
      
      if (pieces && priceUSD) {
        updateData.totalUSD = pieces * priceUSD;
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAllProducts = async (req, res) => {
  try {
    const { store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    // Delete all products for the specified store
    const result = await Product.deleteMany({ store });
    
    res.status(200).json({ 
      message: 'All products deleted successfully', 
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error deleting all products:', error);
    res.status(500).json({ error: 'Failed to delete products' });
  }
};

const getInventorySummary = async (req, res) => {
  try {
    const { store } = req.query;

    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    // Get all products for the store
    const products = await Product.find({ store });
    
    // Log the query and results for debugging
    console.log(`Inventory summary for store: ${store}`);
    console.log(`Found ${products.length} products`);
    
    // Calculate inventory totals
    let totalInventoryLRD = 0;
    let totalInventoryUSD = 0;
    let totalItems = products.length;
    
    products.forEach(product => {
      if (product.totalLRD) {
        totalInventoryLRD += product.totalLRD;
      } else if (product.pieces && product.priceLRD) {
        totalInventoryLRD += product.pieces * product.priceLRD;
      }
      
      if (product.totalUSD) {
        totalInventoryUSD += product.totalUSD;
      } else if (product.pieces && product.priceUSD) {
        totalInventoryUSD += product.pieces * product.priceUSD;
      }
    });
    
    // Get all sales transactions for the store
    const transactions = await Transaction.find({ 
      store,
      type: 'sale'
    }).populate('productsSold.product');
    
    // Calculate sales totals
    let totalSalesLRD = 0;
    let totalSalesUSD = 0;
    
    transactions.forEach(transaction => {
      // If the transaction has a totalLRD or totalUSD field, use that directly
      if (transaction.currency === 'LRD' && transaction.totalLRD) {
        totalSalesLRD += transaction.totalLRD;
      } else if (transaction.currency === 'USD' && transaction.totalUSD) {
        totalSalesUSD += transaction.totalUSD;
      } else {
        // Otherwise calculate from the productsSold array
        transaction.productsSold.forEach(item => {
          if (transaction.currency === 'LRD') {
            // Use the price field if available, otherwise calculate from priceAtSale
            const price = item.price || item.priceAtSale?.LRD || 0;
            totalSalesLRD += item.quantity * price;
          } else {
            const price = item.price || item.priceAtSale?.USD || 0;
            totalSalesUSD += item.quantity * price;
          }
        });
      }
    });
    
    res.json({
      totalInventoryLRD,
      totalInventoryUSD,
      totalSalesLRD,
      totalSalesUSD,
      totalItems
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  updateProductInventory,
  deleteProduct,
  deleteAllProducts,
  getInventorySummary
};
