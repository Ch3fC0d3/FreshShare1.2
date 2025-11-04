const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  firstName: {
    type: String,
    trim: true,
    default: ''
  },
  lastName: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false // Don't return password by default in queries
  },
  profileImage: {
    type: String,
    default: "/images/avatar-placeholder.svg"
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: ''
  },
  location: {
    street: {
      type: String,
      trim: true,
      default: ""
    },
    city: {
      type: String,
      trim: true,
      default: ""
    },
    state: {
      type: String,
      trim: true,
      default: ""
    },
    zipCode: {
      type: String,
      trim: true,
      default: ""
    }
  },
  phoneNumber: {
    type: String,
    trim: true,
    default: "",
    match: [/^$|^\+?1?\d{9,15}$/, 'Please enter a valid phone number']
  },
  groups: [{
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true
    },
    role: {
      type: String,
      enum: ["admin", "moderator", "member"],
      default: "member"
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ["active", "inactive", "pending"],
      default: "active"
    },
    notifications: {
      type: Boolean,
      default: true
    }
  }],
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role"
  }],
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    newsletter: {
      type: Boolean,
      default: true
    }
  },
  lastLogin: {
    type: Date
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  const firstName = this.firstName;
  const lastName = this.lastName;
  return `${firstName} ${lastName}`.trim();
});

// Virtual for full location
userSchema.virtual('fullLocation').get(function() {
  const location = this.location;
  const parts = [];
  if (location.street) parts.push(location.street);
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.zipCode) parts.push(location.zipCode);
  return parts.join(', ');
});

// Method to check if user is member of a group
userSchema.methods.isMemberOfGroup = function(groupId) {
  return this.groups.some(membership => 
    membership.group.toString() === groupId.toString() && 
    membership.status === 'active'
  );
};

// Method to check if user is admin of a group
userSchema.methods.isAdminOfGroup = function(groupId) {
  return this.groups.some(membership => 
    membership.group.toString() === groupId.toString() && 
    membership.role === 'admin' && 
    membership.status === 'active'
  );
};

// Method to check if user is moderator of a group
userSchema.methods.isModeratorOfGroup = function(groupId) {
  return this.groups.some(membership => 
    membership.group.toString() === groupId.toString() && 
    membership.role === 'moderator' && 
    membership.status === 'active'
  );
};

// Method to join a group
userSchema.methods.joinGroup = async function(groupId, role = 'member') {
  if (!this.isMemberOfGroup(groupId)) {
    this.groups.push({
      group: groupId,
      role: role,
      joinedAt: new Date(),
      status: 'active'
    });
    await this.save();
  }
};

// Method to leave a group
userSchema.methods.leaveGroup = async function(groupId) {
  const membershipIndex = this.groups.findIndex(membership => 
    membership.group.toString() === groupId.toString()
  );
  
  if (membershipIndex !== -1) {
    this.groups.splice(membershipIndex, 1);
    await this.save();
  }
};

// Method to update group role
userSchema.methods.updateGroupRole = async function(groupId, newRole) {
  const membership = this.groups.find(membership => 
    membership.group.toString() === groupId.toString()
  );
  
  if (membership) {
    membership.role = newRole;
    await this.save();
  }
};

// Add indexes for searchable fields
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ 'location.city': 1 });
userSchema.index({ 'location.state': 1 });
userSchema.index({ 'location.zipCode': 1 });
userSchema.index({ 'groups.group': 1 });
userSchema.index({ 'groups.role': 1 });

const User = mongoose.model("User", userSchema);

module.exports = User;
