import useSWR, { mutate } from "swr";
import { api } from "@/lib/api";
import type { ApiResponse, ProjectFile, FileNode } from "@/types";

interface FilesResponse { flat: ProjectFile[]; tree: FileNode[] }

export function useFiles(projectId: string | null) {
  const key = projectId ? `/api/files/${projectId}` : null;
  const { data, error, isLoading } = useSWR<ApiResponse<FilesResponse>>(key, () =>
    api.get<ApiResponse<FilesResponse>>(key!)
  );
  return {
    flat: data?.data?.flat ?? [],
    tree: data?.data?.tree ?? [],
    isLoading,
    error,
    mutate: () => mutate(key),
  };
}
