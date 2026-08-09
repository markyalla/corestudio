import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";
import type { PaymentItem } from "../(tabs)/profile";

const PAYMENT_STATUS_STYLE: Record<string, { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  CONFIRMED: { bg: colors.greenTint, fg: colors.greenDark, icon: "checkmark-circle" },
  PENDING: { bg: "#FFF3E0", fg: "#B8620A", icon: "time" },
  FAILED: { bg: "#FDECEA", fg: "#C0392B", icon: "close-circle" },
};

const BOOKING_STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  BOOKED: { bg: colors.greenTint, fg: colors.greenDark },
  WAITLIST: { bg: "#FFF3E0", fg: "#B8620A" },
  ATTENDED: { bg: colors.greenTint, fg: colors.greenDark },
  NO_SHOW: { bg: "#FDECEA", fg: "#C0392B" },
  CANCELLED: { bg: colors.card, fg: colors.textMuted },
};

function StatusPill({ style, label }: { style: { bg: string; fg: string }; label: string }) {
  return (
    <View style={[pillStyles.pill, { backgroundColor: style.bg }]}>
      <Text style={[pillStyles.text, { color: style.fg }]}>{label.replace("_", " ")}</Text>
    </View>
  );
}

export default function PaymentDetailScreen() {
  const { data } = useLocalSearchParams<{ id: string; data: string }>();
  const payment = useMemo<PaymentItem | null>(() => {
    try {
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }, [data]);

  if (!payment) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.empty}>Payment not found.</Text>
      </SafeAreaView>
    );
  }

  const paymentStyle = PAYMENT_STATUS_STYLE[payment.status] ?? PAYMENT_STATUS_STYLE.PENDING;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: paymentStyle.bg }]}>
            <Ionicons name={paymentStyle.icon} size={32} color={paymentStyle.fg} />
          </View>
          <Text style={styles.amount}>{formatGHS(payment.amountGHS)}</Text>
          <StatusPill style={paymentStyle} label={payment.status} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment details</Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Description</Text>
            <Text style={styles.rowValue} numberOfLines={2}>{payment.description}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Method</Text>
            <Text style={styles.rowValue}>{payment.method}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Date</Text>
            <Text style={styles.rowValue}>{new Date(payment.createdAt).toLocaleString()}</Text>
          </View>
          {!!payment.paystackRef && (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Reference</Text>
              <Text style={styles.rowValue} numberOfLines={1}>{payment.paystackRef}</Text>
            </View>
          )}
        </View>

        {payment.booking && (
          <View style={styles.card}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>Booking</Text>
              <StatusPill
                style={BOOKING_STATUS_STYLE[payment.booking.status] ?? BOOKING_STATUS_STYLE.CANCELLED}
                label={payment.booking.status}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Class</Text>
              <Text style={styles.rowValue}>{payment.booking.session.classType?.name ?? "PT session"}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Trainer</Text>
              <Text style={styles.rowValue}>{payment.booking.session.trainer.name}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>When</Text>
              <Text style={styles.rowValue}>
                {new Date(payment.booking.session.startsAt).toLocaleString()}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const pillStyles = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  text: { fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { paddingHorizontal: 12, paddingTop: 4 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  content: { padding: 20, paddingBottom: 32 },
  hero: { alignItems: "center", marginBottom: 24, gap: 10 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  amount: { fontSize: 30, fontWeight: "700", color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, marginBottom: 16, ...shadow.card },
  cardTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 14,
  },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 13, color: colors.text, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 40 },
});
