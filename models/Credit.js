const mongoose = require('mongoose');

const creditSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  customerName: { 
    type: String, 
    required: true,
    trim: true
  },
  store: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  preferredCurrency: {
    type: String,
    enum: ['LRD', 'USD'],
    default: 'LRD'
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
    default: 0
  },
  totalUSD: { 
    type: Number, 
    default: 0
  },
  paidAt: { 
    type: Date
  },
  paymentTransaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  createdAt: { type: Date, default: Date.now }
});

// Create index for store, customerName and date for efficient querying
creditSchema.index({ store: 1, customerName: 1, date: -1 });
creditSchema.index({ store: 1, status: 1 });

const Credit = mongoose.model('Credit', creditSchema);

module.exports = Credit;
