const CurrencyRate = require('../models/CurrencyRate');
const Product = require('../models/Product');

// Get the current currency rate
exports.getCurrentRate = async (req, res) => {
  try {
    const rateDoc = await CurrencyRate.getRate();
    // Frontend expects { rate: number }
    res.status(200).json({ 
      rate: rateDoc.lrdToUsd,
      updatedAt: rateDoc.updatedAt
    });
  } catch (error) {
    console.error('Error fetching currency rate:', error);
    res.status(500).json({ error: 'Failed to fetch currency rate' });
  }
};

// Update the currency rate
exports.updateRate = async (req, res) => {
  try {
    // Frontend sends 'rate', model uses 'lrdToUsd'
    let { lrdToUsd, rate: inputRate } = req.body;
    
    // Use rate if lrdToUsd is not provided
    if (!lrdToUsd && inputRate) {
      lrdToUsd = inputRate;
    }
    
    // Validate input
    if (!lrdToUsd || isNaN(lrdToUsd) || lrdToUsd <= 0) {
      return res.status(400).json({ error: 'Invalid currency rate. Please provide a positive number.' });
    }
    
    console.log(`[CurrencyRate] Updating rate to ${lrdToUsd}. Recalculating product LRD prices...`);

    // Find the existing rate or create a new one
    let rate = await CurrencyRate.findOne();
    
    if (rate) {
      // Update existing rate
      rate.lrdToUsd = lrdToUsd;
      rate.updatedAt = Date.now();
      await rate.save();
    } else {
      // Create new rate
      rate = await CurrencyRate.create({ lrdToUsd });
    }

    // Update all products' LRD prices based on the new rate
    // We use an aggregation pipeline in updateMany to reference existing fields
    const updateResult = await Product.updateMany(
      { priceUSD: { $exists: true, $ne: null } },
      [
        {
          $set: {
            priceLRD: { $multiply: ["$priceUSD", Number(lrdToUsd)] }
          }
        },
        {
          $set: {
            totalLRD: {
              $cond: {
                if: { $ifNull: ["$pieces", false] },
                then: { $multiply: ["$pieces", "$priceLRD"] },
                else: "$totalLRD"
              }
            }
          }
        }
      ]
    );
    
    console.log(`[CurrencyRate] Product update result: Matched ${updateResult.matchedCount}, Modified ${updateResult.modifiedCount}`);
    
    res.status(200).json(rate);
  } catch (error) {
    console.error('Error updating currency rate:', error);
    res.status(500).json({ error: 'Failed to update currency rate' });
  }
};
