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
import { ApiError, signup } from "@/lib/api";
import { colors, radius, shadow } from "@/lib/theme";

type Step = "FORM" | "OTP";

function generateDevCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function SignupScreen() {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>("FORM");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  // DEV ONLY: generated and shown right here instead of sent by real SMS, so
  // signup can be tested without an SMS provider configured. The real
  // account is still created for real via signup() below. Before going to
  // production, swap this for the backend's existing sendOtp()/verifyOtp()
  // flow (see backend/src/lib/otp.ts and lib/api.ts's now-unused
  // verifyPhoneOtp/resendPhoneOtp helpers) — the account model doesn't need
  // to change, just how the code is generated and checked.
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmitForm() {
    setError(null);
    if (form.password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      await signup(form);
      setDevCode(generateDevCode());
      setCode("");
      setStep("OTP");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create your account — try again");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitOtp() {
    setError(null);
    if (code !== devCode) {
      setError("Incorrect code");
      return;
    }
    setLoading(true);
    try {
      await login(form.email, form.password);
      router.replace("/(tabs)/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't sign in — try again");
    } finally {
      setLoading(false);
    }
  }

  function onResend() {
    setDevCode(generateDevCode());
    setCode("");
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
              source={require("../assets/_KP_3668.png")}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={300}
            />
            {/* Fades the image's edges into the page background — top for
                status-bar legibility, bottom to blend into the form below,
                sides for a soft vignette rather than a hard photo edge. */}
            <LinearGradient
              colors={["rgba(0,0,0,0.35)", "transparent"]}
              style={styles.fadeTop}
            />
            <LinearGradient
              colors={["transparent", colors.background]}
              style={styles.fadeBottom}
            />
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
            {step === "FORM" ? (
              <>
                <Text style={styles.title}>Create your account</Text>
                <Text style={styles.subtitle}>Join P4Studio to book your first class</Text>

                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Full name"
                    placeholderTextColor={colors.textMuted}
                    value={form.name}
                    onChangeText={(v) => setForm({ ...form, name: v })}
                  />
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={form.email}
                    onChangeText={(v) => setForm({ ...form, email: v })}
                  />
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="call-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Phone (+233…)"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="phone-pad"
                    value={form.phone}
                    onChangeText={(v) => setForm({ ...form, phone: v })}
                  />
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password (8+ characters)"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    value={form.password}
                    onChangeText={(v) => setForm({ ...form, password: v })}
                  />
                </View>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={20} color={colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm password"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                </View>

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={onSubmitForm}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.buttonText}>Create account</Text>
                  )}
                </Pressable>

                <Pressable style={styles.linkRow} hitSlop={8} onPress={() => router.push("/login")}>
                  <View style={styles.linkTextRow}>
                    <Text style={styles.linkText}>Already have an account? </Text>
                    <Text style={styles.linkTextStrong}>Log in</Text>
                  </View>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.title}>Verify your number</Text>
                <Text style={styles.subtitle}>
                  We&apos;d normally text a code to {form.phone} — for now, here it is:
                </Text>

                <View style={styles.devCodeBanner}>
                  <Ionicons name="construct-outline" size={16} color={colors.greenDark} />
                  <Text style={styles.devCodeText}>{devCode}</Text>
                </View>

                <TextInput
                  style={styles.otpInput}
                  placeholder="123456"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                />

                {error && <Text style={styles.error}>{error}</Text>}

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    (loading || code.length !== 6) && styles.buttonDisabled,
                    pressed && code.length === 6 && !loading && styles.buttonPressed,
                  ]}
                  onPress={onSubmitOtp}
                  disabled={loading || code.length !== 6}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.buttonText}>Verify and continue</Text>
                  )}
                </Pressable>

                <Pressable style={styles.linkRow} hitSlop={8} onPress={onResend}>
                  <Text style={styles.linkText}>Generate a new code</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const HERO_HEIGHT = 180;
const FADE_SIZE = 36;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  hero: { height: HERO_HEIGHT, backgroundColor: colors.text },
  fadeTop: { position: "absolute", top: 0, left: 0, right: 0, height: 60 },
  fadeBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 70 },
  fadeLeft: { position: "absolute", top: 0, bottom: 0, left: 0, width: FADE_SIZE },
  fadeRight: { position: "absolute", top: 0, bottom: 0, right: 0, width: FADE_SIZE },
  formArea: { padding: 24, paddingTop: 8, paddingBottom: 32 },
  title: { fontSize: 26, fontWeight: "700", color: colors.text, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 4, marginBottom: 28 },
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
  devCodeBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.greenTint,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginBottom: 16,
  },
  devCodeText: { fontSize: 20, fontWeight: "700", letterSpacing: 6, color: colors.greenDark },
  otpInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 16,
    fontSize: 22,
    letterSpacing: 10,
    textAlign: "center",
    color: colors.text,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
    ...shadow.card,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonDisabled: { backgroundColor: colors.border },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  error: { color: colors.danger, marginBottom: 12, textAlign: "center" },
  linkRow: { marginTop: 20, alignItems: "center", paddingVertical: 8 },
  linkTextRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  linkText: { fontSize: 14, color: colors.textMuted },
  linkTextStrong: { fontSize: 14, color: colors.greenDark, fontWeight: "700" },
});
