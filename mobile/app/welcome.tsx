import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { colors, radius, shadow } from "@/lib/theme";

export default function WelcomeScreen() {
  return (
    <View style={styles.root}>
      <Image
        source={require("../assets/_KP_7800.png")}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
      />
      <LinearGradient
        colors={["rgba(10,15,11,0.35)", "rgba(10,15,11,0.55)", "rgba(8,12,9,0.9)"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.top}>
            <View style={styles.logo}>
              <Image source={require("../assets/p4.png")} style={styles.logoImage} contentFit="contain" />
            </View>
            <Text style={styles.title}>P4Studio</Text>
            <Text style={styles.subtitle}>
              Book classes, track your progress, and manage your membership.
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.buttonText}>Next</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.text },
  safe: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    padding: 24,
    paddingBottom: 32,
  },
  top: { alignItems: "center", paddingVertical: 40 },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    ...shadow.card,
  },
  logoImage: { width: 60, height: 60 },
  title: { fontSize: 32, fontWeight: "700", color: colors.white, textAlign: "center" },
  subtitle: {
    fontSize: 15,
    color: "#E7ECE8",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 16,
    ...shadow.card,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
});
