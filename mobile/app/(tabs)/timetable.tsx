import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import { colors, radius, shadow } from "@/lib/theme";
import { CapacityRing } from "@/components/CapacityRing";

export interface SessionItem {
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
}

interface SessionsResponse {
  advanceBookingDays: number;
  bookingCutoffMinutes: number;
  sessions: SessionItem[];
}

interface DayOption {
  key: string;
  weekday: string;
  dayNum: string;
  isToday: boolean;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function TimetableScreen() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [cutoffMinutes, setCutoffMinutes] = useState(45);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => new Date(), []);
  const [selectedDay, setSelectedDay] = useState(() => dayKey(today.toISOString()));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<SessionsResponse>("/api/app/sessions");
      setSessions(res.sessions);
      setCutoffMinutes(res.bookingCutoffMinutes);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const days = useMemo<DayOption[]>(() => {
    const keys = new Set(sessions.map((s) => dayKey(s.startsAt)));
    keys.add(dayKey(today.toISOString()));
    return [...keys]
      .sort()
      .map((key) => {
        const d = new Date(`${key}T00:00:00`);
        return {
          key,
          weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
          dayNum: d.toLocaleDateString(undefined, { day: "numeric" }),
          isToday: key === dayKey(today.toISOString()),
        };
      });
  }, [sessions, today]);

  const daySessions = useMemo(
    () =>
      sessions
        .filter((s) => dayKey(s.startsAt) === selectedDay)
        .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [sessions, selectedDay],
  );

  function openSession(item: SessionItem) {
    router.push({
      pathname: "/session/[id]",
      params: { id: item.id, data: JSON.stringify({ ...item, cutoffMinutes }) },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Classes</Text>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={days}
        keyExtractor={(d) => d.key}
        style={styles.dayStrip}
        contentContainerStyle={styles.dayStripContent}
        renderItem={({ item }) => {
          const active = item.key === selectedDay;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.dayPill,
                active && styles.dayPillActive,
                pressed && !active && styles.dayPillPressed,
              ]}
              onPress={() => setSelectedDay(item.key)}
            >
              <Text style={[styles.dayWeekday, active && styles.dayTextActive]}>{item.weekday}</Text>
              <Text style={[styles.dayNum, active && styles.dayTextActive]}>{item.dayNum}</Text>
              {item.isToday && <View style={[styles.todayDot, active && styles.todayDotActive]} />}
            </Pressable>
          );
        }}
      />

      <FlatList
        style={styles.container}
        data={daySessions}
        keyExtractor={(s) => s.id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />
        }
        contentContainerStyle={{ padding: 20, paddingTop: 12 }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
              <Text style={styles.empty}>No classes this day.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const booked = item.myStatus === "BOOKED" || item.myStatus === "ATTENDED";
          const waitlisted = item.myStatus === "WAITLIST";
          const mine = booked || waitlisted;
          const closed = !mine && +new Date(item.startsAt) - Date.now() < cutoffMinutes * 60_000;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                mine && styles.rowMine,
                closed && styles.rowClosed,
                shadow.card,
                pressed && styles.rowPressed,
              ]}
              onPress={() => openSession(item)}
            >
              <View style={styles.timeCol}>
                <Text style={styles.time}>{timeLabel(item.startsAt)}</Text>
                <Text style={styles.duration}>{item.durationMins}m</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.infoCol}>
                <Text style={styles.className}>{item.classType?.name ?? "PT session"}</Text>
                <View style={styles.trainerRow}>
                  <Ionicons name="person-circle-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.trainerName}>{item.trainer.name}</Text>
                </View>
                {item.location && (
                  <View style={styles.trainerRow}>
                    <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                    <Text style={styles.trainerName}>{item.location.name}</Text>
                  </View>
                )}
                {mine && (
                  <View style={styles.myStatusBadge}>
                    <Ionicons
                      name={booked ? "checkmark-circle" : "time"}
                      size={12}
                      color={colors.greenDark}
                    />
                    <Text style={styles.myStatusText}>{booked ? "You're in" : "Waitlisted"}</Text>
                  </View>
                )}
                {closed && (
                  <View style={styles.myStatusBadge}>
                    <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
                    <Text style={styles.closedText}>Booking closed</Text>
                  </View>
                )}
              </View>
              <CapacityRing taken={item.taken} capacity={item.capacity} />
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 4 }} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerRow: { paddingHorizontal: 20, paddingTop: 8 },
  header: { fontSize: 26, fontWeight: "700", color: colors.text },
  dayStrip: { flexGrow: 0, marginTop: 12 },
  dayStripContent: { paddingHorizontal: 20, gap: 8 },
  dayPill: {
    width: 52,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    alignItems: "center",
    gap: 2,
  },
  dayPillActive: { backgroundColor: colors.green },
  dayPillPressed: { backgroundColor: colors.border },
  dayWeekday: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  dayNum: { fontSize: 16, color: colors.text, fontWeight: "700" },
  dayTextActive: { color: colors.white },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green, marginTop: 2 },
  todayDotActive: { backgroundColor: colors.white },
  container: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  rowMine: { backgroundColor: colors.greenTint },
  rowClosed: { opacity: 0.6 },
  rowPressed: { opacity: 0.85 },
  timeCol: { width: 62, alignItems: "flex-start" },
  time: { fontSize: 14, fontWeight: "700", color: colors.text },
  duration: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  divider: { width: 1, alignSelf: "stretch", backgroundColor: colors.border },
  infoCol: { flex: 1, gap: 3 },
  className: { fontSize: 15, fontWeight: "600", color: colors.text },
  trainerRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  trainerName: { fontSize: 13, color: colors.textMuted },
  myStatusBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  myStatusText: { fontSize: 11, fontWeight: "700", color: colors.greenDark },
  closedText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
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
