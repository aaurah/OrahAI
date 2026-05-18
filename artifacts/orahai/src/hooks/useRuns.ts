import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import type { ApiResponse, Run } from "@/types";

export function useRuns(projectId: string | null) {
  const key = projectId ? `/api/runs/${projectId}` : null;

  const { data, error, isLoading } = useSWR<ApiResponse<Run[]>>(
    key,
    () => api.get<ApiResponse<Run[]>>(key!),
    {
      refreshInterval: (latestData) => {
        const runs = latestData?.data ?? [];
        const hasActive = runs.some(
          (r) => r.status === "queued" || r.status === "running"
        );
        return hasActive ? 2000 : 0;
      },
    }
  );

  return {
    runs: data?.data ?? [],
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}
