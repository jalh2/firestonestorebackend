const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  item: { type: String, required: true },
  measurement: { type: String },
  type: { type: String },
  category: { type: String },
  priceLRD: { type: Number },
  priceUSD: { type: Number },
  pieces: { type: Number },
  totalLRD: { type: Number },
  totalUSD: { type: Number },
  cts: { type: Number },
  barcode: { type: String },
  compartment: { type: String },
  shelve: { type: String },
  store: {
    type: String,
    required: true,
    trim: true
  },
  image: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// Create a compound index for item and store to ensure unique items per store
productSchema.index({ item: 1, store: 1 }, { unique: true });

// Pre-save middleware to calculate totals
productSchema.pre('save', function(next) {
  if (this.pieces && this.priceLRD) {
    this.totalLRD = this.pieces * this.priceLRD;
  }
  
  if (this.pieces && this.priceUSD) {
    this.totalUSD = this.pieces * this.priceUSD;
  }
  
  next();
});

module.exports = mongoose.model('Product', productSchema);
