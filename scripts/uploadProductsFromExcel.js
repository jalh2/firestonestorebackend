#!/usr/bin/env node

/*
Usage examples:
  node backend/scripts/uploadProductsFromExcel.js --file path/to/products.xlsx --store Main --set-pieces
  npm run upload:products -- --file path/to/products.xlsx --store Main --dry-run

Columns expected in Excel (first sheet):
  item (required), measurement, type, category, priceLRD, priceUSD, pieces, barcode, compartment, shelve, store, image
Notes:
  - Upserts by compound key { item, store }
  - By default DOES NOT overwrite remote pieces unless --set-pieces is provided
  - Always touches updatedAt on remote; sets createdAt on insert
*/

const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load backend .env for REMOTE_MONGODB_URI
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const REMOTE_URI = process.env.REMOTE_MONGODB_URI;
if (!REMOTE_URI) {
  console.error('ERROR: REMOTE_MONGODB_URI is not set. Please add it to backend/.env');
  process.exit(1);
}

// Minimal Product schema aligned with backend/models/Product.js
const productSchema = new mongoose.Schema({
  item: { type: String, required: true },
  measurement: { type: String },
  type: { type: String },
  category: { type: String },
  priceLRD: { type: Number },
  priceUSD: { type: Number },
  pieces: { type: Number },
  pendingPlus: { type: Number, default: 0 },
  pendingMinus: { type: Number, default: 0 },
  totalLRD: { type: Number },
  totalUSD: { type: Number },
  cts: { type: Number },
  barcode: { type: String },
  compartment: { type: String },
  shelve: { type: String },
  store: { type: String, required: true, trim: true },
  image: { type: String },
}, { timestamps: true });
productSchema.index({ item: 1, store: 1 }, { unique: true });

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { setPieces: false, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--file':
        out.file = args[++i];
        break;
      case '--store':
        out.store = args[++i];
        break;
      case '--set-pieces':
        out.setPieces = true;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      default:
        console.warn('Unknown arg:', a);
    }
  }
  if (!out.file) {
    console.error('Missing --file path/to.xlsx');
    process.exit(1);
  }
  if (!fs.existsSync(out.file)) {
    console.error('File not found:', out.file);
    process.exit(1);
  }
  return out;
}

function toNumber(v) {
  if (v === undefined || v === null) return undefined;
  // If already a finite number, return as-is
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  // Normalize common numeric string formats: remove commas, currency symbols, spaces, and handle (x) negatives
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return undefined;
    // Convert (123.45) -> -123.45
    const parenMatch = trimmed.match(/^\((.*)\)$/);
    const sign = parenMatch ? -1 : 1;
    const core = (parenMatch ? parenMatch[1] : trimmed)
      .replace(/[,\s]/g, '') // remove commas and spaces
      .replace(/[^0-9.+\-]/g, ''); // strip currency and other symbols
    const n = Number(core) * sign;
    return Number.isFinite(n) ? n : undefined;
  }
  // Fallback: attempt coercion
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const { file, store: defaultStore, setPieces, dryRun } = parseArgs();
  console.log('Upload Products From Excel');
  console.log('- file:', file);
  console.log('- default store:', defaultStore || '(none)');
  console.log('- setPieces:', setPieces);
  console.log('- dryRun:', dryRun);

  const wb = xlsx.readFile(file);
  const firstSheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });
  console.log(`Read ${rows.length} rows from sheet '${firstSheetName}'`);

  // Prepare remote connection and model
  const conn = await mongoose.createConnection(REMOTE_URI, {
    serverSelectionTimeoutMS: 15000,
    retryWrites: true,
  }).asPromise();
  const ProductRemote = conn.model('Product', productSchema, 'products');

  const ops = [];
  let skipped = 0;
  for (const row of rows) {
    const item = (row.item || row.Item || row.ITEM || '').toString().trim();
    const rowStore = (row.store || row.Store || row.STORE || defaultStore || '').toString().trim();
    if (!item || !rowStore) {
      skipped++;
      continue;
    }

    const doc = {
      item,
      store: rowStore,
    };

    // Map optional fields with normalization
    const mapping = {
      measurement: row.measurement ?? row.Measurement ?? row.MEASUREMENT,
      type: row.type ?? row.Type ?? row.TYPE,
      category: row.category ?? row.Category ?? row.CATEGORY,
      priceLRD: toNumber(row.priceLRD ?? row.PriceLRD ?? row.pricelrd ?? row.PRICELRD),
      priceUSD: toNumber(row.priceUSD ?? row.PriceUSD ?? row.priceusd ?? row.PRICEUSD),
      pieces: toNumber(row.pieces ?? row.Pieces ?? row.PIECES),
      barcode: row.barcode ?? row.Barcode ?? row.BARCODE,
      compartment: row.compartment ?? row.Compartment ?? row.COMPartment,
      shelve: row.shelve ?? row.Shelve ?? row.SHELVE,
      image: row.image ?? row.Image ?? row.IMAGE,
      cts: toNumber(row.cts ?? row.CTS),
    };

    // Compute totals from pieces and prices to avoid NaN/0.00 from malformed sheet totals
    const computedTotals = {};
    if (typeof mapping.pieces === 'number' && typeof mapping.priceLRD === 'number') {
      const t = mapping.pieces * mapping.priceLRD;
      if (Number.isFinite(t)) computedTotals.totalLRD = t;
    }
    if (typeof mapping.pieces === 'number' && typeof mapping.priceUSD === 'number') {
      const t = mapping.pieces * mapping.priceUSD;
      if (Number.isFinite(t)) computedTotals.totalUSD = t;
    }

    // Build update document
    const $set = {};
    for (const [k, v] of Object.entries(mapping)) {
      if (v !== undefined && v !== null && k !== 'pieces') {
        $set[k] = v;
      }
    }
    // Always ensure identifiers are set on upsert
    $set.item = item;
    $set.store = rowStore;

    const $setOnInsert = { createdAt: new Date() };
    const update = { $set, $currentDate: { updatedAt: true }, $setOnInsert };

    // Pieces handling:
    // - Without --set-pieces: set pieces only on INSERTs (do not overwrite existing)
    // - With --set-pieces: set pieces on UPDATEs too
    if (typeof mapping.pieces === 'number') {
      if (setPieces) {
        update.$set.pieces = mapping.pieces;
        // Only recalc totals on update when pieces is being set
        for (const [k, v] of Object.entries(computedTotals)) {
          update.$set[k] = v;
        }
      } else {
        // Set pieces (and totals) only when the doc is inserted
        update.$setOnInsert.pieces = mapping.pieces;
        for (const [k, v] of Object.entries(computedTotals)) {
          update.$setOnInsert[k] = v;
        }
      }
    }

    ops.push({
      updateOne: {
        filter: { item, store: rowStore },
        update,
        upsert: true,
      }
    });
  }

  console.log(`Prepared ${ops.length} upsert operations. Skipped ${skipped} row(s) without item/store.`);

  if (dryRun) {
    console.log('Dry run enabled: no writes performed. Exiting.');
    await conn.close();
    process.exit(0);
  }

  if (ops.length === 0) {
    console.log('No operations to perform. Exiting.');
    await conn.close();
    process.exit(0);
  }

  try {
    const result = await ProductRemote.bulkWrite(ops, { ordered: false });
    console.log('Bulk upsert completed. Result summary:');
    console.log(JSON.stringify({
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedCount: result.upsertedCount,
    }, null, 2));
  } catch (err) {
    console.error('Bulk upsert error:', err && err.message ? err.message : err);
    // Log duplicate errors succinctly
    if (err && err.writeErrors) {
      const dupes = err.writeErrors.filter(e => (e.code === 11000));
      if (dupes.length) {
        console.error(`Encountered ${dupes.length} duplicate key errors. Ensure compound index {item, store} exists.`);
      }
    }
  } finally {
    await conn.close();
  }
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
