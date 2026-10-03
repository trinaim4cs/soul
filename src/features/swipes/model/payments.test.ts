import {
  paymentLine,
  paymentResultSchema,
  paymentStatusLabel,
  unavailableMessage,
  type Payment,
} from '@/features/swipes/model/payments';
import { isCheckoutUrl } from '@/services/payments/checkout-url';

const payment: Payment = {
  id: '00000000-0000-4000-8000-000000000001',
  plan_id: 'monthly',
  title: 'Monthly',
  amount_paise: 19900,
  status: 'paid',
  created_at: '2026-10-03T10:00:00Z',
  paid_at: '2026-10-03T10:01:00Z',
};

describe('payments', () => {
  it('reads the server payload and refuses anything unknown', () => {
    expect(paymentResultSchema.parse({ ok: true, payment }).ok).toBe(true);
    expect(() =>
      paymentResultSchema.parse({ ok: true, payment: { ...payment, status: 'granted' } }),
    ).toThrow();
  });

  it('describes a payment in a list', () => {
    expect(paymentLine(payment)).toBe('Monthly · ₹199');
    expect(paymentStatusLabel('paid')).toBe('Paid');
    expect(paymentStatusLabel('expired')).toBe('Not completed');
    expect(paymentStatusLabel('created')).toBe('Waiting for payment');
  });

  it('always says nothing was charged when checkout cannot start', () => {
    expect(unavailableMessage('not_configured')).toMatch(/Nothing was charged/);
    expect(unavailableMessage('anything')).toMatch(/Nothing was charged/);
  });
});

describe('checkout links', () => {
  it('opens only Razorpay pages over HTTPS', () => {
    expect(isCheckoutUrl('https://rzp.io/i/abc123')).toBe(true);
    expect(isCheckoutUrl('https://pages.razorpay.com/pl_abc')).toBe(true);
    expect(isCheckoutUrl('http://rzp.io/i/abc123')).toBe(false);
    expect(isCheckoutUrl('https://rzp.io.example.com/i/abc')).toBe(false);
    expect(isCheckoutUrl('https://evil-razorpay.com/x')).toBe(false);
    expect(isCheckoutUrl('javascript:alert(1)')).toBe(false);
    expect(isCheckoutUrl('not a url')).toBe(false);
  });
});
