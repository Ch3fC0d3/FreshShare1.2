const mongoose = require('mongoose');

const rankedProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [120, 'Product name cannot exceed 120 characters']
  },
  note: {
    type: String,
    trim: true,
    maxlength: [500, 'Product note cannot exceed 500 characters']
  },
  imageUrl: {
    type: String,
    trim: true,
    maxlength: [500, 'Image URL cannot exceed 500 characters']
  },
  productUrl: {
    type: String,
    trim: true,
    maxlength: [500, 'Product URL cannot exceed 500 characters']
  },
  vendor: {
    type: String,
    trim: true,
    default: ''
  },
  unitSize: {
    type: String,
    trim: true,
    default: ''
  },
  unitName: {
    type: String,
    trim: true,
    default: ''
  },
  caseSize: {
    type: Number,
    min: [0, 'Case size cannot be negative'],
    default: 0
  },
  quantity: {
    type: Number,
    min: [0, 'Quantity cannot be negative'],
    default: 1
  },
  totalUnits: {
    type: Number,
    min: [0, 'Total units cannot be negative'],
    default: 0
  },
  casePrice: {
    type: Number,
    min: [0, 'Case price cannot be negative'],
    default: 0
  },
  unitPrice: {
    type: Number,
    min: [0, 'Unit price cannot be negative'],
    default: 0
  },
  purchaseNotes: {
    type: String,
    trim: true,
    maxlength: [500, 'Purchase notes cannot exceed 500 characters'],
    default: ''
  },
  availabilityNote: {
    type: String,
    trim: true,
    maxlength: [500, 'Availability note cannot exceed 500 characters'],
    default: ''
  },
  isPreset: {
    type: Boolean,
    default: false
  },
  statusLocked: {
    type: Boolean,
    default: false
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'requested'],
    default: 'requested'
  },
  score: {
    type: Number,
    default: 0
  },
  upvoters: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  downvoters: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  pinned: {
    type: Boolean,
    default: false
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true, timestamps: true });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    minlength: [3, 'Group name must be at least 3 characters long'],
    maxlength: [50, 'Group name cannot exceed 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Group description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Group category is required'],
    enum: {
      values: ['neighborhood', 'community_garden', 'food_bank', 'cooking_club', 'other'],
      message: '{VALUE} is not a valid category'
    }
  },
  location: {
    street: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    state: {
      type: String,
      trim: true,
      default: ''
    },
    zipCode: {
      type: String,
      required: [true, 'Zip code is required'],
      trim: true
    }
  },
  rules: {
    textDescription: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'Rules description cannot exceed 1000 characters']
    },
    maxMembers: {
      type: Number,
      default: 50,
      min: [2, 'Group must allow at least 2 members'],
      max: [500, 'Group cannot exceed 500 members']
    },
    allowGuests: {
      type: Boolean,
      default: false
    },
    autoApproveMembers: {
      type: Boolean,
      default: false
    },
    autoApproveListings: {
      type: Boolean,
      default: false
    },
    membershipFee: {
      amount: {
        type: Number,
        default: 0
      },
      frequency: {
        type: String,
        enum: ['one-time', 'monthly', 'quarterly', 'yearly'],
        default: 'one-time'
      },
      required: {
        type: Boolean,
        default: false
      }
    }
  },
  deliveryDays: {
    type: [{
      type: String,
      enum: {
        values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        message: '{VALUE} is not a valid day'
      }
    }],
    required: [true, 'At least one delivery day is required'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one delivery day is required'
    }
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Group creator is required']
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  maxActiveProducts: {
    type: Number,
    min: [0, 'Max active products cannot be negative'],
    max: [200, 'Max active products cannot exceed 200'],
    default: 20
  },
  products: {
    type: [rankedProductSchema],
    default: []
  },
  orderBySchedule: {
    day: {
      type: String,
      enum: {
        values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        message: '{VALUE} is not a valid day'
      },
      default: undefined
    },
    time: {
      type: String,
      default: undefined,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Order by time must be in HH:MM 24-hour format']
    }
  },
  deliverySchedule: {
    day: {
      type: String,
      enum: {
        values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        message: '{VALUE} is not a valid day'
      },
      default: undefined
    },
    time: {
      type: String,
      default: undefined,
      match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Delivery time must be in HH:MM 24-hour format']
    }
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
groupSchema.index({ name: 1 });
groupSchema.index({ category: 1 });
groupSchema.index({ createdBy: 1 });
groupSchema.index({ members: 1 });
groupSchema.index({ admins: 1 });
groupSchema.index({ 'products.status': 1 });
groupSchema.index({ 'products.score': -1 });

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
