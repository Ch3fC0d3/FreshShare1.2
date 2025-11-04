const express = require('express');
const router = express.Router();
const { authJwt } = require('../middleware');
const groupController = require('../controllers/group.controller');
const { body, param, validationResult } = require('express-validator');

function handleValidation(req, res, next){
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e=>e.msg||(`${e.param}: ${e.msg}`)) });
  next();
}

// Apply authentication middleware to specific routes instead of all routes
// This allows group creation without authentication for debugging purposes

// ===== GROUP MANAGEMENT =====

// Create a new group (auth required)
router.post(
  '/',
  authJwt.verifyToken,
  [
    body('name').isString().trim().isLength({ min: 3, max: 100 }),
    body('category').isString().trim().isLength({ min: 1, max: 50 }),
    body('description').isString().trim().isLength({ min: 10, max: 5000 }),
    body('location').isObject(),
    body('location.city').isString().trim().isLength({ min: 1, max: 120 }),
    body('location.zipCode').isString().trim().isLength({ min: 3, max: 20 }),
    body('location.street').optional().isString().trim().isLength({ max: 200 }),
    body('location.state').optional().isString().trim().isLength({ max: 80 }),
    body('isPrivate').optional().isBoolean(),
    body('deliveryDays').optional().isArray({ min: 1 }),
    body('deliveryDays.*').optional().isString().trim().isLength({ min: 1, max: 20 }),
    body('orderBySchedule').optional().isObject(),
    body('orderBySchedule.day').optional().isString().trim(),
    body('orderBySchedule.time').optional().isString().trim(),
    body('deliverySchedule').optional().isObject(),
    body('deliverySchedule.day').optional().isString().trim(),
    body('deliverySchedule.time').optional().isString().trim(),
    body('maxActiveProducts').optional().isInt({ min: 1, max: 200 }),
    body('starterProducts').optional().isArray(),
    body('starterProducts.*.name').optional().isString().trim().isLength({ min: 1, max: 200 }),
    body('starterProducts.*.imageUrl').optional().isString().trim().isLength({ max: 500 }),
    body('starterProducts.*.productUrl').optional().isString().trim().isLength({ max: 500 }),
    body('starterProducts.*.note').optional().isString().trim().isLength({ max: 2000 })
  ],
  handleValidation,
  groupController.createGroup
);

// Get all groups
router.get('/', groupController.getAllGroups);

// Get a specific group
router.get('/:id', [ param('id').isString().trim().notEmpty(), handleValidation ], groupController.getGroupById);

// Update a group
router.put(
  '/:id',
  [
    param('id').isString().trim().notEmpty(),
    body('name').optional().isString().trim().isLength({ min: 3, max: 100 }),
    body('category').optional().isString().trim().isLength({ min: 1, max: 50 }),
    body('description').optional().isString().trim().isLength({ min: 10, max: 5000 }),
    body('location').optional().isObject(),
    body('location.city').optional().isString().trim().isLength({ min: 1, max: 120 }),
    body('location.zipCode').optional().isString().trim().isLength({ min: 3, max: 20 }),
    body('location.street').optional().isString().trim().isLength({ max: 200 }),
    body('location.state').optional().isString().trim().isLength({ max: 80 }),
    body('isPrivate').optional().isBoolean(),
    body('deliveryDays').optional().isArray({ min: 1 }),
    body('deliveryDays.*').optional().isString().trim().isLength({ min: 1, max: 20 }),
    body('orderBySchedule').optional().isObject(),
    body('orderBySchedule.day').optional().isString().trim(),
    body('orderBySchedule.time').optional().isString().trim(),
    body('deliverySchedule').optional().isObject(),
    body('deliverySchedule.day').optional().isString().trim(),
    body('deliverySchedule.time').optional().isString().trim(),
    body('maxActiveProducts').optional().isInt({ min: 1, max: 200 })
  ],
  handleValidation,
  groupController.updateGroup
);

// Delete a group
router.delete('/:id', groupController.deleteGroup);

// ===== MEMBERSHIP MANAGEMENT =====

// Join a group (auth required)
router.post('/:id/join', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), handleValidation ], groupController.joinGroup);

// Leave a group (auth required)
router.post('/:id/leave', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), handleValidation ], groupController.leaveGroup);

// Get group members
router.get('/:id/members', [ param('id').isString().trim().notEmpty(), handleValidation ], groupController.getGroupMembers);

// Invite a user to the group (auth required)
router.post('/:id/invite', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), body('email').isString().trim().isEmail(), handleValidation ], groupController.inviteToGroup);

// ===== DISCUSSION BOARD =====

// Get messages
router.get('/:id/messages', [ param('id').isString().trim().notEmpty(), handleValidation ], groupController.getMessages);

// Add message (auth required)
router.post('/:id/messages', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), body('content').isString().trim().isLength({ min:1, max: 2000 }), handleValidation ], groupController.addMessage);

// Delete message (auth required)
router.delete('/:id/messages/:messageId', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), param('messageId').isString().trim().notEmpty(), handleValidation ], groupController.deleteMessage);

// ===== EVENT MANAGEMENT =====

// Get events
router.get('/:id/events', [ param('id').isString().trim().notEmpty(), handleValidation ], groupController.getEvents);

// Create event (auth required)
router.post('/:id/events', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), body('title').isString().trim().isLength({ min: 1, max: 200 }), body('date').isISO8601(), body('location').optional().isString().trim().isLength({ max: 300 }), body('description').optional().isString().trim().isLength({ max: 2000 }), handleValidation ], groupController.createEvent);

// Update event (auth required)
router.put('/:id/events/:eventId', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), param('eventId').isString().trim().notEmpty(), body('title').optional().isString().trim().isLength({ min: 1, max: 200 }), body('date').optional().isISO8601(), body('location').optional().isString().trim().isLength({ max: 300 }), body('description').optional().isString().trim().isLength({ max: 2000 }), handleValidation ], groupController.updateEvent);

// Delete event (auth required)
router.delete('/:id/events/:eventId', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), param('eventId').isString().trim().notEmpty(), handleValidation ], groupController.deleteEvent);

// ===== RANKED PRODUCTS =====

// Get ranked products list
router.get('/:id/products', [ param('id').isString().trim().notEmpty(), handleValidation ], groupController.listGroupProducts);

// Suggest a product (auth required)
router.post('/:id/products', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), body('name').isString().trim().isLength({ min:1, max: 200 }), body('note').optional().isString().trim().isLength({ max: 2000 }), body('imageUrl').optional().isString().trim().isLength({ max: 500 }), body('productUrl').optional().isString().trim().isLength({ max: 500 }), handleValidation ], groupController.suggestProduct);

// Vote on a product (auth required)
router.post('/:id/products/:productId/vote', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), param('productId').isString().trim().notEmpty(), body('vote').isString().trim().isIn(['up','down','clear']), handleValidation ], groupController.voteOnProduct);

// Update product status (auth required)
router.patch('/:id/products/:productId', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), param('productId').isString().trim().notEmpty(), body('pinned').optional().isBoolean(), body('status').optional().isString().trim().isIn(['active','requested']), handleValidation ], groupController.updateProductStatus);

// Remove product (auth required)
router.delete('/:id/products/:productId', authJwt.verifyToken, [ param('id').isString().trim().notEmpty(), param('productId').isString().trim().notEmpty(), handleValidation ], groupController.removeProduct);

// ===== LEGACY ROUTES (MAINTAINED FOR BACKWARD COMPATIBILITY) =====

// Legacy discussion board route (for backward compatibility)
router.post('/:id/discussion', async (req, res) => {
    try {
        // Forward to the new message endpoint
        return groupController.addMessage(req, res);
    } catch (error) {
        console.error('Error posting message:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to post message'
        });
    }
});

module.exports = router;
