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

interface RepoPreview {
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  private: boolean;
  defaultBranch: string;
  importableFiles: number;
  mappedLanguage: string;
}

interface ImportedProject {
  id: string;
  name: string;
  _count: { files: number };
}

export default function GitHubImportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [preview, setPreview] = useState<RepoPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");

  const handlePreview = async () => {
    if (!repoUrl.trim()) return;
    setError(""); setPreview(null); setIsPreviewing(true);
    try {
      const res = await api.post<ApiResponse<RepoPreview>>("/api/github/preview", {
        repoUrl: repoUrl.trim(),
        ...(pat ? { token: pat } : {}),
      });
      setPreview(res.data);
      if (!branch) setBranch(res.data.defaultBranch);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to fetch repository info");
    } finally { setIsPreviewing(false); }
  };

  const handleImport = async () => {
    if (!preview) return;
    setIsImporting(true);
    try {
      const wsRes = await api.get<ApiResponse<{ id: string }[]>>("/api/workspaces");
      const workspaces = wsRes.data as { id: string }[];
      if (!workspaces?.length) {
        Alert.alert("Error", "No workspace found. Please create one first.");
        return;
      }
      const res = await api.post<ApiResponse<ImportedProject>>("/api/github/import", {
        repoUrl: repoUrl.trim(),
        workspaceId: workspaces[0].id,
        branch: branch || preview.defaultBranch,
        ...(pat ? { token: pat } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["projects"] });
      Alert.alert(
        "Imported!",
        `${preview.name} imported with ${res.data._count.files} files.`,
        [{ text: "OK", onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      Alert.alert("Import failed", (e as Error).message ?? "Could not import project");
    } finally { setIsImporting(false); }
  };

  const s = styles(colors);

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.iconRow}>
        <View style={s.ghIcon}>
          <Feather name="github" size={28} color={colors.foreground} />
        </View>
        <Text style={s.title}>Import from GitHub</Text>
        <Text style={s.subtitle}>
          Paste a GitHub repo URL — files will be imported into a new project
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Repository URL</Text>
        <TextInput
          style={s.input}
          placeholder="https://github.com/owner/repo"
          placeholderTextColor={colors.mutedForeground}
          value={repoUrl}
          onChangeText={(v) => { setRepoUrl(v); setPreview(null); setError(""); }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Pressable style={s.patToggle} onPress={() => setShowPat((v) => !v)}>
          <Feather name={showPat ? "chevron-down" : "chevron-right"} size={14} color={colors.mutedForeground} />
          <Text style={s.patToggleText}>Use a GitHub token for private repos</Text>
        </Pressable>

        {showPat && (
          <TextInput
            style={[s.input, { marginTop: 8 }]}
            placeholder="ghp_xxxxxxxxxxxx"
            placeholderTextColor={colors.mutedForeground}
            value={pat}
            onChangeText={setPat}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
        )}

        {!!error && (
          <View style={s.errorRow}>
            <Feather name="alert-circle" size={13} color={colors.destructive} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[s.previewBtn, (!repoUrl.trim() || isPreviewing) && { opacity: 0.5 }]}
          onPress={handlePreview}
          disabled={!repoUrl.trim() || isPreviewing}
        >
          {isPreviewing
            ? <ActivityIndicator color={colors.primary} size="small" />
            : <><Feather name="search" size={16} color={colors.primary} /><Text style={s.previewBtnText}>Preview repository</Text></>
          }
        </Pressable>
      </View>

      {preview && (
        <View style={s.previewCard}>
          <View style={s.previewHeader}>
            <Feather name="book" size={18} color={colors.primary} />
            <Text style={s.previewName} numberOfLines={1}>{preview.fullName}</Text>
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
              <Text style={s.metaText}>{preview.stars.toLocaleString()}</Text>
            </View>
            <View style={s.metaItem}>
              <Feather name="file-text" size={13} color={colors.mutedForeground} />
              <Text style={s.metaText}>{preview.importableFiles} files</Text>
            </View>
          </View>

          <View style={s.branchRow}>
            <Text style={s.label}>Branch</Text>
            <TextInput
              style={s.branchInput}
              placeholder={preview.defaultBranch}
              placeholderTextColor={colors.mutedForeground}
              value={branch}
              onChangeText={setBranch}
              autoCapitalize="none"
            />
          </View>

          <Pressable style={[s.importBtn, isImporting && { opacity: 0.7 }]} onPress={handleImport} disabled={isImporting}>
            {isImporting
              ? <ActivityIndicator color={colors.primaryForeground} />
              : <><Feather name="download" size={18} color={colors.primaryForeground} /><Text style={s.importBtnText}>Import {preview.importableFiles} files</Text></>
            }
          </Pressable>
        </View>
      )}
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
  card: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, marginBottom: 8 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12,
    fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular",
    backgroundColor: colors.background,
  },
  patToggle: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  patToggleText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  errorText: { color: colors.destructive, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  previewBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 10,
  },
  previewBtnText: { color: colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  previewCard: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.primary + "50", padding: 16, marginBottom: 16 },
  previewHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  previewName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, flex: 1 },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.secondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  privateBadgeText: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  previewDesc: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 12 },
  previewMeta: { flexDirection: "row", gap: 16, marginBottom: 14, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  langDot: { width: 10, height: 10, borderRadius: 5 },
  branchRow: { marginBottom: 14 },
  branchInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular",
    backgroundColor: colors.background,
  },
  importBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13 },
  importBtnText: { color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
