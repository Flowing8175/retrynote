import { useQuery } from '@tanstack/react-query';
import { billingApi } from '../api/billing';
import { useAuthStore } from '../stores/authStore';

export function useUsageStatus() {
  const user = useAuthStore((s) => s.user);

  return useQuery({
    queryKey: ['usageStatus'],
    queryFn: billingApi.getUsageStatus,
    enabled: !!user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
