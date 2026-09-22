import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet, Pressable, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import {
  api,
  getAnnouncements,
  getContact,
  getMotivation,
  getPackages,
  getProgress,
  type Announcement,
  type ContactInfo,
  type MyPackage,
  type ProgressResponse,
} from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";
import { DetailModal } from "@/components/DetailModal";
import type { SessionItem, SessionsResponse } from "./timetable";

interface ProfileResponse {
  member: { creditsLeft: number; walletGHS: number; cycleRenewsAt: string | null };
  user: { name: string };
  plan: {
    name: string;
    priceGHS: number;
    classesPerCycle: number;
    bonusCredits: number;
    cycleDays: number;
    description: string;
    perks: string[];
  } | null;
}

interface BookingsResponse {
  bookingCutoffMinutes: number;
  bookings: {
    id: string;
    status: string;
    session: {
      id: string;
      startsAt: string;
      durationMins: number;
      capacity: number;
      taken: number;
      priceGHS: number;
      classType: { id: string; name: string; description: string } | null;
      trainer: { id: string; name: string; specialty: string; bio: string; photoUrl: string | null; calendarColor: string };
      location: { id: string; name: string; address: string } | null;
    };
  }[];
}

export default function HomeScreen() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [nextBooking, setNextBooking] = useState<BookingsResponse["bookings"][number] | null>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [motivation, setMotivation] = useState<string | null>(null);
  const [upcomingClasses, setUpcomingClasses] = useState<SessionItem[]>([]);
  const [classCutoff, setClassCutoff] = useState(45);
  const [myPackages, setMyPackages] = useState<MyPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ kind: "plan" } | { kind: "package"; pkg: MyPackage } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, bookingsRes, contactRes, announcementsRes, progressRes, motivationRes, sessionsRes, packagesRes] =
        await Promise.all([
          api<ProfileResponse>("/api/app/profile"),
          api<BookingsResponse>("/api/app/bookings"),
          getContact().catch(() => null),
          getAnnouncements().catch(() => ({ announcements: [] })),
          getProgress().catch(() => null),
          getMotivation().catch(() => ({ text: null })),
          api<SessionsResponse>("/api/app/sessions").catch(
            () => ({ sessions: [], bookingCutoffMinutes: 45, advanceBookingDays: 30 }) as SessionsResponse,
          ),
          getPackages().catch(() => ({ packages: [], myPackages: [] })),
        ]);
      setProfile(profileRes);
      setMyPackages(packagesRes.myPackages);
      setContact(contactRes);
      setAnnouncements(announcementsRes.announcements);
      setProgress(progressRes);
      setMotivation(motivationRes.text);
      setClassCutoff(sessionsRes.bookingCutoffMinutes);
      const nowMs = Date.now();
      setUpcomingClasses(
        sessionsRes.sessions
          .filter((s) => new Date(s.startsAt).getTime() > nowMs)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 6),
      );
      const now = new Date();
      const upcoming = bookingsRes.bookings
        .filter((b) => b.status === "BOOKED" && new Date(b.session.startsAt) > now)
        .sort((a, b) => +new Date(a.session.startsAt) - +new Date(b.session.startsAt));
      setNextBooking(upcoming[0] ?? null);
      setTotalVisits(bookingsRes.bookings.filter((b) => b.status === "ATTENDED").length);
      setMonthCount(
        bookingsRes.bookings.filter((b) => {
          const d = new Date(b.session.startsAt);
          return (
            (b.status === "BOOKED" || b.status === "ATTENDED") &&
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          );
        }).length,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>
              {profile ? `Hi ${profile.user.name.split(" ")[0]}` : " "}
            </Text>
            <Text style={styles.greeting}>Welcome to P4Studio</Text>
          </View>
          <View style={styles.avatar}>
            <Image source={require("../../assets/p4.png")} style={styles.avatarImage} contentFit="contain" />
          </View>
        </View>

        {!!motivation && (
          <View style={styles.motivationCard}>
            <Ionicons name="sparkles-outline" size={16} color={colors.greenDark} />
            <Text style={styles.motivationText}>{motivation}</Text>
          </View>
        )}

        {profile && (
          <Pressable
            style={({ pressed }) => [styles.planCard, shadow.card, pressed && profile.plan && { opacity: 0.9 }]}
            onPress={() => profile.plan && setDetail({ kind: "plan" })}
          >
            <View style={styles.planCardRow}>
              <Text style={styles.planName}>{profile.plan?.name ?? "No plan"}</Text>
              <Ionicons name={profile.plan ? "chevron-forward" : "checkmark-circle"} size={20} color={colors.white} />
            </View>
            <Text style={styles.planCredits}>{profile.member.creditsLeft} classes left</Text>
            {profile.member.walletGHS > 0 && (
              <Text style={styles.planWallet}>Wallet · {formatGHS(profile.member.walletGHS)}</Text>
            )}
          </Pressable>
        )}

        {myPackages.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Your packages</Text>
            {myPackages.map((pkg) => (
              <Pressable
                key={pkg.id}
                style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.85 }]}
                onPress={() => setDetail({ kind: "package", pkg })}
              >
                <View style={styles.cardIconWrap}>
                  <Ionicons name="pricetag" size={18} color={colors.green} />
                </View>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardLabel} numberOfLines={1}>{pkg.name}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {pkg.sessionsLeft} sessions left · expires {new Date(pkg.expiresAt).toLocaleDateString()}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))}
          </>
        )}

        {profile?.plan && (
          <DetailModal
            visible={detail?.kind === "plan"}
            onClose={() => setDetail(null)}
            title={profile.plan.name}
            price={`${formatGHS(profile.plan.priceGHS)} / ${profile.plan.cycleDays}d`}
            metaLines={[
              `${profile.plan.classesPerCycle} classes${profile.plan.bonusCredits > 0 ? ` + ${profile.plan.bonusCredits} bonus` : ""} per cycle`,
              `${profile.member.creditsLeft} classes left right now`,
            ]}
            description={profile.plan.description}
            perks={profile.plan.perks}
          />
        )}
        {detail?.kind === "package" && (
          <DetailModal
            visible
            onClose={() => setDetail(null)}
            title={detail.pkg.name}
            metaLines={[
              `${detail.pkg.classTypeName}`,
              `${detail.pkg.sessionsLeft} sessions left · expires ${new Date(detail.pkg.expiresAt).toLocaleDateString()}`,
            ]}
            description={detail.pkg.classTypeDescription}
            perks={detail.pkg.perks}
          />
        )}

        {progress && (
          <>
            <Text style={styles.sectionTitle}>Your progress</Text>
            {(() => {
              const warm = progress.tier === "SLIPPING" || progress.tier === "INACTIVE";
              const accent = warm ? colors.warning : colors.green;
              return (
                <View style={[styles.progressCard, shadow.card, { borderLeftColor: accent }]}>
                  <Text style={styles.progressHeadline}>{progress.headline}</Text>
                  <Text style={styles.progressMessage}>{progress.message}</Text>
                  <View style={styles.progressMetrics}>
                    <View style={styles.progressMetric}>
                      <Text style={[styles.progressMetricValue, { color: accent }]}>
                        {progress.stats.attendedTotal}
                      </Text>
                      <Text style={styles.progressMetricLabel}>Attended</Text>
                    </View>
                    <View style={styles.progressMetric}>
                      <Text style={[styles.progressMetricValue, { color: accent }]}>
                        {progress.stats.attendedThisMonth}
                      </Text>
                      <Text style={styles.progressMetricLabel}>This month</Text>
                    </View>
                    <View style={styles.progressMetric}>
                      <Text style={[styles.progressMetricValue, { color: accent }]}>
                        {progress.stats.streakWeeks}w
                      </Text>
                      <Text style={styles.progressMetricLabel}>Streak</Text>
                    </View>
                    <View style={styles.progressMetric}>
                      <Text style={[styles.progressMetricValue, { color: accent }]}>
                        {progress.stats.attendanceRate === null
                          ? "—"
                          : `${Math.round(progress.stats.attendanceRate * 100)}%`}
                      </Text>
                      <Text style={styles.progressMetricLabel}>Show-up</Text>
                    </View>
                  </View>
                  {progress.tips.slice(0, 2).map((tip) => (
                    <View key={tip} style={styles.progressTipRow}>
                      <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
                      <Text style={styles.progressTip}>{tip}</Text>
                    </View>
                  ))}
                </View>
              );
            })()}
          </>
        )}

        {upcomingClasses.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              {upcomingClasses[0].location ? `Classes at ${upcomingClasses[0].location.name}` : "Upcoming classes"}
            </Text>
            <View style={styles.quickList}>
              {upcomingClasses.map((s) => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.quickRow,
                    { borderLeftWidth: 4, borderLeftColor: s.trainer.calendarColor },
                    shadow.card,
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: "/session/[id]",
                      params: { id: s.id, data: JSON.stringify({ ...s, cutoffMinutes: classCutoff }) },
                    })
                  }
                >
                  <View style={[styles.quickIconWrap, { backgroundColor: s.trainer.calendarColor + "22" }]}>
                    <Ionicons name="fitness-outline" size={16} color={s.trainer.calendarColor} />
                  </View>
                  <View style={styles.quickTextWrap}>
                    <Text style={styles.quickTitle} numberOfLines={1}>
                      {s.classType?.name ?? "Private class session"}
                    </Text>
                    <Text style={styles.quickSub} numberOfLines={1}>
                      {new Date(s.startsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                      {" · "}
                      {new Date(s.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      {" · "}
                      {s.trainer.name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        {announcements.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>What&apos;s on</Text>
            <View style={styles.announceList}>
              {announcements.map((a) => {
                const promo = a.kind === "PROMOTION";
                return (
                  <View
                    key={a.id}
                    style={[styles.announceCard, promo && styles.announceCardPromo, shadow.card]}
                  >
                    {!!a.imageUrl && (
                      <Image source={{ uri: a.imageUrl }} style={styles.announceImage} contentFit="cover" />
                    )}
                    <View style={styles.announceHeader}>
                      <Ionicons
                        name={promo ? "pricetag" : "megaphone"}
                        size={16}
                        color={promo ? colors.greenDark : colors.textMuted}
                      />
                      <Text style={[styles.announceBadge, promo && styles.announceBadgePromo]}>
                        {promo ? "Promotion" : "Announcement"}
                      </Text>
                    </View>
                    <Text style={styles.announceTitle}>{a.title}</Text>
                    {!!a.body && <Text style={styles.announceBody}>{a.body}</Text>}
                  </View>
                );
              })}
            </View>
          </>
        )}

        <View style={styles.statsRow}>
          <View style={[styles.statTile, shadow.card]}>
            <Ionicons name="trending-up" size={18} color={colors.green} />
            <Text style={styles.statValue}>{totalVisits}</Text>
            <Text style={styles.statLabel}>Total visits</Text>
          </View>
          <View style={[styles.statTile, shadow.card]}>
            <Ionicons name="today-outline" size={18} color={colors.green} />
            <Text style={styles.statValue}>{monthCount}</Text>
            <Text style={styles.statLabel}>This month</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Next booking</Text>
        {nextBooking ? (
          <Pressable
            style={({ pressed }) => [
              styles.card,
              { borderLeftWidth: 4, borderLeftColor: nextBooking.session.trainer.calendarColor },
              shadow.card,
              pressed && { opacity: 0.85 },
            ]}
            onPress={() =>
              router.push({
                pathname: "/session/[id]",
                params: {
                  id: nextBooking.session.id,
                  data: JSON.stringify({
                    ...nextBooking.session,
                    myStatus: nextBooking.status,
                    cutoffMinutes: classCutoff,
                  }),
                },
              })
            }
          >
            <View style={[styles.cardIconWrap, { backgroundColor: nextBooking.session.trainer.calendarColor + "22" }]}>
              <Ionicons name="calendar" size={20} color={nextBooking.session.trainer.calendarColor} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardLabel} numberOfLines={1}>
                {nextBooking.session.classType?.name ?? "Private class session"}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {new Date(nextBooking.session.startsAt).toLocaleString()}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {nextBooking.session.trainer.name}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
            <Text style={styles.empty}>No upcoming bookings — check Classes to reserve a class.</Text>
          </View>
        )}

        {contact && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Need help?</Text>
            <View style={[styles.helpCard, shadow.card]}>
              <View style={styles.helpRow}>
                {!!contact.whatsapp && (
                  <Pressable
                    style={styles.helpButton}
                    onPress={() => Linking.openURL(`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`)}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color={colors.green} />
                    <Text style={styles.helpButtonText}>WhatsApp</Text>
                  </Pressable>
                )}
                {!!contact.contactEmail && (
                  <Pressable style={styles.helpButton} onPress={() => Linking.openURL(`mailto:${contact.contactEmail}`)}>
                    <Ionicons name="mail-outline" size={18} color={colors.green} />
                    <Text style={styles.helpButtonText}>Email</Text>
                  </Pressable>
                )}
              </View>

              {contact.locations.map((loc) => (
                <Pressable
                  key={loc.id}
                  style={styles.locationRow}
                  disabled={!loc.phone}
                  onPress={() => loc.phone && Linking.openURL(`tel:${loc.phone}`)}
                >
                  <View style={styles.locationTextWrap}>
                    <Text style={styles.locationName}>{loc.name}</Text>
                    {!!loc.address && <Text style={styles.locationAddress}>{loc.address}</Text>}
                  </View>
                  {!!loc.phone && (
                    <View style={styles.locationCallWrap}>
                      <Ionicons name="call-outline" size={14} color={colors.green} />
                      <Text style={styles.locationPhone}>{loc.phone}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  greeting: { fontSize: 24, fontWeight: "700", color: colors.text, marginTop: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: { width: 28, height: 28 },
  planCard: {
    backgroundColor: colors.green,
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 24,
  },
  planCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  planName: { fontSize: 16, fontWeight: "700", color: colors.white, flexShrink: 1 },
  planCredits: { fontSize: 22, fontWeight: "700", color: colors.white, marginTop: 8 },
  planWallet: { fontSize: 13, color: colors.greenTint, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: "700", color: colors.text, marginTop: 4 },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: 10, textTransform: "uppercase" },
  quickList: { gap: 8, marginBottom: 24 },
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 12,
    gap: 12,
  },
  quickIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.greenTint,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTextWrap: { flex: 1, minWidth: 0 },
  quickTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  quickSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  motivationCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.greenTint,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 20,
  },
  motivationText: { flex: 1, fontSize: 14, color: colors.greenDark, fontStyle: "italic", lineHeight: 20 },
  progressCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    padding: 18,
    marginBottom: 24,
    gap: 8,
  },
  progressHeadline: { fontSize: 16, fontWeight: "700", color: colors.text },
  progressMessage: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  progressMetrics: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: 2 },
  progressMetric: { alignItems: "center", flex: 1 },
  progressMetricValue: { fontSize: 18, fontWeight: "700" },
  progressMetricLabel: { fontSize: 10, color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  progressTipRow: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  progressTip: { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  announceList: { gap: 10, marginBottom: 24 },
  announceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 6,
  },
  announceCardPromo: { backgroundColor: colors.greenTint },
  announceImage: { width: "100%", height: 140, borderRadius: radius.md, backgroundColor: colors.border },
  announceHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  announceBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  announceBadgePromo: { color: colors.greenDark },
  announceTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  announceBody: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 14,
  },
  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.greenTint,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTextWrap: { flex: 1, minWidth: 0 },
  cardLabel: { fontSize: 16, fontWeight: "600", color: colors.text },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  emptyCard: {
    alignItems: "center",
    padding: 28,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    gap: 10,
  },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: "center" },
  helpCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    gap: 4,
  },
  helpRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  helpButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.greenTint,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  helpButtonText: { fontSize: 13, fontWeight: "600", color: colors.greenDark },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 10,
  },
  locationTextWrap: { flex: 1, minWidth: 0 },
  locationName: { fontSize: 14, fontWeight: "600", color: colors.text },
  locationAddress: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  locationCallWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationPhone: { fontSize: 12, fontWeight: "600", color: colors.greenDark },
});
