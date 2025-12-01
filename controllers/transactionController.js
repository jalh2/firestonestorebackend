const Transaction = require('../models/Transaction');
const Product = require('../models/Product');

// Transaction controller methods will be added here

const Credit = require('../models/Credit'); // Make sure Credit model is imported
const createTransaction = async (req, res) => {
  console.log('[TransactionController] Entered createTransaction function.');
  try {
    const { 
      productsSold, 
      currency, 
      store, 
      amountReceivedLRD,
      amountReceivedUSD,
      change,
      changeCurrency,
      totalLRD,
      totalUSD,
      currencyRate,
      customerName, // Added for credit transactions
      // New discount fields
      discountType,
      discountValue,
      discountAmount,
      subtotal,
      cashierId,
      cashierName
    } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required' });
    }

    // Use the provided currency rate or default to 197 if not provided
    const EXCHANGE_RATE = currencyRate || 197;

    // Enhanced products with names and prices
    const enhancedProductsSold = [];

    // Validate products and update inventory
    for (const item of productsSold) {
      const product = await Product.findOne({ _id: item.product, store });
      if (!product) {
        return res.status(404).json({ error: `Product ${item.product} not found in store ${store}` });
      }
      if (product.pieces < item.quantity) {
        return res.status(400).json({ error: `Insufficient quantity for product ${product.item}` });
      }

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

    // Validate payment information based on currency
    if (currency === 'LRD') {
      if (typeof amountReceivedLRD !== 'number' || amountReceivedLRD < totalLRD) {
        return res.status(400).json({ error: 'Amount received in LRD must be greater than or equal to the total' });
      }
    } else if (currency === 'USD') {
      if (typeof amountReceivedUSD !== 'number' || amountReceivedUSD < totalUSD) {
        return res.status(400).json({ error: 'Amount received in USD must be greater than or equal to the total' });
      }
    } else if (currency === 'BOTH') {
      if (typeof amountReceivedLRD !== 'number' || typeof amountReceivedUSD !== 'number') {
        return res.status(400).json({ error: 'Both LRD and USD amounts must be provided for split payment' });
      }
      
      // Check if combined payment is sufficient using the dynamic exchange rate
      const totalPaymentValueLRD = amountReceivedLRD + (amountReceivedUSD * EXCHANGE_RATE);
      
      if (totalPaymentValueLRD < totalLRD) {
        return res.status(400).json({ error: 'Combined payment amount is insufficient' });
      }
    } else if (currency === 'CREDIT') {
      if (!customerName) {
        return res.status(400).json({ error: 'Customer name is required for credit transactions' });
      }
      // For CREDIT, no cash is received upfront, so no amount validation here.
      // Actual credit limit/balance check would go here if implemented.
    }

    // Create transaction with the appropriate payment details
    const transactionData = {
      productsSold: enhancedProductsSold,
      currency,
      store,
      customerName: currency === 'CREDIT' ? customerName : undefined,
      amountReceivedLRD: currency === 'CREDIT' ? 0 : (currency === 'USD' ? 0 : amountReceivedLRD),
      amountReceivedUSD: currency === 'CREDIT' ? 0 : (currency === 'LRD' ? 0 : amountReceivedUSD),
      change: currency === 'CREDIT' ? 0 : change,
      totalLRD: totalLRD || 0,
      totalUSD: totalUSD || 0,
      // Add discount information
      discountType: discountType || 'none',
      discountValue: discountValue || 0,
      discountAmount: discountAmount || 0,
      subtotal: subtotal || 0
    };

    // Only include changeCurrency for non-credit transactions
    if (currency !== 'CREDIT') {
      transactionData.changeCurrency = currency === 'BOTH' ? changeCurrency : currency;
    }

    const transaction = new Transaction(transactionData);

    await transaction.save();

    if (transaction.currency === 'CREDIT') {
      const creditProductsSold = enhancedProductsSold.map(p => ({
        product: p.product, // ObjectId of the product
        productName: p.productName,
        quantity: p.quantity,
        priceAtSale: p.priceAtSale
      }));

      const creditSale = new Credit({
        customerName: transaction.customerName,
        store: transaction.store,
        productsSold: creditProductsSold,
        totalLRD: transaction.totalLRD,
        totalUSD: transaction.totalUSD,
        status: 'pending',
        preferredCurrency: transaction.store === 'store1' ? 'LRD' : 'USD', // Example default
        transactionId: transaction._id
      });
      await creditSale.save();

      const updatedTransaction = await Transaction.findByIdAndUpdate(
        transaction._id,
        { $set: { creditId: creditSale._id } },
        { new: true }
      );
      res.status(201).json(updatedTransaction || transaction);
    } else {
      res.status(201).json(transaction);
    }
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
    const { startDate, endDate, store, allStores, cashierId } = req.query;
    
    if (!allStores && !store) {
      return res.status(400).json({ error: 'Either store parameter or allStores flag is required' });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Build query based on whether we want all stores or a specific store
    const baseQuery = {
      date: {
        $gte: start,
        $lte: end
      }
    };

    if (!allStores) {
      baseQuery.store = store;
    }

    if (cashierId) {
      baseQuery.cashierId = cashierId;
    }

    // Get sales transactions
    const salesQuery = { ...baseQuery, type: 'sale' };
    const salesTransactions = await Transaction.find(salesQuery).sort({ date: -1 });

    // Get return transactions
    const returnsQuery = { ...baseQuery, type: 'return' };
    const returnTransactions = await Transaction.find(returnsQuery).sort({ date: -1 });

    // Get recent transactions with payment details (both sales and returns)
    const recentTransactionsQuery = { ...baseQuery, type: { $in: ['sale', 'return'] } };
    const recentTransactions = await Transaction.find(recentTransactionsQuery)
      .sort({ date: -1 })
      .limit(50)
      .select('_id date store currency totalLRD totalUSD amountReceivedLRD amountReceivedUSD change productsSold type');

    // Process transactions for report
    let dailyTotals = {};
    let productTotals = {};
    let storeTotals = {};
    let overallTotals = { 
      totalLRD: 0, 
      totalUSD: 0, 
      totalItems: 0, 
      totalTransactions: 0,
      totalReturns: 0,
      totalAmountReceivedLRD: 0,
      totalAmountReceivedUSD: 0,
      totalChangeLRD: 0,
      totalChangeUSD: 0
    };

    // Process sales transactions
    salesTransactions.forEach(transaction => {
      // Process daily totals
      const dateKey = transaction.date.toISOString().split('T')[0];
      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = {
          date: dateKey,
          totalLRD: 0,
          totalUSD: 0,
          transactions: 0,
          returns: 0,
          items: 0
        };
      }

      // Calculate actual sale values based on transaction currency
      let actualSaleLRD = 0;
      let actualSaleUSD = 0;
      const subtotalLRDFromProducts = transaction.productsSold.reduce((acc, p) => acc + ((p.priceAtSale.LRD || 0) * p.quantity), 0);
      const subtotalUSDFromProducts = transaction.productsSold.reduce((acc, p) => acc + ((p.priceAtSale.USD || 0) * p.quantity), 0);

      if (transaction.currency === 'LRD') {
        actualSaleLRD = subtotalLRDFromProducts - (transaction.discountAmount && transaction.discountAmount.LRD || 0);
      } else if (transaction.currency === 'USD') {
        actualSaleUSD = subtotalUSDFromProducts - (transaction.discountAmount && transaction.discountAmount.USD || 0);
      } else if (transaction.currency === 'BOTH') {
        actualSaleLRD = transaction.totalLRD || 0;
        actualSaleUSD = transaction.totalUSD || 0;
      }

      // Update daily totals
      dailyTotals[dateKey].totalLRD += actualSaleLRD;
      overallTotals.totalLRD += actualSaleLRD;
      dailyTotals[dateKey].totalUSD += actualSaleUSD;
      overallTotals.totalUSD += actualSaleUSD;
      dailyTotals[dateKey].transactions += 1;
      overallTotals.totalTransactions += 1;

      // Track payment details for overall totals from sales transactions
      if (transaction.amountReceivedLRD) {
        overallTotals.totalAmountReceivedLRD += transaction.amountReceivedLRD;
      }
      if (transaction.amountReceivedUSD) {
        overallTotals.totalAmountReceivedUSD += transaction.amountReceivedUSD;
      }
      // Use specific changeLRD and changeUSD fields from the transaction model
      if (transaction.changeLRD) { 
        overallTotals.totalChangeLRD += transaction.changeLRD;
      }
      if (transaction.changeUSD) { 
        overallTotals.totalChangeUSD += transaction.changeUSD;
      }

      // Process store totals
      if (!storeTotals[transaction.store]) {
        storeTotals[transaction.store] = {
          store: transaction.store,
          totalLRD: 0,
          totalUSD: 0,
          transactions: 0,
          returns: 0,
          items: 0
        };
      }

      // Update store totals (using already calculated actualSaleLRD and actualSaleUSD)
      storeTotals[transaction.store].totalLRD += actualSaleLRD;
      storeTotals[transaction.store].totalUSD += actualSaleUSD;
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
            quantityReturned: 0,
            totalLRD: 0,
            totalUSD: 0
          };
        }

        productTotals[productKey].quantitySold += quantity;

        // Calculate product revenue based on transaction currency (gross values for product-level reporting)
        let productSaleLRDValue = 0;
        let productSaleUSDValue = 0;
        if (transaction.currency === 'LRD') {
          productSaleLRDValue = (product.priceAtSale.LRD || 0) * quantity;
        } else if (transaction.currency === 'USD') {
          productSaleUSDValue = (product.priceAtSale.USD || 0) * quantity;
        } else if (transaction.currency === 'BOTH') {
          productSaleLRDValue = (product.priceAtSale.LRD || 0) * quantity;
          productSaleUSDValue = (product.priceAtSale.USD || 0) * quantity;
        }
        productTotals[productKey].totalLRD += productSaleLRDValue;
        productTotals[productKey].totalUSD += productSaleUSDValue;
      });
    });

    // Process return transactions
    returnTransactions.forEach(transaction => {
      // Process daily totals
      const dateKey = transaction.date.toISOString().split('T')[0];
      if (!dailyTotals[dateKey]) {
        dailyTotals[dateKey] = {
          date: dateKey,
          totalLRD: 0,
          totalUSD: 0,
          transactions: 0,
          returns: 0,
          items: 0
        };
      }

      // Calculate actual return values based on transaction currency
      let actualReturnLRD = 0;
      let actualReturnUSD = 0;
      const subtotalLRDFromReturnProducts = transaction.productsSold.reduce((acc, p) => acc + ((p.priceAtSale.LRD || 0) * p.quantity), 0);
      const subtotalUSDFromReturnProducts = transaction.productsSold.reduce((acc, p) => acc + ((p.priceAtSale.USD || 0) * p.quantity), 0);

      if (transaction.currency === 'LRD') {
        actualReturnLRD = subtotalLRDFromReturnProducts - (transaction.discountAmount && transaction.discountAmount.LRD || 0);
      } else if (transaction.currency === 'USD') {
        actualReturnUSD = subtotalUSDFromReturnProducts - (transaction.discountAmount && transaction.discountAmount.USD || 0);
      } else if (transaction.currency === 'BOTH') {
        actualReturnLRD = transaction.totalLRD || 0;
        actualReturnUSD = transaction.totalUSD || 0;
      }

      // Update daily totals for returns
      dailyTotals[dateKey].totalLRD -= actualReturnLRD;
      overallTotals.totalLRD -= actualReturnLRD;
      dailyTotals[dateKey].totalUSD -= actualReturnUSD;
      overallTotals.totalUSD -= actualReturnUSD;
      dailyTotals[dateKey].returns += 1;
      overallTotals.totalReturns += 1;

      // Process store totals
      if (!storeTotals[transaction.store]) {
        storeTotals[transaction.store] = {
          store: transaction.store,
          totalLRD: 0,
          totalUSD: 0,
          transactions: 0,
          returns: 0,
          items: 0
        };
      }

      // Update store totals for returns (using already calculated actualReturnLRD and actualReturnUSD)
      storeTotals[transaction.store].totalLRD -= actualReturnLRD;
      storeTotals[transaction.store].totalUSD -= actualReturnUSD;
      storeTotals[transaction.store].returns += 1;

      // Process product totals and item counts for returns
      transaction.productsSold.forEach(product => {
        const quantity = product.quantity || 0;
        dailyTotals[dateKey].items -= quantity; // Subtract returned items from daily total
        storeTotals[transaction.store].items -= quantity; // Subtract returned items from store total
        overallTotals.totalItems -= quantity; // Subtract returned items from overall total

        const productKey = `${product.productName}_${transaction.store}`;
        if (!productTotals[productKey]) {
          productTotals[productKey] = {
            name: product.productName,
            store: transaction.store,
            quantitySold: 0,
            quantityReturned: 0,
            totalLRD: 0,
            totalUSD: 0
          };
        }

        productTotals[productKey].quantityReturned += quantity;

        // Calculate product value for returns based on transaction currency (gross values for product-level reporting)
        let productReturnLRDValue = 0;
        let productReturnUSDValue = 0;
        if (transaction.currency === 'LRD') {
          productReturnLRDValue = (product.priceAtSale.LRD || 0) * quantity;
        } else if (transaction.currency === 'USD') {
          productReturnUSDValue = (product.priceAtSale.USD || 0) * quantity;
        } else if (transaction.currency === 'BOTH') {
          productReturnLRDValue = (product.priceAtSale.LRD || 0) * quantity;
          productReturnUSDValue = (product.priceAtSale.USD || 0) * quantity;
        }
        productTotals[productKey].totalLRD -= productReturnLRDValue;
        productTotals[productKey].totalUSD -= productReturnUSDValue;
      });
    });

    // Ensure no negative values in the totals
    Object.keys(dailyTotals).forEach(key => {
      dailyTotals[key].totalLRD = Math.max(0, dailyTotals[key].totalLRD);
      dailyTotals[key].totalUSD = Math.max(0, dailyTotals[key].totalUSD);
      dailyTotals[key].items = Math.max(0, dailyTotals[key].items);
    });

    Object.keys(storeTotals).forEach(key => {
      storeTotals[key].totalLRD = Math.max(0, storeTotals[key].totalLRD);
      storeTotals[key].totalUSD = Math.max(0, storeTotals[key].totalUSD);
      storeTotals[key].items = Math.max(0, storeTotals[key].items);
    });

    Object.keys(productTotals).forEach(key => {
      productTotals[key].totalLRD = Math.max(0, productTotals[key].totalLRD);
      productTotals[key].totalUSD = Math.max(0, productTotals[key].totalUSD);
    });

    overallTotals.totalLRD = Math.max(0, overallTotals.totalLRD);
    overallTotals.totalUSD = Math.max(0, overallTotals.totalUSD);
    overallTotals.totalItems = Math.max(0, overallTotals.totalItems);

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

// Handle product returns
const createReturnTransaction = async (req, res) => {
  try {
    const { 
      productsReturned, 
      currency, 
      store, 
      returnReason,
      originalTransactionId
    } = req.body;

    if (!store) {
      return res.status(400).json({ error: 'Store is required' });
    }

    if (!productsReturned || !Array.isArray(productsReturned) || productsReturned.length === 0) {
      return res.status(400).json({ error: 'At least one product must be returned' });
    }

    // Enhanced products with names and prices
    const enhancedProductsReturned = [];
    let totalLRD = 0;
    let totalUSD = 0;

    // Validate products and update inventory
    for (const item of productsReturned) {
      const product = await Product.findOne({ _id: item.product, store });
      if (!product) {
        return res.status(404).json({ error: `Product ${item.product} not found in store ${store}` });
      }

      // Validate quantity
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: `Invalid quantity for product ${product.item}` });
      }

      // Update product quantity (add back to inventory)
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { pieces: item.quantity } }
      );

      // Calculate totals
      const itemTotalLRD = product.priceLRD * item.quantity;
      const itemTotalUSD = product.priceUSD * item.quantity;
      totalLRD += itemTotalLRD;
      totalUSD += itemTotalUSD;

      // Add enhanced product information
      enhancedProductsReturned.push({
        product: item.product,
        productName: product.item,
        quantity: item.quantity,
        priceAtSale: {
          USD: product.priceUSD,
          LRD: product.priceLRD
        }
      });
    }

    // Create return transaction
    const transaction = new Transaction({
      type: 'return',
      productsSold: enhancedProductsReturned, // Reusing productsSold field for returned products
      currency,
      store,
      totalLRD: totalLRD,
      totalUSD: totalUSD,
      returnReason: returnReason || 'No reason provided',
      originalTransaction: originalTransactionId || null
    });

    await transaction.save();
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Return transaction error:', error);
    res.status(400).json({ error: error.message });
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
  getTopProducts,
  createReturnTransaction
};
