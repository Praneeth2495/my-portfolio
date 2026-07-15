import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import client from '../api/client';
import { useBooking } from '../api/BookingContext';
import Stepper from '../components/Stepper';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

export default function Payment() {
  const { order, setBooking } = useBooking();
  const navigate = useNavigate();
  const [clientSecret, setClientSecret] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!order) return;
    client
      .post(`/payments/${order.id}/intent`)
      .then(({ data }) => setClientSecret(data.payment.providerClientSecret))
      .catch((err) => setError(err.response?.data?.error || 'Could not start payment.'));
  }, [order]);

  const options = useMemo(() => (clientSecret ? { clientSecret } : null), [clientSecret]);

  if (!order) {
    return (
      <div className="wrap section-narrow" style={{ textAlign: 'center' }}>
        <p className="lead">No order in progress yet.</p>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/quote')}>Get a quote</button>
      </div>
    );
  }

  return (
    <div>
      <div id="stepper-payment"><Stepper activeKey="payment" /></div>
      <div className="wrap" style={{ maxWidth: 560, padding: '20px 32px 80px' }}>
        <h1 className="h-lg">Payment</h1>
        <p className="lead" style={{ marginBottom: 20 }}>
          Order {order.orderNumber} · Total due: <b>${Number(order.grandTotal).toFixed(2)} {order.currency}</b>
        </p>

        {error && <div className="error-text" style={{ marginBottom: 16 }}>{error}</div>}

        {options ? (
          <Elements stripe={stripePromise} options={options}>
            <CheckoutForm order={order} onPaid={() => { setBooking({}); navigate('/labels'); }} />
          </Elements>
        ) : (
          !error && <p className="lead">Preparing secure payment…</p>
        )}

        <p style={{ fontSize: 12, color: 'var(--slate-light)', marginTop: 16 }}>
          Payments are processed securely by Stripe. Comonn never stores your card details.
        </p>
      </div>
    </div>
  );
}

function CheckoutForm({ order, onPaid }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError('');

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/labels` },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message);
      setSubmitting(false);
      return;
    }

    // Webhook is the source of truth; poll briefly for status to flip to SUCCEEDED.
    for (let i = 0; i < 8; i++) {
      const { data } = await client.get(`/payments/${order.id}`);
      if (data.payment.status === 'SUCCEEDED') {
        onPaid();
        return;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    setError('Payment is processing — refresh in a moment or check your order status.');
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: 24 }}>
      <PaymentElement />
      {error && <div className="error-text" style={{ marginTop: 14 }}>{error}</div>}
      <button className="btn btn-primary block" style={{ marginTop: 20 }} disabled={!stripe || submitting}>
        {submitting ? 'Processing…' : `Pay $${Number(order.grandTotal).toFixed(2)} ${order.currency}`}
      </button>
    </form>
  );
}
