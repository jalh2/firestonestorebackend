const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  type: { type: String, enum: ['sale', 'restock', 'return'], default: 'sale' },
  store: {
    type: String,
    required: true,
    trim: true
  },
  currency: { type: String, required: true, enum: ['LRD', 'USD', 'BOTH', 'CREDIT'], default: 'LRD' },
  customerName: {
    type: String,
    trim: true
  },
  creditId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Credit',
    default: null
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
  // Discount information
  discountType: { 
    type: String, 
    enum: ['percentage', 'fixed_lrd', 'fixed_usd', 'none'], 
    default: 'none' 
  },
  discountValue: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  subtotal: {
    type: Number,
    default: 0
  },
  amountReceivedLRD: {
    type: Number,
    required: function() { return (this.currency === 'LRD' || this.currency === 'BOTH') && this.currency !== 'CREDIT'; },
    default: 0
  },
  amountReceivedUSD: {
    type: Number,
    required: function() { return (this.currency === 'USD' || this.currency === 'BOTH') && this.currency !== 'CREDIT'; },
    default: 0
  },
  change: {
    type: Number,
    default: 0
  },
  changeCurrency: {
    type: String,
    enum: ['LRD', 'USD', null],
    required: function() { 
      // Only require changeCurrency for BOTH currency payments
      return this.currency === 'BOTH'; 
    },
    default: function() { 
      // For credit transactions, return undefined (will be set to null by MongoDB)
      if (this.currency === 'CREDIT') return undefined;
      // For BOTH, default to LRD, otherwise use the currency
      return this.currency === 'BOTH' ? 'LRD' : this.currency;
    }
  },
  totalLRD: { 
    type: Number, 
    default: 0
  },
  totalUSD: { 
    type: Number, 
    default: 0
  },
  returnReason: {
    type: String,
    trim: true
  },
  originalTransaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  cashierId: {
    type: String,
    trim: true
  },
  cashierName: {
    type: String,
    trim: true
  },
  createdAt: { type: Date, default: Date.now }
});

// Create index for store and date for efficient querying of store transactions
transactionSchema.index({ store: 1, date: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
