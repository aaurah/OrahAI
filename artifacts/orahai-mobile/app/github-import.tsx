import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, ScrollView, Alert, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/lib/types";

interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  private: boolean;
  html_url: string;
}

const LANGUAGE_MAP: Record<string, string> = {
  JavaScript: "nodejs",
  TypeScript: "typescript",
  Python: "python",
  HTML: "html",
  CSS: "html",
};

export default function GitHubImportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [repoUrl, setRepoUrl] = useState("");
  const [preview, setPreview] = useState<GitHubRepo | null>(null);
  const [fetching, setFetching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const parseGitHubUrl = (url: string) => {
    const clean = url.trim().replace(/\/$/, "").replace(/\.git$/, "");
    const match = clean.match(/github\.com\/([^/]+)\/([^/]+)$/);
    return match ? { owner: match[1], repo: match[2] } : null;
  };

  const handleFetchPreview = async () => {
    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      setFetchError("Please enter a valid GitHub repository URL (e.g. github.com/owner/repo)");
      return;
    }
    setFetching(true); setFetchError(""); setPreview(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Repository not found. Make sure it's public.");
        throw new Error("Failed to fetch repository info.");
      }
      const data = await res.json() as GitHubRepo;
      setPreview(data);
    } catch (e: unknown) {
      setFetchError((e as Error).message ?? "Failed to fetch repository");
    } finally {
      setFetching(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const wsRes = await api.get<ApiResponse<{ id: string }[]>>("/api/workspaces");
      // @ts-ignore
      const workspaces = wsRes.data as { id: string }[];
      if (!workspaces?.length) {
        Alert.alert("Error", "No workspace found. Please set up a workspace first.");
        return;
      }
      const workspaceId = workspaces[0].id;
      const language = LANGUAGE_MAP[preview.language ?? ""] ?? "nodejs";
      await api.post("/api/projects", {
        name: preview.name,
        description: preview.description ?? undefined,
        language,
        isPublic: !preview.private,
        workspaceId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["projects"] });
      router.back();
    } catch (e: unknown) {
      Alert.alert("Import failed", (e as Error).message ?? "Could not create project");
    } finally {
      setImporting(false);
    }
  };

  const s = styles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[s.container]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.iconRow}>
        <View style={s.ghIcon}>
          <Feather name="github" size={28} color={colors.foreground} />
        </View>
        <Text style={s.title}>Import from GitHub</Text>
        <Text style={s.subtitle}>Paste a public GitHub repository URL to create a new project</Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Repository URL</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            placeholder="https://github.com/owner/repo"
            placeholderTextColor={colors.mutedForeground}
            value={repoUrl}
            onChangeText={(v) => { setRepoUrl(v); setPreview(null); setFetchError(""); }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        {!!fetchError && (
          <View style={s.errorRow}>
            <Feather name="alert-circle" size={13} color={colors.destructive} />
            <Text style={s.errorText}>{fetchError}</Text>
          </View>
        )}
        <Pressable
          style={[s.previewBtn, (!repoUrl.trim() || fetching) && { opacity: 0.5 }]}
          onPress={handleFetchPreview}
          disabled={!repoUrl.trim() || fetching}
        >
          {fetching
            ? <ActivityIndicator color={colors.primary} size="small" />
            : <>
                <Feather name="search" size={16} color={colors.primary} />
                <Text style={s.previewBtnText}>Fetch repository info</Text>
              </>}
        </Pressable>
      </View>

      {preview && (
        <View style={s.previewCard}>
          <View style={s.previewHeader}>
            <Feather name="book" size={18} color={colors.primary} />
            <Text style={s.previewName} numberOfLines={1}>{preview.full_name}</Text>
            {preview.private && (
              <View style={s.privateBadge}>
                <Feather name="lock" size={10} color={colors.mutedForeground} />
                <Text style={s.privateBadgeText}>Private</Text>
              </View>
            )}
          </View>

          {!!preview.description && (
            <Text style={s.previewDesc}>{preview.description}</Text>
          )}

          <View style={s.previewMeta}>
            {preview.language && (
              <View style={s.metaItem}>
                <View style={[s.langDot, { backgroundColor: "#7c3aed" }]} />
                <Text style={s.metaText}>{preview.language}</Text>
              </View>
            )}
            <View style={s.metaItem}>
              <Feather name="star" size={13} color={colors.mutedForeground} />
              <Text style={s.metaText}>{preview.stargazers_count.toLocaleString()}</Text>
            </View>
            <View style={s.metaItem}>
              <Feather name="git-branch" size={13} color={colors.mutedForeground} />
              <Text style={s.metaText}>{preview.forks_count.toLocaleString()}</Text>
            </View>
          </View>

          <View style={s.importInfo}>
            <Feather name="info" size={13} color={colors.mutedForeground} />
            <Text style={s.importInfoText}>
              This will create a new {LANGUAGE_MAP[preview.language ?? ""] ?? "nodejs"} project named "{preview.name}" in your workspace.
            </Text>
          </View>

          <Pressable style={[s.importBtn, importing && { opacity: 0.7 }]} onPress={handleImport} disabled={importing}>
            {importing
              ? <ActivityIndicator color={colors.primaryForeground} />
              : <>
                  <Feather name="download" size={18} color={colors.primaryForeground} />
                  <Text style={s.importBtnText}>Import Project</Text>
                </>}
          </Pressable>
        </View>
      )}

      <View style={s.note}>
        <Feather name="alert-circle" size={14} color={colors.mutedForeground} />
        <Text style={s.noteText}>Only public repositories can be imported without authentication. The project metadata will be imported — files are not downloaded.</Text>
      </View>
    </ScrollView>
  );
}

// @ts-ignore
const styles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  iconRow: { alignItems: "center", paddingHorizontal: 24, marginBottom: 24 },
  ghIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", marginBottom: 14,
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  card: {
    marginHorizontal: 16, backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16,
  },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, marginBottom: 8 },
  inputRow: { marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular",
    backgroundColor: colors.background,
  },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  errorText: { color: colors.destructive, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  previewBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10,
  },
  previewBtnText: { color: colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  previewCard: {
    marginHorizontal: 16, backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.primary + "50", padding: 16, marginBottom: 16,
  },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  previewName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  privateBadgeText: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  previewDesc: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 12 },
  previewMeta: { flexDirection: "row", gap: 16, marginBottom: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  langDot: { width: 10, height: 10, borderRadius: 5 },
  importInfo: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.accent, borderRadius: 8, padding: 10, marginBottom: 14 },
  importInfoText: { fontSize: 12, color: colors.accentForeground, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
  importBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13,
  },
  importBtnText: { color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  note: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, backgroundColor: colors.secondary,
    borderRadius: 10, padding: 12,
  },
  noteText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 17 },
});
