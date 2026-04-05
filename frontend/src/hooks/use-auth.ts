import { useQuery } from "@tanstack/react-query";

export type SubscriptionStatus =
  | 'none'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused';

export interface UserSubscription {
  status: SubscriptionStatus;
  currentPeriodEnd?: number;
}

export interface UserInfo {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
  subscription: UserSubscription;
}

export function useCurrentUser() {
  return useQuery<{ user: UserInfo | null }>({
    queryKey: ["/api/me"],
    retry: false,
    staleTime: 60_000,
  });
}

export function isSubscriptionActive(sub?: UserSubscription): boolean {
  return sub?.status === 'active' || sub?.status === 'trialing';
}
