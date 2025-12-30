const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    
    if (!mongoURI) {
      console.warn('MONGODB_URI not set - running without database (user accounts disabled)');
      return;
    }
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    // Increase max listeners to prevent warnings with the article caching system
    mongoose.connection.setMaxListeners(20);
    
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    console.warn('Continuing without database (user accounts disabled)');
    // Don't exit the process - allow the app to run without database
  }
};

module.exports = connectDB;
