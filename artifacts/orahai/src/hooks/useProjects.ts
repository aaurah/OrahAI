import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import type { ApiResponse, ProjectWithCounts } from "@/types";

export function useProjects(opts?: { workspaceId?: string; search?: string }) {
  const params = new URLSearchParams();
  if (opts?.workspaceId) params.set("workspaceId", opts.workspaceId);
  if (opts?.search) params.set("search", opts.search);
  const key = `/api/projects${params.toString() ? "?" + params : ""}`;

  const { data, error, isLoading } = useSWR<ApiResponse<ProjectWithCounts[]>>(key, () =>
    api.get<ApiResponse<ProjectWithCounts[]>>(key)
  );
  return {
    projects: data?.data ?? [],
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}
