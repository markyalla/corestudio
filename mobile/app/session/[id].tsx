import { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Share, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { api, ApiError, verifyPayment } from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";
import { CapacityRing } from "@/components/CapacityRing";
import { CheckoutModal } from "@/components/CheckoutModal";

interface SessionDetail {
  id: string;
  startsAt: string;
  durationMins: number;
  capacity: number;
  taken: number;
  priceGHS: number;
  classType: { id: string; name: string; description: string } | null;
  trainer: { id: string; name: string; specialty: string; bio: string; photoUrl: string | null };
  location: { id: string; name: string; address: string } | null;
  myStatus: string | null;
  cutoffMinutes?: number;
}

export default function SessionDetailScreen() {
  const { data } = useLocalSearchParams<{ id: string; data: string }>();
  const session = useMemo<SessionDetail | null>(() => {
    try {
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }, [data]);
  const [booking, setBooking] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.empty}>Class not found.</Text>
      </SafeAreaView>
    );
  }

  const full = session.taken >= session.capacity;
  const booked = session.myStatus === "BOOKED" || session.myStatus === "ATTENDED";
  const waitlisted = session.myStatus === "WAITLIST";
  const mine = booked || waitlisted;
  const className = session.classType?.name ?? "PT session";
  const cutoffMinutes = session.cutoffMinutes ?? 45;
  const closed = !mine && +new Date(session.startsAt) - Date.now() < cutoffMinutes * 60_000;
  const disabled = mine || closed;

  async function onBook() {
    setBooking(true);
    try {
      const res = await api<{ authorizationUrl?: string; reference?: string }>(
        "/api/app/bookings",
        { method: "POST", body: { sessionId: session!.id } },
      );

      if (res.authorizationUrl) {
        // Paid booking: show checkout in the in-app modal; onCheckoutClose
        // takes it from here once the sheet closes.
        setCheckoutUrl(res.authorizationUrl);
      } else {
        Alert.alert("You're booked!", "See you in class.");
        router.back();
      }
    } catch (e) {
      Alert.alert("Couldn't book", e instanceof ApiError ? e.message : "Try again");
    } finally {
      setBooking(false);
    }
  }

  async function onCheckoutClose(reference: string | null) {
    setCheckoutUrl(null);
    if (!reference) return; // user closed the sheet without paying
    try {
      const { status } = await verifyPayment(reference);
      if (status === "success") {
        Alert.alert("You're booked!", "Payment received — see you in class.");
      } else {
        Alert.alert(
          "Payment not completed",
          `Status: ${status}. If you paid, check My Bookings in a moment — it can take a few seconds to confirm.`,
        );
      }
    } catch {
      Alert.alert("Couldn't confirm payment", "If you completed checkout, check My Bookings in a moment.");
    }
    router.back();
  }

  function onShare() {
    Share.share({
      message: `Join me for ${className} with ${session!.trainer.name} at ${new Date(
        session!.startsAt,
      ).toLocaleString()} — P4Studio`,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <CheckoutModal url={checkoutUrl} onClose={onCheckoutClose} />
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onShare} hitSlop={10}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.trainerRow}>
          {session.trainer.photoUrl ? (
            <Image source={{ uri: session.trainer.photoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{session.trainer.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.trainerName}>{session.trainer.name}</Text>
            {!!session.trainer.specialty && (
              <Text style={styles.trainerSpecialty}>{session.trainer.specialty}</Text>
            )}
          </View>
        </View>

        <Text style={styles.className}>{className}</Text>

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            <Text style={styles.metaText}>
              {new Date(session.startsAt).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
            <Text style={styles.metaText}>
              {new Date(session.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} ·{" "}
              {session.durationMins} min
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />
            <Text style={styles.metaText}>{formatGHS(session.priceGHS)}</Text>
          </View>
          {session.location && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={18} color={colors.textMuted} />
              <Text style={styles.metaText}>
                {session.location.name}
                {session.location.address ? ` · ${session.location.address}` : ""}
              </Text>
            </View>
          )}
        </View>

        {!!(session.classType?.description || session.trainer.bio) && (
          <View style={styles.descCard}>
            {!!session.classType?.description && (
              <Text style={styles.descText}>{session.classType.description}</Text>
            )}
            {!!session.trainer.bio && (
              <Text style={[styles.descText, styles.bioText]}>{session.trainer.bio}</Text>
            )}
          </View>
        )}

        <View style={styles.capacitySection}>
          <CapacityRing taken={session.taken} capacity={session.capacity} size={72} strokeWidth={6} />
          <Text style={styles.capacityLabel}>
            {full ? "Class is full" : `${session.capacity - session.taken} spot${session.capacity - session.taken === 1 ? "" : "s"} left`}
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {closed && (
          <View style={styles.closedNotice}>
            <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
            <Text style={styles.closedNoticeText}>
              Booking closes {cutoffMinutes} minutes before the session
            </Text>
          </View>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            disabled && styles.buttonDisabled,
            pressed && !disabled && styles.buttonPressed,
          ]}
          disabled={disabled || booking}
          onPress={onBook}
        >
          {booking ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={[styles.buttonText, disabled && styles.buttonTextDisabled]}>
              {booked
                ? "You're booked"
                : waitlisted
                  ? "On waitlist"
                  : closed
                    ? "Booking closed"
                    : full
                      ? "Join waitlist"
                      : "Book this class"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  content: { padding: 20, paddingBottom: 32 },
  trainerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: colors.card },
  avatarInitial: { color: colors.white, fontSize: 22, fontWeight: "700" },
  trainerName: { fontSize: 16, fontWeight: "700", color: colors.text },
  trainerSpecialty: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  className: { fontSize: 26, fontWeight: "700", color: colors.text, marginBottom: 16 },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaText: { fontSize: 14, color: colors.text },
  descCard: { marginBottom: 16, gap: 10 },
  descText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  bioText: { fontStyle: "italic" },
  capacitySection: { alignItems: "center", gap: 8, marginTop: 4 },
  capacityLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  closedNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 12,
  },
  closedNoticeText: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow.card,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonDisabled: { backgroundColor: colors.greenTint },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  buttonTextDisabled: { color: colors.greenDark },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 40 },
});
