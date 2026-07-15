const router = require('express').Router();
const { optionalAuth } = require('../middleware/auth');
const { createIntent, getPaymentStatus } = require('../controllers/payment.controller');

// NOTE: the webhook route is mounted separately in src/index.js because it
// needs the raw request body (Stripe signature verification requirement).

router.post('/:orderId/intent', optionalAuth, createIntent);
router.get('/:orderId', optionalAuth, getPaymentStatus);

module.exports = router;
