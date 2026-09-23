import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { colors, radius, shadow } from "@/lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't sign in — check your connection");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Image
              source={require("../assets/_KP_0069.png")}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />
            <LinearGradient colors={["rgba(0,0,0,0.35)", "transparent"]} style={styles.fadeTop} />
            <LinearGradient colors={["transparent", colors.background]} style={styles.fadeBottom} />
            <LinearGradient
              colors={[colors.background, "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fadeLeft}
            />
            <LinearGradient
              colors={["transparent", colors.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fadeRight}
            />
          </View>

          <View style={styles.formArea}>
            <Text style={styles.title}>P4Studio</Text>
            <Text style={styles.subtitle}>Sign in to book your next class</Text>

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </Pressable>

            <Pressable style={styles.linkRow} hitSlop={8} onPress={() => router.push("/signup")}>
              <View style={styles.linkTextRow}>
                <Text style={styles.linkText}>Don&apos;t have an account? </Text>
                <Text style={styles.linkTextStrong}>Sign up</Text>
              </View>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const HERO_HEIGHT = 200;
const FADE_SIZE = 36;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  hero: { height: HERO_HEIGHT, backgroundColor: colors.text },
  fadeTop: { position: "absolute", top: 0, left: 0, right: 0, height: 70 },
  fadeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 80 },
  fadeLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: FADE_SIZE },
  fadeRight: { position: "absolute", top: 0, bottom: 0, right: 0, width: FADE_SIZE },
  formArea: { padding: 24, paddingTop: 12, paddingBottom: 32 },
  title: { fontSize: 28, fontWeight: "700", color: colors.text, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: 32 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 16, fontSize: 16, color: colors.text },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
    ...shadow.card,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  error: { color: colors.danger, marginBottom: 12, textAlign: "center" },
  linkRow: { marginTop: 20, alignItems: "center", paddingVertical: 8 },
  linkTextRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  linkText: { fontSize: 14, color: colors.textMuted },
  linkTextStrong: { fontSize: 14, color: colors.greenDark, fontWeight: "700" },
});
