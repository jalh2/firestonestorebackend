const mongoose = require('mongoose');

const currencyRateSchema = new mongoose.Schema({
  // LRD to USD conversion rate (e.g., 197 means 197 LRD = 1 USD)
  lrdToUsd: {
    type: Number,
    required: true,
    min: 0
  },
  // Last updated timestamp
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// We'll only have one record, so we'll add a static method to get or create it
currencyRateSchema.statics.getRate = async function() {
  const rate = await this.findOne();
  if (rate) {
    return rate;
  }
  
  // If no rate exists, create default rate (197 LRD = 1 USD)
  return await this.create({ lrdToUsd: 197 });
};

const CurrencyRate = mongoose.model('CurrencyRate', currencyRateSchema);

module.exports = CurrencyRate;
