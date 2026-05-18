import useSWR from "swr";
import { api } from "@/lib/api";
import type { ApiResponse, Project } from "@/types";

export function useProject(id: string | null) {
  const { data, error, isLoading } = useSWR<ApiResponse<Project>>(
    id ? `/api/projects/${id}` : null,
    () => api.get<ApiResponse<Project>>(`/api/projects/${id}`)
  );
  return { project: data?.data ?? null, isLoading, error };
}
