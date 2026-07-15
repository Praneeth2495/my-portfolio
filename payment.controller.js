const { prisma } = require('../config/db');
const {
  createPaymentIntent,
  constructWebhookEvent,
} = require('../services/paymentService');
const { generateTrackingNumber } = require('../utils/orderNumber');

/**
 * POST /api/payments/:orderId/intent
 * Step 3 ("Payment"): creates (or reuses) a Stripe PaymentIntent for the
 * order's grand total and returns the client secret for the frontend to
 * confirm with Stripe.js / Stripe Elements.
 */
async function createIntent(req, res, next) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { payment: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'PENDING_PAYMENT') {
      return res.status(409).json({ error: `Order is not awaiting payment (status: ${order.status})` });
    }

    // Reuse an existing unpaid intent rather than creating duplicates
    if (order.payment?.providerPaymentIntentId && order.payment.status === 'REQUIRES_PAYMENT') {
      return res.json({ payment: order.payment });
    }

    const intent = await createPaymentIntent({
      amount: order.grandTotal,
      currency: order.currency,
      orderId: order.id,
      orderNumber: order.orderNumber,
      receiptEmail: req.user?.email,
    });

    const payment = await prisma.payment.upsert({
      where: { orderId: order.id },
      update: {
        providerPaymentIntentId: intent.id,
        providerClientSecret: intent.client_secret,
        amount: order.grandTotal,
        currency: order.currency,
        status: 'REQUIRES_PAYMENT',
      },
      create: {
        orderId: order.id,
        providerPaymentIntentId: intent.id,
        providerClientSecret: intent.client_secret,
        amount: order.grandTotal,
        currency: order.currency,
        status: 'REQUIRES_PAYMENT',
      },
    });

    res.json({ payment });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payments/webhook (Stripe webhook — raw body required, see index.js)
 * Marks the payment/order as PAID and assigns a tracking number once Stripe
 * confirms the charge succeeded. This is the source of truth for payment
 * status — never trust a client-side "success" callback alone.
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['stripe-signature'];
    const event = constructWebhookEvent(req.body, signature);

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const orderId = intent.metadata.orderId;

      const payment = await prisma.payment.update({
        where: { orderId },
        data: { status: 'SUCCEEDED', rawWebhookPayload: event, method: intent.payment_method_types?.[0] },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'PAID',
          trackingNumber: generateTrackingNumber(),
          trackingEvents: { create: { status: 'PAID', note: 'Payment confirmed' } },
        },
      });
      void payment;
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object;
      await prisma.payment.update({
        where: { orderId: intent.metadata.orderId },
        data: { status: 'FAILED', rawWebhookPayload: event },
      });
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}

/** GET /api/payments/:orderId — poll payment status (used by frontend after Stripe confirm) */
async function getPaymentStatus(req, res, next) {
  try {
    const payment = await prisma.payment.findUnique({ where: { orderId: req.params.orderId } });
    if (!payment) return res.status(404).json({ error: 'No payment found for this order' });
    res.json({ payment });
  } catch (err) {
    next(err);
  }
}

module.exports = { createIntent, handleWebhook, getPaymentStatus };
