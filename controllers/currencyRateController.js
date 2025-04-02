const CurrencyRate = require('../models/CurrencyRate');

// Get the current currency rate
exports.getCurrentRate = async (req, res) => {
  try {
    const rate = await CurrencyRate.getRate();
    res.status(200).json(rate);
  } catch (error) {
    console.error('Error fetching currency rate:', error);
    res.status(500).json({ error: 'Failed to fetch currency rate' });
  }
};

// Update the currency rate
exports.updateRate = async (req, res) => {
  try {
    const { lrdToUsd } = req.body;
    
    // Validate input
    if (!lrdToUsd || isNaN(lrdToUsd) || lrdToUsd <= 0) {
      return res.status(400).json({ error: 'Invalid currency rate. Please provide a positive number.' });
    }
    
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
    
    res.status(200).json(rate);
  } catch (error) {
    console.error('Error updating currency rate:', error);
    res.status(500).json({ error: 'Failed to update currency rate' });
  }
};
