const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },
  type: { type: String, required: true, enum: ['sale', 'restock'], default: 'sale' },
  currency: { type: String, required: true, enum: ['LRD', 'USD'], default: 'LRD' },
  store: {
    type: String,
    required: true,
    trim: true
  },
  productsSold: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true }, 
    quantity: { type: Number, required: true },
    priceAtSale: { 
      USD: { type: Number, required: true },
      LRD: { type: Number, required: true }
    }
  }],
  totalLRD: { 
    type: Number, 
    required: function() { return this.currency === 'LRD'; },
    default: 0
  },
  totalUSD: { 
    type: Number, 
    required: function() { return this.currency === 'USD'; },
    default: 0
  },
  amountReceived: {
    type: Number,
    required: true
  },
  change: {
    type: Number,
    required: true,
    default: 0
  },
  createdAt: { type: Date, default: Date.now }
});

// Create index for store and date for efficient querying of store transactions
transactionSchema.index({ store: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
