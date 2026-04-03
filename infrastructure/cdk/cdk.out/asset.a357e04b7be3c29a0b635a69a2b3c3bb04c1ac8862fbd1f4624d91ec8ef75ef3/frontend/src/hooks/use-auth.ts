import { useQuery } from "@tanstack/react-query";

export interface UserInfo {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  avatarUrl?: string;
}

export function useCurrentUser() {
  return useQuery<{ user: UserInfo | null }>({
    queryKey: ["/api/me"],
    retry: false,
    staleTime: 60_000,
  });
}
