const Transaction = require('../models/Transaction');
const Product = require('../models/Product');

// Transaction controller methods will be added here

const createTransaction = async (req, res) => {
  try {
    const { productsSold, currency, store, amountReceived, change } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required' });
    }

    // Calculate total only for selected currency
    let total = 0;
    const enhancedProductsSold = [];

    // Validate products and calculate total
    for (const item of productsSold) {
      const product = await Product.findOne({ _id: item.product, store });
      if (!product) {
        return res.status(404).json({ error: `Product ${item.product} not found in store ${store}` });
      }
      if (product.pieces < item.quantity) {
        return res.status(400).json({ error: `Insufficient quantity for product ${product.item}` });
      }

      // Calculate total based on selected currency
      total += currency === 'LRD' ? 
        product.priceLRD * item.quantity : 
        product.priceUSD * item.quantity;

      // Update product quantity
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { pieces: -item.quantity } }
      );

      // Add enhanced product information
      enhancedProductsSold.push({
        ...item,
        productName: product.item,
        priceAtSale: {
          USD: product.priceUSD,
          LRD: product.priceLRD
        }
      });
    }

    // Validate payment information
    if (typeof amountReceived !== 'number' || amountReceived < total) {
      return res.status(400).json({ error: 'Amount received must be a number greater than or equal to the total' });
    }

    // Create transaction with total only in selected currency, enhanced product info, and payment details
    const transaction = new Transaction({
      ...req.body,
      productsSold: enhancedProductsSold,
      ...(currency === 'LRD' ? { totalLRD: total } : { totalUSD: total }),
      amountReceived,
      change: amountReceived - total
    });

    await transaction.save();
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(400).json({ error: error.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const { store } = req.query;
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const transactions = await Transaction.find({ store })
      .sort({ date: -1 })
      .limit(50);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const { store } = req.query;

    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const transaction = await Transaction.findOne({ _id: id, store });
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionsByDate = async (req, res) => {
  try {
    const { date, store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
      store,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ date: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionsByProduct = async (req, res) => {
  try {
    const { productId, store } = req.params;
    const transactions = await Transaction.find({
      'productsSold.product': productId,
      store,
      type: 'sale'
    }).populate('productsSold.product');

    // Calculate totals
    const totals = transactions.reduce((acc, transaction) => {
      if (transaction.currency === 'LRD') {
        acc.totalLRD += transaction.totalLRD;
      } else {
        acc.totalUSD += transaction.totalUSD;
      }
      acc.totalQuantity += transaction.productsSold[0].quantity;
      return acc;
    }, { totalLRD: 0, totalUSD: 0, totalQuantity: 0 });

    res.json({ 
      transactions,
      totals
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTransactionsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, store } = req.query;
    
    if (!store) {
      return res.status(400).json({ error: 'Store parameter is required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const transactions = await Transaction.find({
      store,
      date: {
        $gte: start,
        $lte: end
      }
    }).sort({ date: -1 });

    // Calculate totals
    let totalLRD = 0;
    let totalUSD = 0;
    let totalItems = 0;

    transactions.forEach(transaction => {
      if (transaction.currency === 'LRD') {
        totalLRD += transaction.totalLRD || 0;
      } else {
        totalUSD += transaction.totalUSD || 0;
      }
      transaction.productsSold.forEach(product => {
        totalItems += product.quantity;
      });
    });

    res.json({
      transactions,
      summary: {
        totalLRD,
        totalUSD,
        totalItems,
        transactionCount: transactions.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, store, allStores } = req.query;
    
    if (!allStores && !store) {
      return res.status(400).json({ error: 'Either store parameter or allStores flag is required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Build query based on whether we want all stores or a specific store
    const query = {
      type: 'sale',
      date: {
        $gte: start,
        $lte: end
      }
    };

    if (!allStores) {
      query.store = store;
    }

    const transactions = await Transaction.find(query).sort({ date: -1 });

    // Get recent transactions with payment details
    const recentTransactions = await Transaction.find(query)
      .sort({ date: -1 })
      .limit(50)
      .select('_id date store currency totalLRD totalUSD amountReceived change productsSold');

    // Process transactions for report
    let dailyTotals = {};
    let productTotals = {};
    let storeTotals = {};
    let overallTotals = { 
      totalLRD: 0, 
      totalUSD: 0, 
      totalItems: 0, 
      totalTransactions: 0,
      totalAmountReceivedLRD: 0,
      totalAmountReceivedUSD: 0,
      totalChangeLRD: 0,
      totalChangeUSD: 0
    };

    transactions.forEach(transaction => {
      // Process daily totals
      const dateKey = transaction.date.toISOString().split('T')[0];
      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = {
          date: dateKey,
          totalLRD: 0,
          totalUSD: 0,
          transactions: 0,
          items: 0
        };
      }

      // Update daily totals
      if (transaction.totalLRD) {
        dailyTotals[dateKey].totalLRD += transaction.totalLRD;
        overallTotals.totalLRD += transaction.totalLRD;
      }
      if (transaction.totalUSD) {
        dailyTotals[dateKey].totalUSD += transaction.totalUSD;
        overallTotals.totalUSD += transaction.totalUSD;
      }
      dailyTotals[dateKey].transactions += 1;
      overallTotals.totalTransactions += 1;

      // Track payment details for overall totals
      if (transaction.currency === 'LRD' && transaction.amountReceived) {
        overallTotals.totalAmountReceivedLRD += transaction.amountReceived;
        if (transaction.change) {
          overallTotals.totalChangeLRD += transaction.change;
        }
      } else if (transaction.currency === 'USD' && transaction.amountReceived) {
        overallTotals.totalAmountReceivedUSD += transaction.amountReceived;
        if (transaction.change) {
          overallTotals.totalChangeUSD += transaction.change;
        }
      }

      // Process store totals
      if (!storeTotals[transaction.store]) {
        storeTotals[transaction.store] = {
          store: transaction.store,
          totalLRD: 0,
          totalUSD: 0,
          transactions: 0,
          items: 0
        };
      }

      // Update store totals
      if (transaction.totalLRD) {
        storeTotals[transaction.store].totalLRD += transaction.totalLRD;
      }
      if (transaction.totalUSD) {
        storeTotals[transaction.store].totalUSD += transaction.totalUSD;
      }
      storeTotals[transaction.store].transactions += 1;

      // Process product totals and item counts
      transaction.productsSold.forEach(product => {
        const quantity = product.quantity || 0;
        dailyTotals[dateKey].items += quantity;
        storeTotals[transaction.store].items += quantity;
        overallTotals.totalItems += quantity;

        const productKey = `${product.productName}_${transaction.store}`;
        if (!productTotals[productKey]) {
          productTotals[productKey] = {
            name: product.productName,
            store: transaction.store,
            quantitySold: 0,
            totalLRD: 0,
            totalUSD: 0
          };
        }

        productTotals[productKey].quantitySold += quantity;

        // Calculate product revenue based on currency
        if (transaction.currency === 'LRD') {
          productTotals[productKey].totalLRD += product.priceAtSale.LRD * quantity;
        } else {
          productTotals[productKey].totalUSD += product.priceAtSale.USD * quantity;
        }
      });
    });

    // Convert objects to arrays for response
    const dailyTotalsArray = Object.values(dailyTotals).sort((a, b) => new Date(b.date) - new Date(a.date));
    const productTotalsArray = Object.values(productTotals).sort((a, b) => b.quantitySold - a.quantitySold);
    const storeTotalsArray = Object.values(storeTotals).sort((a, b) => b.transactions - a.transactions);

    // Add store count to summary
    overallTotals.storeCount = Object.keys(storeTotals).length;

    res.json({
      summary: overallTotals,
      dailyTotals: dailyTotalsArray,
      productTotals: productTotalsArray,
      storeTotals: storeTotalsArray,
      recentTransactions: recentTransactions
    });
  } catch (error) {
    console.error('Error generating sales report:', error);
    res.status(500).json({ error: error.message });
  }
};

const getTopProducts = async (req, res) => {
  try {
    const { startDate, endDate, store } = req.query;
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    const topProducts = await Transaction.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
          store,
          type: 'sale'
        }
      },
      { $unwind: '$productsSold' },
      {
        $group: {
          _id: '$productsSold.product',
          totalQuantity: { $sum: '$productsSold.quantity' },
          totalSalesLRD: { $sum: '$totalLRD' },
          totalSalesUSD: { $sum: '$totalUSD' },
          transactions: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          _id: 1,
          item: '$product.item',
          totalQuantity: 1,
          totalSalesLRD: 1,
          totalSalesUSD: 1,
          transactions: 1
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 }
    ]);

    res.json(topProducts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  getTransactionsByDate,
  getTransactionsByProduct,
  getTransactionsByDateRange,
  getSalesReport,
  getTopProducts
};
