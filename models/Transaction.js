const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  type: { type: String, enum: ['sale', 'restock'], default: 'sale' },
  store: {
    type: String,
    required: true,
    trim: true
  },
  currency: { type: String, required: true, enum: ['LRD', 'USD', 'BOTH'], default: 'LRD' },
  productsSold: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true }, 
    quantity: { type: Number, required: true },
    priceAtSale: { 
      USD: { type: Number, required: true },
      LRD: { type: Number, required: true }
    }
  }],
  amountReceivedLRD: {
    type: Number,
    required: function() { return this.currency === 'LRD' || this.currency === 'BOTH'; },
    default: 0
  },
  amountReceivedUSD: {
    type: Number,
    required: function() { return this.currency === 'USD' || this.currency === 'BOTH'; },
    default: 0
  },
  change: {
    type: Number,
    default: 0
  },
  changeCurrency: {
    type: String,
    enum: ['LRD', 'USD'],
    required: function() { return this.currency === 'BOTH'; },
    default: function() { return this.currency; }
  },
  totalLRD: { 
    type: Number, 
    default: 0
  },
  totalUSD: { 
    type: Number, 
    default: 0
  },
  createdAt: { type: Date, default: Date.now }
});

// Create index for store and date for efficient querying of store transactions
transactionSchema.index({ store: 1, date: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
