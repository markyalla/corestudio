import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { api, ApiError, bookSessionWithCash, getPtOfferings, mediaUrl, type PtOffering } from "@/lib/api";
import { formatGHS } from "@/lib/money";
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
  trainer: { id: string; name: string; specialty: string; bio: string; photoUrl: string | null; calendarColor: string };
  location: { id: string; name: string; address: string } | null;
  myStatus: string | null;
  myPaymentPending: boolean;
}

export interface SessionsResponse {
  advanceBookingDays: number;
  bookingCutoffMinutes: number;
  sessions: SessionItem[];
}

type CalView = "day" | "week" | "month";

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
/** Start time + duration is what the server actually stores — this is just
 *  start + duration shown as a clock time, so members can see at a glance
 *  when the trainer/room frees up instead of doing the math themselves. */
function endTimeLabel(startsAtIso: string, durationMins: number): string {
  return new Date(new Date(startsAtIso).getTime() + durationMins * 60_000).toLocaleTimeString(
    undefined,
    { hour: "numeric", minute: "2-digit" },
  );
}
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromKey(k: string): Date {
  return new Date(`${k}T00:00:00`);
}
/** Monday of the week containing `d`. */
function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7));
  return out;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export default function TimetableScreen() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [ptOfferings, setPtOfferings] = useState<PtOffering[]>([]);
  const [cutoffMinutes, setCutoffMinutes] = useState(45);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalView>("month");
  const today = useMemo(() => new Date(), []);
  const [selectedDay, setSelectedDay] = useState(() => keyOf(today));
  const [bookingCashId, setBookingCashId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, pt] = await Promise.all([
        api<SessionsResponse>("/api/app/sessions"),
        getPtOfferings().catch(() => ({ offerings: [] as PtOffering[] })),
      ]);
      setSessions(res.sessions);
      setCutoffMinutes(res.bookingCutoffMinutes);
      setPtOfferings(pt.offerings);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const byDay = useMemo(() => {
    const m = new Map<string, SessionItem[]>();
    for (const s of sessions) {
      const k = dayKey(s.startsAt);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    for (const list of m.values()) list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return m;
  }, [sessions]);

  const anchor = fromKey(selectedDay);

  function openSession(item: SessionItem) {
    router.push({
      pathname: "/session/[id]",
      params: { id: item.id, data: JSON.stringify({ ...item, cutoffMinutes }) },
    });
  }

  function onPayWithCash(sessionId: string) {
    Alert.alert(
      "Pay with cash",
      "You'll pay at the studio and staff will confirm it there. Confirm booking with cash?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setBookingCashId(sessionId);
            try {
              await bookSessionWithCash(sessionId);
              Alert.alert("Saved", "Show up at the studio and pay in person — staff will confirm it and your booking will activate.");
              await load();
            } catch (e) {
              Alert.alert("Couldn't save this", e instanceof ApiError ? e.message : (e as Error).message ?? "Try again");
            } finally {
              setBookingCashId(null);
            }
          },
        },
      ],
    );
  }

  function SessionRow({ item }: { item: SessionItem }) {
    const booked = item.myStatus === "BOOKED" || item.myStatus === "ATTENDED";
    const waitlisted = item.myStatus === "WAITLIST";
    const mine = booked || waitlisted;
    const closed = !mine && +new Date(item.startsAt) - Date.now() < cutoffMinutes * 60_000;
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { borderLeftColor: item.trainer.calendarColor },
          mine && styles.rowMine,
          closed && styles.rowClosed,
          shadow.card,
          pressed && styles.rowPressed,
        ]}
        onPress={() => openSession(item)}
      >
        <View style={styles.timeCol}>
          <Text style={styles.time}>{timeLabel(item.startsAt)}</Text>
          <Text style={styles.duration}>–{endTimeLabel(item.startsAt, item.durationMins)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoCol}>
          <Text style={styles.className}>{item.classType?.name ?? "Private class session"}</Text>
          <View style={styles.trainerRow}>
            {item.trainer.photoUrl ? (
              <Image source={{ uri: mediaUrl(item.trainer.photoUrl) }} style={styles.trainerAvatar} />
            ) : (
              <View style={[styles.trainerDot, { backgroundColor: item.trainer.calendarColor }]} />
            )}
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
                name={booked && !item.myPaymentPending ? "checkmark-circle" : "time"}
                size={12}
                color={item.myPaymentPending ? "#B8620A" : colors.greenDark}
              />
              <Text style={[styles.myStatusText, item.myPaymentPending && { color: "#B8620A" }]}>
                {item.myPaymentPending ? "Payment pending" : booked ? "You're in" : "Waitlisted"}
              </Text>
            </View>
          )}
          {closed && (
            <View style={styles.myStatusBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
              <Text style={styles.closedText}>Booking closed</Text>
            </View>
          )}
          {!mine && !closed && (
            <Pressable
              style={({ pressed }) => [styles.cashRowButton, pressed && styles.cashRowButtonPressed]}
              onPress={() => onPayWithCash(item.id)}
              disabled={bookingCashId === item.id}
            >
              {bookingCashId === item.id ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Text style={styles.cashRowText}>Pay with cash at the studio</Text>
              )}
            </Pressable>
          )}
        </View>
        <CapacityRing taken={item.taken} capacity={item.capacity} />
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: 4 }} />
      </Pressable>
    );
  }

  function DayList({ dateKey }: { dateKey: string }) {
    const list = byDay.get(dateKey) ?? [];
    if (list.length === 0) {
      return (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={26} color={colors.textMuted} />
          <Text style={styles.empty}>No classes this day.</Text>
        </View>
      );
    }
    return (
      <View style={{ gap: 10 }}>
        {list.map((s) => (
          <SessionRow key={s.id} item={s} />
        ))}
      </View>
    );
  }

  // ── Month grid ──────────────────────────────────────────────────────────
  function MonthGrid() {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const first = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // Mon-based leading blanks
    const cells: (Date | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

    return (
      <View>
        <View style={styles.navRow}>
          <Pressable style={styles.navBtn} onPress={() => setSelectedDay(keyOf(new Date(y, m - 1, 1)))} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.navLabel}>
            {first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <Pressable style={styles.navBtn} onPress={() => setSelectedDay(keyOf(new Date(y, m + 1, 1)))} hitSlop={8}>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.weekHeader}>
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
            <Text key={i} style={styles.weekdayLabel}>{w}</Text>
          ))}
        </View>
        {rows.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((d, di) => {
              if (!d) return <View key={`e${wi}-${di}`} style={styles.mCell} />;
              const k = keyOf(d);
              const count = (byDay.get(k) ?? []).length;
              const isToday = k === keyOf(today);
              return (
                <Pressable
                  key={k}
                  style={styles.mCell}
                  onPress={() => {
                    setSelectedDay(k);
                    setView("day");
                  }}
                >
                  <View style={[styles.mDayInner, isToday && styles.mDayToday, count > 0 && !isToday && styles.mDayHas]}>
                    <Text style={[styles.mDayNum, isToday && styles.mDayNumToday]}>{d.getDate()}</Text>
                  </View>
                  {count > 0 && (
                    <View style={styles.mCountPill}>
                      <Text style={styles.mCountText}>{count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text style={styles.monthHint}>Tap a day to see its classes</Text>
      </View>
    );
  }

  // ── Week agenda ─────────────────────────────────────────────────────────
  function WeekAgenda() {
    const mon = mondayOf(anchor);
    const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    const end = addDays(mon, 6);
    return (
      <View>
        <View style={styles.navRow}>
          <Pressable style={styles.navBtn} onPress={() => setSelectedDay(keyOf(addDays(mon, -7)))} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.navLabel}>
            {mon.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {end.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </Text>
          <Pressable style={styles.navBtn} onPress={() => setSelectedDay(keyOf(addDays(mon, 7)))} hitSlop={8}>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
        {week.map((d) => {
          const k = keyOf(d);
          const list = byDay.get(k) ?? [];
          return (
            <View key={k} style={{ marginBottom: 16 }}>
              <Text style={[styles.agendaDay, k === keyOf(today) && styles.agendaDayToday]}>
                {d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
              </Text>
              {list.length === 0 ? (
                <Text style={styles.agendaEmpty}>—</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {list.map((s) => (
                    <SessionRow key={s.id} item={s} />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  // ── Day view (with a week day-strip) ────────────────────────────────────
  function DayView() {
    const mon = mondayOf(anchor);
    const strip = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
    return (
      <View>
        <View style={styles.stripRow}>
          <Pressable onPress={() => setSelectedDay(keyOf(addDays(anchor, -1)))} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
          </Pressable>
          {strip.map((d) => {
            const k = keyOf(d);
            const active = k === selectedDay;
            const has = (byDay.get(k) ?? []).length > 0;
            return (
              <Pressable key={k} style={[styles.dayPill, active && styles.dayPillActive]} onPress={() => setSelectedDay(k)}>
                <Text style={[styles.dayWeekday, active && styles.dayTextActive]}>
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </Text>
                <Text style={[styles.dayNum, active && styles.dayTextActive]}>{d.getDate()}</Text>
                {has && <View style={[styles.todayDot, active && styles.todayDotActive]} />}
              </Pressable>
            );
          })}
          <Pressable onPress={() => setSelectedDay(keyOf(addDays(anchor, 1)))} hitSlop={8}>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.navLabel}>
          {anchor.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        </Text>
        <View style={{ marginTop: 12 }}>
          <DayList dateKey={selectedDay} />
        </View>

        {ptOfferings.length > 0 && (
          <View style={styles.ptSection}>
            <Text style={styles.ptHeader}>Book private class</Text>
            <Text style={styles.ptSub}>One-on-one with a trainer — pick a day and your own time.</Text>
            {ptOfferings.map((o) => (
              <Pressable
                key={o.trainerId}
                style={({ pressed }) => [
                  styles.ptCard,
                  { borderLeftWidth: 4, borderLeftColor: o.calendarColor },
                  shadow.card,
                  pressed && styles.rowPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/private/[trainerId]",
                    params: { trainerId: o.trainerId, data: JSON.stringify(o) },
                  })
                }
              >
                {o.photoUrl ? (
                  <Image source={{ uri: mediaUrl(o.photoUrl) }} style={styles.ptIconWrap} />
                ) : (
                  <View style={[styles.ptIconWrap, { backgroundColor: o.calendarColor + "22" }]}>
                    <Ionicons name="person" size={18} color={o.calendarColor} />
                  </View>
                )}
                <View style={styles.infoCol}>
                  <Text style={styles.className}>{o.title || o.specialty || "Private class"}</Text>
                  <View style={styles.trainerRow}>
                    <View style={[styles.trainerDot, { backgroundColor: o.calendarColor }]} />
                    <Text style={styles.trainerName}>{o.trainerName}</Text>
                  </View>
                  <Text style={styles.ptMeta}>
                    {o.durationMins} min · from {formatGHS(o.priceGHS)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Classes</Text>
        <View style={styles.segment}>
          {(["day", "week", "month"] as CalView[]).map((v) => (
            <Pressable
              key={v}
              style={[styles.segmentBtn, v === view && styles.segmentBtnActive]}
              onPress={() => setView(v)}
            >
              <Text style={[styles.segmentText, v === view && styles.segmentTextActive]}>
                {v[0].toUpperCase() + v.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 20, paddingTop: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />}
      >
        {view === "month" && <MonthGrid />}
        {view === "week" && <WeekAgenda />}
        {view === "day" && <DayView />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerRow: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  header: { fontSize: 26, fontWeight: "700", color: colors.text },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: "center" },
  segmentBtnActive: { backgroundColor: colors.green },
  segmentText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  segmentTextActive: { color: colors.white },
  container: { flex: 1 },

  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  navLabel: { fontSize: 15, fontWeight: "700", color: colors.text },

  weekHeader: { flexDirection: "row", marginBottom: 4 },
  weekdayLabel: { flex: 1, textAlign: "center", color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  weekRow: { flexDirection: "row" },
  mCell: { flex: 1, aspectRatio: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  mDayInner: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  mDayHas: { backgroundColor: colors.greenTint },
  mDayToday: { backgroundColor: colors.green },
  mDayNum: { fontSize: 14, color: colors.text, fontWeight: "600" },
  mDayNumToday: { color: colors.white },
  mCountPill: {
    marginTop: 2,
    minWidth: 16,
    height: 15,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.greenDark,
    alignItems: "center",
    justifyContent: "center",
  },
  mCountText: { fontSize: 10, fontWeight: "700", color: colors.white },
  monthHint: { fontSize: 12, color: colors.textMuted, textAlign: "center", marginTop: 12 },

  agendaDay: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase", marginBottom: 8 },
  agendaDayToday: { color: colors.greenDark },
  agendaEmpty: { fontSize: 13, color: colors.border, marginLeft: 2 },

  stripRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 10 },
  dayPill: { flex: 1, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.card, alignItems: "center", gap: 1 },
  dayPillActive: { backgroundColor: colors.green },
  dayWeekday: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  dayNum: { fontSize: 15, color: colors.text, fontWeight: "700" },
  dayTextActive: { color: colors.white },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.green, marginTop: 1 },
  todayDotActive: { backgroundColor: colors.white },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    padding: 14,
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
  trainerDot: { width: 8, height: 8, borderRadius: 4 },
  trainerAvatar: { width: 16, height: 16, borderRadius: 8 },
  trainerRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  trainerName: { fontSize: 13, color: colors.textMuted, flex: 1, flexWrap: "wrap" },
  myStatusBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  myStatusText: { fontSize: 11, fontWeight: "700", color: colors.greenDark },
  closedText: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    gap: 10,
  },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  cashRowButton: { marginTop: 8 },
  cashRowButtonPressed: { opacity: 0.6 },
  cashRowText: { color: colors.textMuted, fontSize: 13 },
  ptSection: { marginTop: 24, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18 },
  ptHeader: { fontSize: 16, fontWeight: "700", color: colors.text },
  ptSub: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 12 },
  ptCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  ptIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.greenTint,
    alignItems: "center",
    justifyContent: "center",
  },
  ptMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
