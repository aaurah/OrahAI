import useSWR from "swr";
import { api } from "@/lib/api";

export interface ProjectSecret {
  id: string;
  projectId: string;
  key: string;
  value: string;
  createdAt: string;
  updatedAt: string;
}

async function fetchSecrets(url: string): Promise<ProjectSecret[]> {
  const res = await api.get<{ data: ProjectSecret[] }>(url);
  return res.data ?? [];
}

export function useProjectSecrets(projectId: string | null) {
  const { data, error, mutate } = useSWR<ProjectSecret[]>(
    projectId ? `/api/projects/${projectId}/secrets` : null,
    fetchSecrets,
    { revalidateOnFocus: false },
  );
  return { secrets: data ?? [], isLoading: !data && !error, mutate };
}
