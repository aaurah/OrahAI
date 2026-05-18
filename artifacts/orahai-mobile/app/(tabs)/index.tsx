import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet,
  TextInput, ActivityIndicator, RefreshControl, Modal,
  ScrollView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { ApiResponse, ProjectWithCounts } from "@/lib/types";
import { LANGUAGE_COLORS, LANGUAGE_LABELS } from "@/lib/types";

const LANGUAGES = ["nodejs", "python", "typescript", "html"];
const LANGUAGE_ICONS: Record<string, string> = {
  nodejs: "box", python: "code", typescript: "file-text", html: "globe",
};

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["projects", search],
    queryFn: () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return api.get<ApiResponse<ProjectWithCounts[]>>(`/api/projects${params}`);
    },
  });

  const projects = data?.data ?? [];

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 83;

  const s = styles(colors);

  return (
    <View style={[s.container, { paddingTop: topPad }]}>
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>
            {user?.name ? `Hi, ${user.name.split(" ")[0]}` : "Projects"}
          </Text>
          <Text style={s.subtitle}>Your workspace</Text>
        </View>
        <View style={s.headerActions}>
          <Pressable style={s.iconBtn} onPress={() => router.push("/github-import")}>
            <Feather name="github" size={20} color={colors.foreground} />
          </Pressable>
          <Pressable style={s.primaryBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCreateOpen(true); }}>
            <Feather name="plus" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>
      </View>

      <View style={s.searchRow}>
        <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
        <TextInput
          style={s.searchInput} placeholder="Search projects…"
          placeholderTextColor={colors.mutedForeground}
          value={search} onChangeText={setSearch}
          autoCapitalize="none" autoCorrect={false}
        />
        {!!search && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={colors.primary} /></View>
      ) : projects.length === 0 ? (
        <View style={s.center}>
          <Feather name="folder" size={40} color={colors.mutedForeground} style={{ marginBottom: 12, opacity: 0.4 }} />
          <Text style={s.emptyTitle}>{search ? "No projects found" : "No projects yet"}</Text>
          <Text style={s.emptyText}>{search ? `No match for "${search}"` : "Create your first project to get started"}</Text>
          {!search && (
            <Pressable style={[s.primaryBtn, { paddingHorizontal: 20, borderRadius: 12, height: undefined, width: undefined, marginTop: 16 }]}
              onPress={() => setCreateOpen(true)}>
              <Feather name="plus" size={16} color={colors.primaryForeground} />
              <Text style={[s.primaryBtnText, { marginLeft: 6 }]}>New project</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <ProjectCard project={item} onPress={() => router.push(`/project/${item.id}`)} colors={colors} />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <CreateProjectModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { qc.invalidateQueries({ queryKey: ["projects"] }); setCreateOpen(false); }}
        colors={colors}
      />
    </View>
  );
}

function ProjectCard({ project, onPress, colors }: { project: ProjectWithCounts; onPress: () => void; colors: ReturnType<typeof import("@/hooks/useColors").useColors> }) {
  const langColor = LANGUAGE_COLORS[project.language] ?? "#8a9bbf";
  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    langDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: langColor, marginRight: 8 },
    langLabel: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    name: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 4 },
    desc: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 12, lineHeight: 18 },
    stats: { flexDirection: "row", gap: 16 },
    stat: { flexDirection: "row", alignItems: "center", gap: 4 },
    statText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    arrow: { marginLeft: "auto" as "auto" },
  });
  return (
    <Pressable style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <View style={s.top}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={s.langDot} />
          <Text style={s.langLabel}>{LANGUAGE_LABELS[project.language] ?? project.language}</Text>
        </View>
        {project.isPublic && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Feather name="globe" size={11} color={colors.accentForeground} />
            <Text style={{ fontSize: 11, color: colors.accentForeground, fontFamily: "Inter_500Medium" }}>Public</Text>
          </View>
        )}
      </View>
      <Text style={s.name} numberOfLines={1}>{project.name}</Text>
      {!!project.description && <Text style={s.desc} numberOfLines={2}>{project.description}</Text>}
      <View style={s.stats}>
        <View style={s.stat}><Feather name="file" size={12} color={colors.mutedForeground} /><Text style={s.statText}>{project._count.files}</Text></View>
        <View style={s.stat}><Feather name="play" size={12} color={colors.mutedForeground} /><Text style={s.statText}>{project._count.runs}</Text></View>
        <View style={s.stat}><Feather name="message-circle" size={12} color={colors.mutedForeground} /><Text style={s.statText}>{project._count.chats}</Text></View>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={s.arrow} />
      </View>
    </Pressable>
  );
}

function CreateProjectModal({ visible, onClose, onCreated, colors }: {
  visible: boolean; onClose: () => void;
  onCreated: () => void;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("nodejs");
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsLoading(true); setError("");
    try {
      const wsRes = await api.get<ApiResponse<{ id: string }[]>>("/api/workspaces");
      // @ts-ignore
      const workspaces = wsRes.data as { id: string }[];
      if (!workspaces?.length) { setError("No workspace found. Create a workspace first."); return; }
      const workspaceId = workspaces[0].id;
      await api.post("/api/projects", { name: name.trim(), description: description.trim() || undefined, language, isPublic, workspaceId });
      setName(""); setDescription(""); setLanguage("nodejs"); setIsPublic(false);
      onCreated();
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to create project");
    } finally {
      setIsLoading(false);
    }
  };

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    sheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 20 },
    label: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, marginBottom: 6 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 11, fontSize: 15,
      color: colors.foreground, fontFamily: "Inter_400Regular",
      backgroundColor: colors.card, marginBottom: 16,
    },
    langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    langChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    langChipActive: { borderColor: colors.primary, backgroundColor: colors.accent },
    langChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    langChipTextActive: { color: colors.primary },
    toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    toggleText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    toggleBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: isPublic ? colors.primary : colors.border, backgroundColor: isPublic ? colors.accent : colors.card },
    createBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    createBtnText: { color: colors.primaryForeground, fontSize: 16, fontFamily: "Inter_600SemiBold" },
    errorText: { color: colors.destructive, fontSize: 13, marginBottom: 12, fontFamily: "Inter_400Regular" },
    cancelBtn: { alignItems: "center", paddingVertical: 12, marginBottom: 8 },
    cancelText: { color: colors.mutedForeground, fontSize: 15, fontFamily: "Inter_500Medium" },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <ScrollView style={s.sheet} keyboardShouldPersistTaps="handled">
          <Text style={s.title}>New Project</Text>
          {!!error && <Text style={s.errorText}>{error}</Text>}
          <Text style={s.label}>Project name</Text>
          <TextInput style={s.input} placeholder="My awesome app" placeholderTextColor={colors.mutedForeground} value={name} onChangeText={setName} autoFocus />
          <Text style={s.label}>Description (optional)</Text>
          <TextInput style={[s.input, { height: 80, textAlignVertical: "top" }]} placeholder="What does it do?" placeholderTextColor={colors.mutedForeground} value={description} onChangeText={setDescription} multiline />
          <Text style={s.label}>Language</Text>
          <View style={s.langRow}>
            {LANGUAGES.map((lang) => (
              <Pressable key={lang} style={[s.langChip, language === lang && s.langChipActive]} onPress={() => setLanguage(lang)}>
                <Text style={[s.langChipText, language === lang && s.langChipTextActive]}>
                  {LANGUAGE_LABELS[lang] ?? lang}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={s.toggleRow}>
            <Text style={s.toggleText}>Public project</Text>
            <Pressable style={s.toggleBadge} onPress={() => setIsPublic(v => !v)}>
              <Text style={{ color: isPublic ? colors.primary : colors.mutedForeground, fontSize: 13, fontFamily: "Inter_500Medium" }}>
                {isPublic ? "Public" : "Private"}
              </Text>
            </Pressable>
          </View>
          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
          <Pressable style={[s.createBtn, (!name.trim() || isLoading) && { opacity: 0.6 }]} onPress={handleCreate} disabled={!name.trim() || isLoading}>
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={s.createBtnText}>Create Project</Text>}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// @ts-ignore
const styles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  greeting: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
  subtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 1 },
  headerActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center",
  },
  primaryBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  primaryBtnText: { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  searchRow: {
    flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 6, textAlign: "center" },
  emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
});
