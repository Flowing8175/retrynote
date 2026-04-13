import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey, UseMutationResult } from '@tanstack/react-query';

export function useMutationWithInvalidation<TData = unknown, TVariables = void>(
  queryKeys: QueryKey | QueryKey[],
  mutationFn: (vars: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
  }
): UseMutationResult<TData, Error, TVariables> {
  const queryClient = useQueryClient();
  const normalizedKeys = (Array.isArray(queryKeys[0]) ? queryKeys : [queryKeys]) as QueryKey[];

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    onSuccess: (data, variables) => {
      normalizedKeys.forEach((key) => {
        void queryClient.invalidateQueries({ queryKey: key });
      });
      options?.onSuccess?.(data, variables);
    },
    onError: options?.onError,
  });
}
