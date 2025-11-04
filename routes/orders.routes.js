const express = require('express');
const router = express.Router();
const { authJwt } = require('../middleware');
const orderController = require('../controllers/order.controller');
const { body, param, validationResult } = require('express-validator');

function handleValidation(req, res, next){
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array().map(e=>e.msg||(`${e.param}: ${e.msg}`)) });
  next();
}

// Apply authentication middleware to all routes
router.use(authJwt.verifyToken);

// Create a new order
router.post(
  '/',
  [
    body('groupId').optional().isString().trim().notEmpty(),
    body('items').isArray({ min: 1 }),
    body('items.*.listingId').optional().isString().trim().notEmpty(),
    body('items.*.title').optional().isString().trim().isLength({ min: 1, max: 200 }),
    body('items.*.pieces').isInt({ min: 0 }),
    body('items.*.unitPrice').isFloat({ min: 0 }),
    body('total').isFloat({ min: 0 }),
    body('contact').optional().isObject(),
    body('contact.name').optional().isString().trim().isLength({ min: 1, max: 120 }),
    body('contact.email').optional().isString().trim().isEmail(),
    body('contact.phone').optional().isString().trim().isLength({ max: 40 })
  ],
  handleValidation,
  orderController.createOrder
);

// Get all orders for a group
router.get('/group/:groupId', [ param('groupId').isString().trim().notEmpty(), handleValidation ], orderController.getGroupOrders);

// Get a specific order by ID
router.get('/:orderId', [ param('orderId').isString().trim().notEmpty(), handleValidation ], orderController.getOrderById);

// Update an order
router.put(
  '/:orderId',
  [
    param('orderId').isString().trim().notEmpty(),
    body('status').optional().isString().trim().isIn(['pending','confirmed','completed','canceled']),
    body('total').optional().isFloat({ min: 0 }),
    body('items').optional().isArray({ min: 1 })
  ],
  handleValidation,
  orderController.updateOrder
);

// Join an order as a participant
router.post('/:orderId/join', [ param('orderId').isString().trim().notEmpty(), handleValidation ], orderController.joinOrder);

// Update payment status
router.put('/:orderId/payment', [ param('orderId').isString().trim().notEmpty(), body('paid').isBoolean(), handleValidation ], orderController.updatePaymentStatus);

// Cancel an order
router.put('/:orderId/cancel', [ param('orderId').isString().trim().notEmpty(), handleValidation ], orderController.cancelOrder);

module.exports = router;
