import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useTheme, type Theme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/lib/types";

const THEMES: { value: Theme; label: string; icon: string; desc: string }[] = [
  { value: "light",  label: "Light",  icon: "sun",    desc: "White background" },
  { value: "dark",   label: "Dark",   icon: "moon",   desc: "Dark navy background" },
  { value: "amoled", label: "AMOLED", icon: "circle", desc: "Pure black — saves battery" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { theme, setTheme } = useTheme();
  const { user, logout, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const [ghLogin, setGhLogin] = useState<string | null>(null);
  const [ghToken, setGhToken] = useState("");
  const [showGhInput, setShowGhInput] = useState(false);
  const [isSavingGh, setIsSavingGh] = useState(false);

  useEffect(() => {
    api.get<ApiResponse<{ hasToken: boolean; login?: string }>>("/api/github/token")
      .then((r) => { if (r.data.hasToken && r.data.login) setGhLogin(r.data.login); })
      .catch(() => {});
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 + 84 : insets.bottom + 83;

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      await api.patch("/api/auth/me", { name: name.trim() || null, bio: bio.trim() || null });
      await refreshUser();
      setEditing(false);
    } catch { /* ignore */ } finally { setIsSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!currentPwd || !newPwd) return;
    setChangingPwd(true);
    try {
      await api.post("/api/auth/change-password", { currentPassword: currentPwd, newPassword: newPwd });
      setCurrentPwd(""); setNewPwd("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Password changed successfully.");
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message ?? "Failed to change password");
    } finally { setChangingPwd(false); }
  };

  const handleSaveGhToken = async () => {
    if (!ghToken.trim()) return;
    setIsSavingGh(true);
    try {
      const r = await api.post<ApiResponse<{ login: string }>>("/api/github/token", { token: ghToken.trim() });
      setGhLogin(r.data.login);
      setGhToken(""); setShowGhInput(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message ?? "Invalid token");
    } finally { setIsSavingGh(false); }
  };

  const handleRemoveGhToken = () => {
    Alert.alert("Remove GitHub token", "This will disconnect your GitHub account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove", style: "destructive", onPress: async () => {
          try {
            await api.delete("/api/github/token");
            setGhLogin(null);
          } catch { /* ignore */ }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: logout },
    ]);
  };

  const s = styles(colors);

  return (
    <ScrollView
      style={[s.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Text style={s.headerTitle}>Profile</Text>
        <Pressable onPress={() => { setEditing(v => !v); setName(user?.name ?? ""); setBio(user?.bio ?? ""); }}>
          <Feather name={editing ? "x" : "edit-2"} size={20} color={colors.primary} />
        </Pressable>
      </View>

      <View style={s.avatarSection}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(user?.name ?? user?.username ?? "?")[0].toUpperCase()}</Text>
        </View>
        <Text style={s.displayName}>{user?.name ?? user?.username}</Text>
        <Text style={s.emailText}>{user?.email}</Text>
        <View style={s.usernameBadge}>
          <Feather name="at-sign" size={12} color={colors.mutedForeground} />
          <Text style={s.usernameText}>{user?.username}</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Account Info</Text>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Name</Text>
          {editing
            ? <TextInput style={s.inlineInput} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.mutedForeground} />
            : <Text style={s.infoValue}>{user?.name ?? "—"}</Text>}
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Username</Text>
          <Text style={s.infoValue}>@{user?.username}</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Email</Text>
          <Text style={s.infoValue} numberOfLines={1}>{user?.email}</Text>
        </View>
        <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
          <Text style={s.infoLabel}>Bio</Text>
          {editing
            ? <TextInput style={[s.inlineInput, { height: 60, textAlignVertical: "top" }]} value={bio} onChangeText={setBio} placeholder="Tell us about yourself" placeholderTextColor={colors.mutedForeground} multiline />
            : <Text style={s.infoValue} numberOfLines={2}>{user?.bio ?? "—"}</Text>}
        </View>
        {editing && (
          <Pressable style={[s.saveBtn, isSaving && { opacity: 0.7 }]} onPress={saveProfile} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={s.saveBtnText}>Save changes</Text>}
          </Pressable>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Change Password</Text>
        <TextInput style={s.field} placeholder="Current password" placeholderTextColor={colors.mutedForeground} value={currentPwd} onChangeText={setCurrentPwd} secureTextEntry />
        <TextInput style={s.field} placeholder="New password (min. 8 chars)" placeholderTextColor={colors.mutedForeground} value={newPwd} onChangeText={setNewPwd} secureTextEntry />
        <Pressable
          style={[s.outlineBtn, (!currentPwd || !newPwd || changingPwd) && { opacity: 0.5 }]}
          onPress={handleChangePassword} disabled={!currentPwd || !newPwd || changingPwd}
        >
          {changingPwd ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={s.outlineBtnText}>Update password</Text>}
        </Pressable>
      </View>

      {/* ── Theme ──────────────────────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>Theme</Text>
        {THEMES.map((t) => (
          <Pressable key={t.value} style={s.themeRow} onPress={() => setTheme(t.value)}>
            <View style={[s.themeIcon, theme === t.value && { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}>
              <Feather name={t.icon as any} size={16} color={theme === t.value ? colors.primary : colors.mutedForeground} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.themeLabel, theme === t.value && { color: colors.primary }]}>{t.label}</Text>
              <Text style={s.themeDesc}>{t.desc}</Text>
            </View>
            {theme === t.value && <Feather name="check" size={16} color={colors.primary} />}
          </Pressable>
        ))}
      </View>

      {/* ── GitHub ─────────────────────────────────────────────────────── */}
      <View style={s.card}>
        <Text style={s.sectionTitle}>GitHub</Text>
        {ghLogin ? (
          <View style={s.ghConnectedRow}>
            <Feather name="github" size={18} color={colors.foreground} />
            <View style={{ flex: 1 }}>
              <Text style={s.ghLogin}>@{ghLogin}</Text>
              <Text style={s.ghDesc}>GitHub token connected</Text>
            </View>
            <Pressable onPress={handleRemoveGhToken}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.ghDesc}>Connect your GitHub account to pull and push code.</Text>
            {!showGhInput ? (
              <Pressable style={s.outlineBtn} onPress={() => setShowGhInput(true)}>
                <Text style={s.outlineBtnText}>Add GitHub token</Text>
              </Pressable>
            ) : (
              <>
                <TextInput
                  style={s.field}
                  placeholder="ghp_xxxxxxxxxxxx"
                  placeholderTextColor={colors.mutedForeground}
                  value={ghToken}
                  onChangeText={setGhToken}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable style={[s.saveBtn, { flex: 1 }, (!ghToken.trim() || isSavingGh) && { opacity: 0.5 }]} onPress={handleSaveGhToken} disabled={!ghToken.trim() || isSavingGh}>
                    {isSavingGh ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Text style={s.saveBtnText}>Save token</Text>}
                  </Pressable>
                  <Pressable style={[s.outlineBtn, { flex: 1 }]} onPress={() => { setShowGhInput(false); setGhToken(""); }}>
                    <Text style={s.outlineBtnText}>Cancel</Text>
                  </Pressable>
                </View>
              </>
            )}
          </>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>App</Text>
        <View style={s.metaRow}>
          <Feather name="cpu" size={16} color={colors.mutedForeground} />
          <Text style={s.metaText}>OrahAI Mobile</Text>
          <Text style={s.metaVersion}>v1.0.0</Text>
        </View>
      </View>

      <Pressable style={s.logoutBtn} onPress={handleLogout}>
        <Feather name="log-out" size={18} color={colors.destructive} />
        <Text style={s.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

// @ts-ignore
const styles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
  avatarSection: { alignItems: "center", paddingVertical: 24 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 10,
  },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
  displayName: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 4 },
  emailText: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 8 },
  usernameBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.secondary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  usernameText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
  card: {
    marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16,
  },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", width: 80 },
  infoValue: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" },
  inlineInput: {
    flex: 1, textAlign: "right", fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular",
    borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.background,
  },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: 10, alignItems: "center", marginTop: 14,
  },
  saveBtnText: { color: colors.primaryForeground, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  field: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
    color: colors.foreground, fontFamily: "Inter_400Regular",
    backgroundColor: colors.background, marginBottom: 10,
  },
  outlineBtn: {
    borderWidth: 1, borderColor: colors.primary, borderRadius: 10,
    paddingVertical: 10, alignItems: "center",
  },
  outlineBtnText: { color: colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  themeRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  themeIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  themeLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 1 },
  themeDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  ghConnectedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  ghLogin: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.foreground },
  ghDesc: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1 },
  metaVersion: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginHorizontal: 16, marginBottom: 24, padding: 14,
    backgroundColor: colors.destructive + "12", borderRadius: 14,
    borderWidth: 1, borderColor: colors.destructive + "30",
  },
  logoutText: { color: colors.destructive, fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
