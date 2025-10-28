const mongoose = require('mongoose');

const adminActionSchema = new mongoose.Schema({
  adminEmail: {
    type: String,
    required: true
  },
  targetEmail: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['set_premium', 'set_free', 'reset_password', 'delete_user']
  },
  details: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
adminActionSchema.index({ timestamp: -1 });
adminActionSchema.index({ adminEmail: 1 });

module.exports = mongoose.model('AdminAction', adminActionSchema);
