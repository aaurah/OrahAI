import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet,
  ActivityIndicator, TextInput, ScrollView, Platform,
} from "react-native";
import { fetch } from "expo/fetch";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { api, getToken } from "@/lib/api";
import type { ApiResponse, Project, ProjectFile, ChatMessage } from "@/lib/types";

type Tab = "files" | "chat";

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [tab, setTab] = useState<Tab>("chat");

  const { data: projData, isLoading: projLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => api.get<ApiResponse<Project>>(`/api/projects/${id}`),
    enabled: !!id,
  });
  const project = projData?.data;

  useEffect(() => {
    if (project) navigation.setOptions({ title: project.name });
  }, [project]);

  const s = styles(colors);
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (projLoading) return <View style={s.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!project) return <View style={s.center}><Text style={s.errorText}>Project not found</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={s.tabBar}>
        <Pressable style={[s.tabBtn, tab === "chat" && s.tabBtnActive]} onPress={() => setTab("chat")}>
          <Feather name="cpu" size={15} color={tab === "chat" ? colors.primary : colors.mutedForeground} />
          <Text style={[s.tabLabel, tab === "chat" && s.tabLabelActive]}>AI Chat</Text>
        </Pressable>
        <Pressable style={[s.tabBtn, tab === "files" && s.tabBtnActive]} onPress={() => setTab("files")}>
          <Feather name="folder" size={15} color={tab === "files" ? colors.primary : colors.mutedForeground} />
          <Text style={[s.tabLabel, tab === "files" && s.tabLabelActive]}>Files</Text>
        </Pressable>
      </View>

      {tab === "chat" ? (
        <ChatTab projectId={id!} colors={colors} bottomPad={bottomPad} />
      ) : (
        <FilesTab projectId={id!} colors={colors} bottomPad={bottomPad} />
      )}
    </View>
  );
}

function FilesTab({ projectId, colors, bottomPad }: { projectId: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors>; bottomPad: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["files", projectId],
    queryFn: () => api.get<ApiResponse<ProjectFile[]>>(`/api/files/${projectId}`),
    enabled: !!projectId,
  });
  const files = (data?.data ?? []).filter(f => !f.isDir);
  const [selected, setSelected] = useState<ProjectFile | null>(null);
  const s = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyText: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" },
    fileRow: {
      flexDirection: "row", alignItems: "center", gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    fileName: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground, flex: 1 },
    filePath: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    codeView: { flex: 1, backgroundColor: "#0d1117" },
    backBtn: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 1, borderBottomColor: "#1e2d47" },
    backText: { fontSize: 14, color: "#a78bfa", fontFamily: "Inter_500Medium" },
    codePath: { fontSize: 12, color: "#8a9bbf", fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1e2d47" },
    codeContent: { fontSize: 13, color: "#e2e8f0", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", padding: 16, lineHeight: 20 },
  });

  if (isLoading) return <View style={s.center}><ActivityIndicator color={colors.primary} /></View>;

  if (selected) {
    return (
      <View style={s.codeView}>
        <Pressable style={s.backBtn} onPress={() => setSelected(null)}>
          <Feather name="chevron-left" size={18} color="#a78bfa" />
          <Text style={s.backText}>Files</Text>
        </Pressable>
        <Text style={s.codePath}>{selected.path}</Text>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: bottomPad + 16 }}>
          <Text style={s.codeContent}>{selected.content}</Text>
        </ScrollView>
      </View>
    );
  }

  if (!files.length) return (
    <View style={s.center}>
      <Feather name="file" size={36} color={colors.mutedForeground} style={{ opacity: 0.3, marginBottom: 8 }} />
      <Text style={s.emptyText}>No files yet</Text>
    </View>
  );

  return (
    <FlatList
      data={files}
      keyExtractor={f => f.id}
      contentContainerStyle={{ paddingBottom: bottomPad + 16 }}
      renderItem={({ item }) => (
        <Pressable style={s.fileRow} onPress={() => setSelected(item)}>
          <Feather name="file-text" size={16} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.fileName} numberOfLines={1}>{item.name}</Text>
            <Text style={s.filePath} numberOfLines={1}>{item.path}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </Pressable>
      )}
    />
  );
}

function ChatTab({ projectId, colors, bottomPad }: { projectId: string; colors: ReturnType<typeof import("@/hooks/useColors").useColors>; bottomPad: number }) {
  const [messages, setMessages] = useState<(ChatMessage & { pending?: boolean })[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.get<ApiResponse<ChatMessage[]>>(`/api/ai/chat/${projectId}`)
      .then(r => setMessages(r.data ?? [])).catch(() => {});
  }, [projectId]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    setMessages(p => [...p,
      { id: uid, projectId, userId: null, role: "user", content: text, createdAt: new Date().toISOString() },
      { id: aid, projectId, userId: null, role: "assistant", content: "", createdAt: new Date().toISOString(), pending: true },
    ]);
    setIsStreaming(true);
    abortRef.current = new AbortController();
    try {
      const token = await getToken();
      const base = api.getBaseUrl();
      const res = await fetch(`${base}/api/ai/chat/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: text }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("fail");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value as Uint8Array, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; content?: string };
            if (evt.type === "delta" && evt.content)
              setMessages(p => p.map(m => m.id === aid ? { ...m, content: m.content + evt.content } : m));
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError")
        setMessages(p => p.map(m => m.id === aid ? { ...m, content: "Error. Please try again." } : m));
    } finally {
      setMessages(p => p.map(m => m.id === aid ? { ...m, pending: false } : m));
      setIsStreaming(false);
    }
  }, [projectId, isStreaming]);

  const s = StyleSheet.create({
    container: { flex: 1 },
    msgRow: { marginBottom: 12, flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16 },
    msgUser: { justifyContent: "flex-end" },
    msgAI: { justifyContent: "flex-start" },
    aiBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 2 },
    bubble: { maxWidth: "80%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
    bubbleAI: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular", color: colors.foreground },
    starters: { paddingTop: 32, paddingHorizontal: 16 },
    starterChip: { backgroundColor: colors.card, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    starterText: { fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" },
    inputBar: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
    input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, maxHeight: 100, fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", backgroundColor: colors.card },
    sendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  });

  const STARTERS2 = ["Explain this project", "Add error handling", "Write tests", "Optimize the code"];

  return (
    <KeyboardAvoidingView style={s.container} behavior="padding">
      <FlatList
        data={[...messages].reverse()}
        keyExtractor={m => m.id}
        inverted
        contentContainerStyle={{ paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={messages.length === 0 ? (
          <View style={s.starters}>
            <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 12 }}>Get started</Text>
            {STARTERS2.map(st => (
              <Pressable key={st} style={s.starterChip} onPress={() => send(st)}>
                <Text style={s.starterText}>{st}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={[s.msgRow, item.role === "user" ? s.msgUser : s.msgAI]}>
            {item.role !== "user" && <View style={s.aiBadge}><Feather name="cpu" size={12} color={colors.primary} /></View>}
            <View style={[s.bubble, item.role === "user" ? s.bubbleUser : s.bubbleAI]}>
              {item.pending && !item.content
                ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                : <Text style={[s.bubbleText, item.role === "user" && { color: colors.primaryForeground }]}>{item.content}</Text>}
            </View>
          </View>
        )}
      />
      <View style={[s.inputBar, { paddingBottom: bottomPad + 16 }]}>
        <TextInput
          style={s.input} placeholder="Ask AI about this project…"
          placeholderTextColor={colors.mutedForeground}
          value={input} onChangeText={setInput} multiline editable={!isStreaming}
        />
        {isStreaming
          ? <Pressable style={s.sendBtn} onPress={() => abortRef.current?.abort()}><Feather name="square" size={14} color={colors.destructive} /></Pressable>
          : <Pressable style={[s.sendBtn, !input.trim() && { opacity: 0.4 }]} onPress={() => send(input)} disabled={!input.trim()}>
              <Feather name="send" size={16} color={colors.primaryForeground} />
            </Pressable>}
      </View>
    </KeyboardAvoidingView>
  );
}

// @ts-ignore
const styles = (colors) => StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  errorText: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  tabBar: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  tabLabelActive: { color: colors.primary },
});
