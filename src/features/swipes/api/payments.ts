import { useQuery } from '@tanstack/react-query';

import {
  paymentResultSchema,
  paymentsSchema,
  type Payment,
} from '@/features/swipes/model/payments';
import { queryClient } from '@/lib/query-client';
import { supabase } from '@/lib/supabase';

export const paymentKey = (orderId: string) => ['payments', 'one', orderId] as const;
export const paymentsKey = (userId: string) => ['payments', 'mine', userId] as const;

/** While a payment is being confirmed, its order is re-read this often. */
const CONFIRM_POLL_MS = 2_000;

/** One order of the caller's; re-read every 2 s while it is still waiting for payment. */
export function usePayment(orderId: string | null) {
  return useQuery({
    queryKey: paymentKey(orderId ?? 'none'),
    enabled: orderId !== null,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.status === 'created' ? CONFIRM_POLL_MS : false),
    queryFn: async (): Promise<Payment | null> => {
      const { data, error } = await supabase.rpc('get_payment', { p_order: orderId! });
      if (error) throw error;
      const parsed = paymentResultSchema.parse(data);
      return parsed.ok ? parsed.payment : null;
    },
  });
}

/** The caller's purchases, newest first. */
export function useMyPayments(userId: string | null) {
  return useQuery({
    queryKey: paymentsKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase.rpc('get_my_payments');
      if (error) throw error;
      return paymentsSchema.parse(data).payments;
    },
  });
}

/**
 * Asks the server to check unpaid orders with the provider directly ("restore"): a payment
 * whose webhook was delayed or lost is applied, by the same rules, only if it really happened.
 */
export async function syncPayments(orderId?: string): Promise<void> {
  const { error } = await supabase.functions.invoke('payments-sync', {
    body: orderId ? { order_id: orderId } : {},
  });
  if (error) throw error;
}

/** Development builds only: plays the provider for one of the caller's mock orders. */
export async function mockPayment(orderId: string, outcome: 'paid' | 'expire'): Promise<void> {
  const { error } = await supabase.functions.invoke('payments-mock', {
    body: { order_id: orderId, outcome },
  });
  if (error) throw error;
}

export function refreshPayments() {
  return queryClient.invalidateQueries({ queryKey: ['payments'] });
}
