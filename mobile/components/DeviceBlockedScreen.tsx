import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/lib/theme";

/** Shown instead of the whole app when getDeviceSecurityIssue() finds a
 *  problem — no navigation out of here, no bearer token is ever read or
 *  sent from this screen. */
export function DeviceBlockedScreen({ reason }: { reason: string }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-outline" size={32} color={colors.danger} />
        </View>
        <Text style={styles.title}>Can&apos;t open the app on this device</Text>
        <Text style={styles.reason}>{reason}</Text>
        <Text style={styles.body}>
          This app handles bookings and payments, so it won&apos;t run while developer/debug
          tooling is enabled or the device shows signs of tampering. Turn it off and reopen
          the app.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.greenTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: { fontSize: 18, fontWeight: "700", color: colors.text, textAlign: "center" },
  reason: { fontSize: 14, fontWeight: "600", color: colors.danger, textAlign: "center", marginTop: 10 },
  body: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 14, lineHeight: 19 },
});
