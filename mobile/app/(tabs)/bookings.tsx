import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api, ApiError, verifyPayment } from "@/lib/api";
import { colors, radius, shadow } from "@/lib/theme";
import { CheckoutModal } from "@/components/CheckoutModal";

interface BookingItem {
  id: string;
  status: string;
  amountGHS: number;
  cancelReason: string | null;
  promotionExpiresAt: string | null;
  paymentPending: boolean;
  session: {
    startsAt: string;
    classType: { name: string } | null;
    trainer: { name: string };
  };
  canCancel: boolean;
}

interface BookingsResponse {
  bookings: BookingItem[];
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  BOOKED: { bg: colors.greenTint, fg: colors.greenDark },
  PENDING: { bg: "#FFF3E0", fg: "#B8620A" },
  WAITLIST: { bg: "#FFF3E0", fg: "#B8620A" },
  ATTENDED: { bg: colors.greenTint, fg: colors.greenDark },
  NO_SHOW: { bg: "#FDECEA", fg: "#C0392B" },
  CANCELLED: { bg: colors.card, fg: colors.textMuted },
};

// A cash booking reserves the spot right away, but stays flagged as pending
// until staff confirm the cash was actually collected — shown as its own
// "payment pending" pill instead of "Booked" so it isn't mistaken for paid.
function StatusPill({ status, paymentPending }: { status: string; paymentPending: boolean }) {
  const label = status === "BOOKED" && paymentPending ? "PENDING" : status;
  const s = STATUS_STYLE[label] ?? STATUS_STYLE.CANCELLED;
  return (
    <View style={[pillStyles.pill, { backgroundColor: s.bg }]}>
      <Text style={[pillStyles.text, { color: s.fg }]}>
        {label === "PENDING" ? "Payment pending" : status.replace("_", " ")}
      </Text>
    </View>
  );
}

export default function BookingsScreen() {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<BookingsResponse>("/api/app/bookings");
      setBookings(res.bookings);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onCancel(id: string) {
    setBusyId(id);
    try {
      await api(`/api/app/bookings/${id}`, { method: "PATCH", body: { action: "CANCEL" } });
      await load();
    } catch (e) {
      Alert.alert("Couldn't cancel", e instanceof ApiError ? e.message : "Try again");
    } finally {
      setBusyId(null);
    }
  }

  async function onClaim(id: string) {
    setBusyId(id);
    try {
      const res = await api<{ authorizationUrl: string; reference?: string }>(
        `/api/app/bookings/${id}/claim`,
        { method: "POST" },
      );
      setCheckoutUrl(res.authorizationUrl);
    } catch (e) {
      Alert.alert("Couldn't open checkout", e instanceof ApiError ? e.message : "Try again");
      setBusyId(null);
    }
  }

  async function onCheckoutClose(reference: string | null) {
    setCheckoutUrl(null);
    if (reference) {
      try {
        const { status } = await verifyPayment(reference);
        if (status === "success") {
          Alert.alert("You're in!", "Payment received — your spot is confirmed.");
        } else {
          Alert.alert("Payment not completed", `Status: ${status}.`);
        }
      } catch {
        Alert.alert("Couldn't confirm payment", "If you completed checkout, check back shortly.");
      }
    }
    await load();
    setBusyId(null);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <CheckoutModal url={checkoutUrl} onClose={onCheckoutClose} />
      <View style={styles.headerRow}>
        <Text style={styles.header}>Your bookings</Text>
        <Pressable
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
          onPress={() => router.push("/(tabs)/timetable")}
          hitSlop={8}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </View>
      <FlatList
        style={styles.container}
        data={bookings}
        keyExtractor={(b) => b.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />
        }
        contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
              <Text style={styles.empty}>No bookings yet.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{item.session.classType?.name ?? "Private class session"}</Text>
                <Text style={styles.cardSub}>
                  {new Date(item.session.startsAt).toLocaleString()} · {item.session.trainer.name}
                </Text>
              </View>
              <StatusPill status={item.status} paymentPending={item.paymentPending} />
            </View>

            {item.status === "BOOKED" && item.paymentPending && (
              <Text style={styles.rescheduleNote}>Pay at the studio to confirm this spot — a staff member will mark it received.</Text>
            )}

            {item.status === "CANCELLED" && item.cancelReason && (
              <Text style={styles.rescheduleNote}>{item.cancelReason}</Text>
            )}

            {item.canCancel && (
              <Pressable
                style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.secondaryPressed]}
                disabled={busyId === item.id}
                onPress={() => onCancel(item.id)}
              >
                {busyId === item.id ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Cancel booking</Text>
                )}
              </Pressable>
            )}
            {item.status === "WAITLIST" && item.promotionExpiresAt && (
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                disabled={busyId === item.id}
                onPress={() => onClaim(item.id)}
              >
                {busyId === item.id ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="card-outline" size={16} color={colors.white} />
                    <Text style={styles.buttonText}>Pay to claim your spot</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const pillStyles = StyleSheet.create({
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: { fontSize: 26, fontWeight: "700", color: colors.text },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonPressed: { backgroundColor: colors.greenDark },
  container: { flex: 1 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 14 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: colors.text },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rescheduleNote: { fontSize: 12, color: colors.textMuted, marginTop: 10, fontStyle: "italic" },
  button: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: 11,
    marginTop: 14,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonText: { color: colors.white, fontWeight: "700" },
  secondaryButton: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  secondaryPressed: { backgroundColor: colors.border },
  secondaryButtonText: { color: colors.danger, fontWeight: "700" },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    gap: 10,
    marginTop: 20,
  },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
});
