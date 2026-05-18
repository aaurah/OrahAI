import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, TextInput, Pressable, StyleSheet,
  ActivityIndicator, Platform,
} from "react-native";
import { fetch } from "expo/fetch";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { api, getToken } from "@/lib/api";
import type { ApiResponse, ProjectWithCounts, ChatMessage } from "@/lib/types";

const STARTERS = [
  "Build me a REST API",
  "Create a web scraper",
  "Add authentication to my app",
  "Write unit tests for my code",
  "Optimize my database queries",
  "Create a React component",
];

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<(ChatMessage & { pending?: boolean })[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const { data: projData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<ApiResponse<ProjectWithCounts[]>>("/api/projects"),
  });
  const projects = projData?.data ?? [];

  useEffect(() => {
    if (!selectedProjectId) return;
    api.get<ApiResponse<ChatMessage[]>>(`/api/ai/chat/${selectedProjectId}`)
      .then(res => setMessages(res.data ?? []))
      .catch(() => {});
  }, [selectedProjectId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !selectedProjectId || isStreaming) return;
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userId = `temp-${Date.now()}`;
    const aId = `temp-${Date.now() + 1}`;
    const userMsg: ChatMessage = { id: userId, projectId: selectedProjectId, userId: null, role: "user", content: text, createdAt: new Date().toISOString() };
    const aMsg: ChatMessage & { pending: boolean } = { id: aId, projectId: selectedProjectId, userId: null, role: "assistant", content: "", createdAt: new Date().toISOString(), pending: true };

    setMessages(prev => [...prev, userMsg, aMsg]);
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      const token = await getToken();
      const baseUrl = api.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/ai/chat/${selectedProjectId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value as Uint8Array, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; content?: string };
            if (evt.type === "delta" && evt.content) {
              setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: m.content + evt.content } : m));
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: "Something went wrong. Please try again." } : m));
      }
    } finally {
      setMessages(prev => prev.map(m => m.id === aId ? { ...m, pending: false } : m));
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [selectedProjectId, isStreaming]);

  const s = styles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  if (!selectedProjectId) {
    return (
      <View style={[s.container, { paddingTop: topPad }]}>
        <View style={s.header}>
          <Feather name="cpu" size={20} color={colors.primary} />
          <Text style={s.headerTitle}>AI Chat</Text>
        </View>
        <Text style={s.selectLabel}>Select a project to start chatting</Text>
        <FlatList
          data={projects}
          keyExtractor={i => i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 83 }}
          ListEmptyComponent={
            <View style={s.center}>
              <Feather name="folder" size={36} color={colors.mutedForeground} style={{ opacity: 0.3, marginBottom: 10 }} />
              <Text style={s.emptyText}>No projects yet. Create one first.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={s.projectRow} onPress={() => setSelectedProjectId(item.id)}>
              <View style={[s.langDot, { backgroundColor: "#7c3aed" }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.projectName}>{item.name}</Text>
                <Text style={s.projectLang}>{item.language}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      </View>
    );
  }

  const project = projects.find(p => p.id === selectedProjectId);

  return (
    <KeyboardAvoidingView style={[s.container, { paddingTop: topPad }]} behavior="padding">
      <View style={s.header}>
        <Pressable onPress={() => { setSelectedProjectId(null); setMessages([]); }} style={{ marginRight: 10 }}>
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Pressable>
        <Feather name="cpu" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={[s.headerTitle, { flex: 1 }]} numberOfLines={1}>{project?.name ?? "Chat"}</Text>
        {isStreaming && (
          <Pressable onPress={() => abortRef.current?.abort()} style={s.stopBtn}>
            <Feather name="square" size={14} color={colors.destructive} />
          </Pressable>
        )}
        <Pressable onPress={() => {
          api.delete(`/api/ai/chat/${selectedProjectId}`).then(() => setMessages([])).catch(() => {});
        }}>
          <Feather name="trash-2" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={[...messages].reverse()}
        keyExtractor={m => m.id}
        inverted
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={messages.length === 0 ? (
          <View style={s.starters}>
            <Text style={s.starterTitle}>What would you like to build?</Text>
            {STARTERS.map(s2 => (
              <Pressable key={s2} style={s.starterChip} onPress={() => sendMessage(s2)}>
                <Text style={s.starterText}>{s2}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        renderItem={({ item }) => (
          <View style={[s.msgRow, item.role === "user" ? s.msgRowUser : s.msgRowAI]}>
            {item.role !== "user" && (
              <View style={s.aiBadge}>
                <Feather name="cpu" size={12} color={colors.primary} />
              </View>
            )}
            <View style={[s.bubble, item.role === "user" ? s.bubbleUser : s.bubbleAI]}>
              {item.pending && !item.content
                ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                : <Text style={[s.bubbleText, item.role === "user" && { color: colors.primaryForeground }]}>
                    {item.content}
                  </Text>}
            </View>
          </View>
        )}
      />

      <View style={[s.inputRow, { paddingBottom: bottomPad + 83 }]}>
        <TextInput
          style={s.textInput}
          placeholder="Ask AI to build something…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={2000}
          editable={!isStreaming}
        />
        <Pressable
          style={[s.sendBtn, (!input.trim() || isStreaming) && { opacity: 0.4 }]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || isStreaming}
        >
          <Feather name="send" size={16} color={colors.primaryForeground} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// @ts-ignore
const styles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  stopBtn: { marginRight: 12, padding: 6, borderRadius: 8, backgroundColor: colors.destructive + "15" },
  selectLabel: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingVertical: 12 },
  projectRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  langDot: { width: 10, height: 10, borderRadius: 5 },
  projectName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  projectLang: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
  center: { paddingTop: 60, alignItems: "center" },
  emptyText: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center" },
  starters: { paddingTop: 40, paddingBottom: 24, alignItems: "flex-start" },
  starterTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 14, paddingHorizontal: 4 },
  starterChip: {
    backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 8, borderWidth: 1, borderColor: colors.border,
  },
  starterText: { fontSize: 13, color: colors.foreground, fontFamily: "Inter_400Regular" },
  msgRow: { marginBottom: 12, flexDirection: "row", alignItems: "flex-end" },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAI: { justifyContent: "flex-start" },
  aiBadge: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent,
    alignItems: "center", justifyContent: "center", marginRight: 8, marginBottom: 2,
  },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleAI: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", lineHeight: 20 },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 10, maxHeight: 120,
    fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular",
    backgroundColor: colors.card,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
});
