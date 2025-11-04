const mongoose = require('mongoose');

const groupEventSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 5000
  },
  location: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  date: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

groupEventSchema.index({ groupId: 1, date: 1 });

groupEventSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    groupId: this.groupId,
    createdBy: this.createdBy,
    title: this.title,
    description: this.description,
    location: this.location,
    date: this.date,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('GroupEvent', groupEventSchema);
