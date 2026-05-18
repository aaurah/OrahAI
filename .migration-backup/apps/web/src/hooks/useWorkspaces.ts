"use client";
import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import type { ApiResponse, WorkspaceWithRole } from "@orahai/types";

const KEY = "/api/workspaces";

export function useWorkspaces() {
  const { data, error, isLoading } = useSWR<ApiResponse<WorkspaceWithRole[]>>(KEY, () =>
    api.get<ApiResponse<WorkspaceWithRole[]>>(KEY)
  );
  return {
    workspaces: data?.data ?? [],
    isLoading,
    error,
    mutate: () => mutate(KEY),
  };
}
