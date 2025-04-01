const mongoose = require('mongoose');
const dbConfig = require('./db.config');
const db = require('../models');

const Group = db.group;
const User = db.user;
const Role = db.role;

// Build the MongoDB Atlas connection string
const atlasConnectionString = `${process.env.MONGODB_ATLAS_HOST}/${process.env.MONGODB_ATLAS_DB}`;

// Initial connection
mongoose.connect(atlasConnectionString, dbConfig.options)
  .then(() => {
    console.log("Successfully connected to MongoDB Atlas.");
    initializeDatabase();
  })
  .catch(err => {
    console.error("MongoDB Atlas connection error:", err);
    process.exit();
  });

async function initializeDatabase() {
  try {
    // Clear existing data
    await Promise.all([
      Group.deleteMany({}),
      Role.deleteMany({}),
    ]);

    // Initialize roles
    await Promise.all([
      new Role({ name: "user" }).save(),
      new Role({ name: "moderator" }).save(),
      new Role({ name: "admin" }).save()
    ]);
    console.log("Added roles to the database");

    // Create sample groups
    const sampleGroups = [
      {
        name: "Downtown Neighborhood Co-op",
        description: "A community-driven group focused on bulk buying and sharing local produce.",
        category: "neighborhood",
        location: {
          street: "123 Main Street",
          city: "Austin",
          state: "TX",
          zipCode: "78701",
          coordinates: {
            type: "Point",
            coordinates: [-97.7431, 30.2672]
          }
        },
        deliveryDays: ["Monday", "Thursday"],
        rules: "1. Respect all members\n2. Place orders by Sunday evening\n3. Pick up items within 24 hours",
        shoppingList: [
          {
            productName: "Organic Apples",
            vendor: "Local Orchards Co",
            casePrice: 45.00,
            quantity: 1,
            totalUnits: 88
          },
          {
            productName: "Free-Range Eggs",
            vendor: "Happy Hens Farm",
            casePrice: 36.00,
            quantity: 2,
            totalUnits: 60
          }
        ],
        proposedProducts: [
          {
            productName: "Organic Honey",
            vendor: "Bee Happy Apiaries",
            casePrice: 120.00,
            quantity: 1,
            votes: 5,
            approved: false
          }
        ],
        discussionBoard: [],
        isPrivate: false,
        events: [
          {
            title: "Monthly Meeting",
            description: "Discussion of upcoming bulk orders and community updates",
            date: new Date("2025-03-15"),
            location: "Community Center"
          }
        ],
        stats: {
          activeMembers: 0,
          totalProductsOrdered: 0
        }
      },
      {
        name: "Green Thumb Garden Share",
        description: "Community garden group sharing harvests and gardening knowledge.",
        category: "community_garden",
        location: {
          street: "456 Garden Way",
          city: "Austin",
          state: "TX",
          zipCode: "78702",
          coordinates: {
            type: "Point",
            coordinates: [-97.7211, 30.2672]
          }
        },
        deliveryDays: ["Wednesday", "Saturday"],
        rules: "1. Use organic practices only\n2. Share surplus produce\n3. Contribute to communal composting",
        shoppingList: [
          {
            productName: "Organic Seeds Mix",
            vendor: "Heritage Seeds Co",
            casePrice: 75.00,
            quantity: 1,
            totalUnits: 100
          }
        ],
        proposedProducts: [],
        discussionBoard: [],
        isPrivate: false,
        events: [
          {
            title: "Spring Planting Day",
            description: "Community gathering to start spring vegetables",
            date: new Date("2025-03-20"),
            location: "Community Garden"
          }
        ],
        stats: {
          activeMembers: 0,
          totalProductsOrdered: 0
        }
      }
    ];

    // Save sample groups
    await Promise.all(sampleGroups.map(group => new Group(group).save()));
    console.log("Added sample groups to the database");

    console.log("Database initialization completed successfully");
    process.exit(0);
  } catch (err) {
    console.error("Error during database initialization:", err);
    process.exit(1);
  }
}
