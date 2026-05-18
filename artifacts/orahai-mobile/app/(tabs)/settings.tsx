import React, { useState } from "react";
import {
  View, Text, ScrollView, Pressable, TextInput,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

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
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    padding: 16,
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
