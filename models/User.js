const mongoose = require('mongoose');
const crypto = require('crypto');

// Drop existing indexes to ensure clean state
mongoose.connection.on('open', async () => {
  try {
    // Only run in production to avoid affecting development environments
    if (process.env.NODE_ENV === 'production') {
      const userCollection = mongoose.connection.collection('users');
      const indexes = await userCollection.indexes();
      
      // Find the old username index
      const usernameIndex = indexes.find(index => 
        index.key && index.key.username === 1 && Object.keys(index.key).length === 1
      );
      
      // Drop it if it exists
      if (usernameIndex) {
        console.log('Dropping old username index:', usernameIndex.name);
        await userCollection.dropIndex(usernameIndex.name);
        console.log('Old username index dropped successfully');
      }
    }
  } catch (error) {
    console.error('Error updating indexes:', error);
  }
});

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  salt: {
    type: String
  },
  userType: {
    type: String,
    enum: ['admin', 'employee', 'manager'],
    required: true,
    default: 'employee'
  },
  store: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index on username and store to allow same username in different stores
userSchema.index({ username: 1, store: 1 }, { unique: true });

// Hash password before saving
userSchema.pre('save', function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  // Generate a random salt
  const salt = crypto.randomBytes(16).toString('hex');
  
  // Hash the password with the salt
  const hash = crypto
    .pbkdf2Sync(this.password, salt, 1000, 64, 'sha512')
    .toString('hex');
    
  this.salt = salt;
  this.password = hash;
  next();
});

// Method to compare password
userSchema.methods.comparePassword = function(candidatePassword) {
  const hash = crypto
    .pbkdf2Sync(candidatePassword, this.salt, 1000, 64, 'sha512')
    .toString('hex');
  return this.password === hash;
};

module.exports = mongoose.model('User', userSchema);
