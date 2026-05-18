import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView,
} from "react-native";
import { Link } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setIsLoading(true);
    setError("");
    try {
      await login(email.trim().toLowerCase(), password);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Invalid email or password");
    } finally {
      setIsLoading(false);
    }
  };

  const s = styles(colors);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.logoRow}>
          <View style={s.logoBox}>
            <Feather name="cpu" size={22} color={colors.primaryForeground} />
          </View>
          <Text style={s.logoText}>OrahAI</Text>
        </View>

        <Text style={s.title}>Welcome back</Text>
        <Text style={s.subtitle}>Sign in to your account</Text>

        {!!error && (
          <View style={s.errorBanner}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <View style={s.field}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
        </View>

        <View style={s.field}>
          <Text style={s.label}>Password</Text>
          <View style={s.inputRow}>
            <TextInput
              style={[s.input, { flex: 1, marginBottom: 0 }]}
              placeholder="••••••••"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
            />
            <Pressable onPress={() => setShowPassword(v => !v)} style={s.eyeBtn}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[s.btn, isLoading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={isLoading || !email || !password}
        >
          {isLoading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : <Text style={s.btnText}>Sign in</Text>}
        </Pressable>

        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={s.footerLink}>Sign up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// @ts-ignore
const styles = (colors: ReturnType<typeof import("@/hooks/useColors").useColors>) =>
  StyleSheet.create({
    container: { paddingHorizontal: 24 },
    logoRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 40 },
    logoBox: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
    },
    logoText: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    title: { fontSize: 26, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6 },
    subtitle: { fontSize: 15, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 28 },
    errorBanner: {
      flexDirection: "row", alignItems: "center", gap: 8,
      backgroundColor: colors.destructive + "18", borderWidth: 1,
      borderColor: colors.destructive + "40", borderRadius: 10,
      padding: 12, marginBottom: 20,
    },
    errorText: { color: colors.destructive, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
    field: { marginBottom: 16 },
    label: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground, marginBottom: 6 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: colors.foreground, fontFamily: "Inter_400Regular",
      backgroundColor: colors.card, marginBottom: 0,
    },
    inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.card },
    eyeBtn: { paddingHorizontal: 14, paddingVertical: 12 },
    btn: {
      backgroundColor: colors.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: "center", marginTop: 8, marginBottom: 24,
    },
    btnText: { color: colors.primaryForeground, fontSize: 16, fontFamily: "Inter_600SemiBold" },
    footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
    footerText: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" },
    footerLink: { color: colors.primary, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  });
