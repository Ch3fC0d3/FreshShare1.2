const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  pinned: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

groupMessageSchema.index({ groupId: 1, createdAt: -1 });

groupMessageSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    groupId: this.groupId,
    author: this.author,
    content: this.content,
    pinned: this.pinned,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
