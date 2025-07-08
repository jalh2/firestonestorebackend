const User = require('../models/User');
const crypto = require('crypto');

const registerUser = async (req, res) => {
  try {
    const { username, password, userType, store } = req.body;

    // Check if user already exists in the same store
    const existingUser = await User.findOne({ username, store });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists in this store' });
    }

    // Create new user
    const user = new User({
      username,
      password,
      userType: userType || 'employee',
      store
    });

    try {
      await user.save();
    } catch (saveError) {
      // Handle duplicate key error specifically
      if (saveError.code === 11000) {
        // If the error contains information about the username field only
        if (saveError.message.includes('username_1')) {
          console.log('Detected old index conflict. Attempting to resolve...');
          
          // Check if another user with this username exists in a different store
          const conflictUser = await User.findOne({ username });
          if (conflictUser && conflictUser.store !== store) {
            // This is the case we want to allow - same username, different store
            // Force save by bypassing Mongoose validation
            await User.collection.insertOne({
              username,
              password: user.password,
              salt: user.salt,
              userType: user.userType || 'employee',
              store,
              createdAt: new Date()
            });
            
            // Return the created user
            return res.status(201).json({ 
              username: username,
              userType: userType || 'employee',
              store: store
            });
          } else {
            // Some other duplicate key issue
            return res.status(400).json({ error: 'Username conflict. Please try a different username.' });
          }
        } else {
          // Some other duplicate key issue
          return res.status(400).json({ error: 'Username already exists in this store' });
        }
      }
      // For other errors, just pass through
      throw saveError;
    }

    res.status(201).json({ 
      username: user.username,
      userType: user.userType,
      store: user.store
    });
  } catch (error) {
    console.error('User registration error:', error);
    res.status(400).json({ error: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { username, password, store } = req.body;

    // Find user by username and store combination
    const user = await User.findOne({ username, store });
    if (!user) {
      return res.status(400).json({ error: 'User not found for this store' });
    }

    // Check password using the comparePassword method from our schema
    const isMatch = user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    res.json({ 
      username: user.username,
      userType: user.userType,
      store: user.store
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'username userType store');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateUserType = async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType } = req.body;

    if (!['admin', 'employee', 'manager'].includes(userType)) {
      return res.status(400).json({ error: 'Invalid user type' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { userType },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      username: user.username,
      userType: user.userType,
      store: user.store
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getStores = async (req, res) => {
  try {
    const stores = await User.distinct('store');
    res.json(stores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { password } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = password;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getUsersByStore = async (req, res) => {
  try {
    const { store } = req.params;
    const users = await User.find({ store }, 'username');
    res.json(users.map(user => user.username));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteStore = async (req, res) => {
  try {
    const { store } = req.params;
    
    // Find all users associated with this store
    const users = await User.find({ store });
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'Store not found or has no users' });
    }
    
    // Delete all users associated with this store
    await User.deleteMany({ store });
    
    res.json({ 
      message: `Store "${store}" deleted successfully along with ${users.length} user(s)`,
      deletedUsers: users.length
    });
  } catch (error) {
    console.error('Error deleting store:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUsers,
  updateUserType,
  getStores,
  changePassword,
  deleteUser,
  getUsersByStore,
  deleteStore
};
