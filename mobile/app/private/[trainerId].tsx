import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ApiError, bookPrivateClass, getPtOfferings, mediaUrl, verifyPayment, type PtOffering } from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";
import { CheckoutModal } from "@/components/CheckoutModal";

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const fromMin = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function PrivateClassScreen() {
  const { trainerId, data } = useLocalSearchParams<{ trainerId: string; data: string }>();
  const paramOffering = useMemo<PtOffering | null>(() => {
    try {
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }, [data]);

  const [offering, setOffering] = useState<PtOffering | null>(paramOffering);
  const [dateIdx, setDateIdx] = useState(0);
  const [rangeIdx, setRangeIdx] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const id = trainerId ?? paramOffering?.trainerId ?? "";

  /** Pull the trainer's current open times — the list we arrived with can be
   *  minutes stale, and slots get taken by other members. */
  const refreshOffering = useCallback(async () => {
    try {
      const res = await getPtOfferings();
      const fresh = res.offerings.find((o) => o.trainerId === id);
      setOffering(fresh ?? (paramOffering ? { ...paramOffering, days: [] } : null));
    } catch {
      // keep whatever we have
    }
    setDateIdx(0);
    setRangeIdx(0);
    setStart(null);
  }, [id, paramOffering]);

  useEffect(() => {
    refreshOffering();
  }, [refreshOffering]);

  if (!offering || offering.days.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.empty}>No availability for this trainer right now.</Text>
      </SafeAreaView>
    );
  }

  const day = offering.days[Math.min(dateIdx, offering.days.length - 1)];
  const range = day.ranges[Math.min(rangeIdx, day.ranges.length - 1)];
  const minStart = toMin(range.start);
  const maxStart = toMin(range.end) - range.durationMins;
  const startMin = start == null ? minStart : Math.min(Math.max(start, minStart), maxStart);
  const step = offering.stepMins || 15;

  function selectDay(i: number) {
    setDateIdx(i);
    setRangeIdx(0);
    setStart(null);
  }

  async function onBook(method?: "cash") {
    setBooking(true);
    try {
      const res = await bookPrivateClass({
        trainerId: offering!.trainerId,
        date: day.date,
        startTime: fromMin(startMin),
        method,
      });
      if (res.authorizationUrl) {
        setCheckoutUrl(res.authorizationUrl);
      } else if (res.cash) {
        Alert.alert("Booked", "Pay at the studio — staff will confirm it and your session is set.");
        router.back();
      } else {
        Alert.alert("You're booked!", "See you in your session.");
        router.back();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        await refreshOffering();
        Alert.alert("That time was just taken", "We've refreshed the open times — pick another slot.");
      } else {
        Alert.alert("Couldn't book", e instanceof ApiError ? e.message : "Try again");
      }
    } finally {
      setBooking(false);
    }
  }

  function confirmCash() {
    Alert.alert(
      "Pay with cash",
      `You'll pay ${formatGHS(range.priceGHS)} at the studio. Staff confirm it there and your session is set.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => onBook("cash") },
      ],
    );
  }

  async function onCheckoutClose(reference: string | null) {
    setCheckoutUrl(null);
    if (!reference) return;
    try {
      const { status } = await verifyPayment(reference);
      Alert.alert(
        status === "success" ? "You're booked!" : "Payment not completed",
        status === "success"
          ? "Payment received — see you in your session."
          : `Status: ${status}. If you paid, check My Bookings shortly.`,
      );
    } catch {
      Alert.alert("Couldn't confirm payment", "If you completed checkout, check My Bookings shortly.");
    }
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <CheckoutModal url={checkoutUrl} onClose={onCheckoutClose} />
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.trainerRow}>
          {offering.photoUrl ? (
            <Image source={{ uri: mediaUrl(offering.photoUrl) }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: offering.calendarColor }]}>
              <Text style={styles.avatarInitial}>{offering.trainerName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.trainerNameRow}>
              <View style={[styles.trainerDot, { backgroundColor: offering.calendarColor }]} />
              <Text style={styles.trainerName}>{offering.trainerName}</Text>
            </View>
            {!!offering.specialty && <Text style={styles.trainerSpecialty}>{offering.specialty}</Text>}
          </View>
        </View>

        <Text style={styles.className}>{offering.title || "Private class"}</Text>

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={18} color={colors.textMuted} />
            <Text style={styles.metaText}>{range.durationMins} min, one-on-one</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="pricetag-outline" size={18} color={colors.textMuted} />
            <Text style={styles.metaText}>{formatGHS(range.priceGHS)} · 1 class credit if you have one</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={18} color={colors.textMuted} />
            <Text style={styles.metaText}>{range.locationName}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Pick a day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
          {offering.days.map((d, i) => {
            const active = i === dateIdx;
            return (
              <Pressable
                key={d.date}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => selectDay(i)}
              >
                <Text style={[styles.dayPillText, active && styles.dayPillTextActive]}>{dayLabel(d.date)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {day.ranges.length > 1 && (
          <>
            <Text style={styles.sectionTitle}>Time window</Text>
            <View style={styles.rangeRow}>
              {day.ranges.map((r, i) => {
                const active = i === rangeIdx;
                return (
                  <Pressable
                    key={`${r.start}-${r.locationId}`}
                    style={[styles.rangeChip, active && styles.rangeChipActive]}
                    onPress={() => {
                      setRangeIdx(i);
                      setStart(null);
                    }}
                  >
                    <Text style={[styles.rangeChipText, active && styles.dayPillTextActive]}>
                      {r.start}–{r.end}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Start time</Text>
        <View style={styles.stepperCard}>
          <Pressable
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            onPress={() => setStart(Math.max(minStart, startMin - step))}
            disabled={startMin <= minStart}
          >
            <Ionicons name="remove" size={22} color={startMin <= minStart ? colors.textMuted : colors.green} />
          </Pressable>
          <View style={styles.stepValueWrap}>
            <Text style={styles.stepValue}>{fromMin(startMin)}</Text>
            <Text style={styles.stepSub}>ends {fromMin(startMin + range.durationMins)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
            onPress={() => setStart(Math.min(maxStart, startMin + step))}
            disabled={startMin >= maxStart}
          >
            <Ionicons name="add" size={22} color={startMin >= maxStart ? colors.textMuted : colors.green} />
          </Pressable>
        </View>
        <Text style={styles.windowHint}>
          Available {range.start}–{range.end} on {dayLabel(day.date)}
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          disabled={booking}
          onPress={() => onBook()}
        >
          {booking ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Book private class</Text>
          )}
        </Pressable>
        <Pressable style={styles.cashButton} disabled={booking} onPress={confirmCash}>
          <Text style={styles.cashButtonText}>Pay with cash at the studio</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4 },
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
  trainerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  trainerDot: { width: 8, height: 8, borderRadius: 4 },
  trainerName: { fontSize: 16, fontWeight: "700", color: colors.text },
  trainerSpecialty: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  className: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: 16 },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 12,
    marginBottom: 8,
  },
  metaRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  metaText: { fontSize: 14, color: colors.text, flex: 1, flexWrap: "wrap" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  dayStrip: { gap: 8, paddingBottom: 4 },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  dayPillActive: { backgroundColor: colors.green },
  dayPillText: { fontSize: 13, fontWeight: "600", color: colors.text },
  dayPillTextActive: { color: colors.white },
  rangeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rangeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  rangeChipActive: { backgroundColor: colors.green },
  rangeChipText: { fontSize: 13, fontWeight: "600", color: colors.text },
  stepperCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.greenTint,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnPressed: { opacity: 0.6 },
  stepValueWrap: { alignItems: "center" },
  stepValue: { fontSize: 24, fontWeight: "700", color: colors.text },
  stepSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  windowHint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  footer: { padding: 20, borderTopWidth: 1, borderTopColor: colors.border },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.md,
    paddingVertical: 15,
    alignItems: "center",
    ...shadow.card,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  cashButton: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  cashButtonText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 40 },
});
