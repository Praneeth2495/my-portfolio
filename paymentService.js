const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
});

/**
 * Creates a Stripe PaymentIntent for an order's grand total.
 * Amount must be in the smallest currency unit (cents for AUD/USD).
 */
async function createPaymentIntent({ amount, currency, orderId, orderNumber, receiptEmail }) {
  const amountInCents = Math.round(Number(amount) * 100);
  const intent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: currency.toLowerCase(),
    metadata: { orderId, orderNumber },
    receipt_email: receiptEmail,
    automatic_payment_methods: { enabled: true },
  });
  return intent;
}

async function retrievePaymentIntent(id) {
  return stripe.paymentIntents.retrieve(id);
}

/** Verifies and parses an incoming Stripe webhook event */
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

async function refundPayment(paymentIntentId, amount) {
  return stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount: amount ? Math.round(amount * 100) : undefined,
  });
}

module.exports = { stripe, createPaymentIntent, retrievePaymentIntent, constructWebhookEvent, refundPayment };
