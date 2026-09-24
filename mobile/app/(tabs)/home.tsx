import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Pressable,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import {
  api,
  ApiError,
  getAnnouncements,
  getContact,
  getMotivation,
  getPackages,
  getProgress,
  renewPlanWithCash,
  subscribeToPackage,
  subscribeToPackageWithCash,
  verifyPayment,
  type Announcement,
  type ContactInfo,
  type MyPackage,
  type PackageOption,
  type ProgressResponse,
} from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";
import { DetailModal } from "@/components/DetailModal";
import { CheckoutModal } from "@/components/CheckoutModal";
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

/** Front-desk phone fields are free text an admin may fill with more than one
 *  number (e.g. "024 111 2222 / 020 333 4444") — split them so each becomes
 *  its own tappable "tel:" link instead of one link that dials both at once. */
function splitPhones(raw: string): string[] {
  return raw
    .split(/[,/;&\n]+|\band\b/gi)
    .map((s) => s.trim())
    .filter(Boolean);
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
  const [allSessions, setAllSessions] = useState<SessionItem[]>([]);
  const [classCutoff, setClassCutoff] = useState(45);
  const [myPackages, setMyPackages] = useState<MyPackage[]>([]);
  const [availablePackages, setAvailablePackages] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<
    | { kind: "plan" }
    | { kind: "myPackage"; pkg: MyPackage }
    | { kind: "promoPackage"; pkg: PackageOption }
    | null
  >(null);
  const [renewingPlan, setRenewingPlan] = useState(false);
  const [subscribingPackageId, setSubscribingPackageId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [checkoutKind, setCheckoutKind] = useState<"plan" | "package" | null>(null);

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
      setAvailablePackages(packagesRes.packages);
      setContact(contactRes);
      setAnnouncements(announcementsRes.announcements);
      setProgress(progressRes);
      setMotivation(motivationRes.text);
      setClassCutoff(sessionsRes.bookingCutoffMinutes);
      const nowMs = Date.now();
      const futureSessions = sessionsRes.sessions
        .filter((s) => new Date(s.startsAt).getTime() > nowMs)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      setAllSessions(futureSessions);
      setUpcomingClasses(futureSessions.slice(0, 6));
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

  const packageSessions = useMemo(() => {
    if (detail?.kind !== "myPackage") return [];
    return allSessions.filter((s) => s.classType?.id === detail.pkg.classTypeId);
  }, [detail, allSessions]);

  function openSession(item: SessionItem) {
    setDetail(null);
    router.push({
      pathname: "/session/[id]",
      params: { id: item.id, data: JSON.stringify({ ...item, cutoffMinutes: classCutoff }) },
    });
  }

  async function onRenewPlan() {
    setRenewingPlan(true);
    setCheckoutKind("plan");
    try {
      const res = await api<{ authorizationUrl: string; reference?: string }>("/api/app/renew", {
        method: "POST",
      });
      setCheckoutUrl(res.authorizationUrl);
    } catch (e) {
      Alert.alert("Couldn't start renewal", e instanceof ApiError ? e.message : "Try again");
      setRenewingPlan(false);
    }
  }

  function onRenewPlanCash() {
    Alert.alert(
      "Pay with cash",
      "Renew at the studio — a staff member confirms your payment there and your credits top up right after.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setRenewingPlan(true);
            try {
              await renewPlanWithCash();
              Alert.alert("Saved", "Pay at the studio — staff will confirm it and your credits will top up.");
              setDetail(null);
              await load();
            } catch (e) {
              Alert.alert("Couldn't do that", e instanceof ApiError ? e.message : "Try again");
            } finally {
              setRenewingPlan(false);
            }
          },
        },
      ],
    );
  }

  function onChangePlan() {
    setDetail(null);
    router.push("/plans");
  }

  async function onBuyPackage(pkg: PackageOption) {
    setSubscribingPackageId(pkg.id);
    setCheckoutKind("package");
    try {
      const res = await subscribeToPackage(pkg.id);
      setCheckoutUrl(res.authorizationUrl);
    } catch (e) {
      Alert.alert("Couldn't start checkout", e instanceof ApiError ? e.message : "Try again");
      setSubscribingPackageId(null);
    }
  }

  function onBuyPackageCash(pkg: PackageOption) {
    Alert.alert(
      "Pay with cash",
      `You'll pay ${formatGHS(pkg.priceGHS)} for ${pkg.name} at the studio. A staff member will confirm it there, and your sessions go live right after.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setSubscribingPackageId(pkg.id);
            try {
              await subscribeToPackageWithCash(pkg.id);
              Alert.alert("Saved", "Show up at the studio and pay in person — staff will confirm it and your sessions will activate.");
              setDetail(null);
              await load();
            } catch (e) {
              Alert.alert("Couldn't save this", e instanceof ApiError ? e.message : "Try again");
            } finally {
              setSubscribingPackageId(null);
            }
          },
        },
      ],
    );
  }

  async function onCheckoutClose(reference: string | null) {
    const kind = checkoutKind;
    setCheckoutUrl(null);
    setCheckoutKind(null);
    if (reference) {
      try {
        const { status } = await verifyPayment(reference);
        if (status === "success") {
          Alert.alert(
            kind === "plan" ? "Plan renewed!" : "You're set!",
            kind === "plan" ? "Your credits have been topped up." : "Your sessions are ready — go book a class.",
          );
          setDetail(null);
        } else {
          Alert.alert("Payment not completed", `Status: ${status}.`);
        }
      } catch {
        Alert.alert("Couldn't confirm payment", "If you completed checkout, check back shortly.");
      }
    }
    await load();
    setRenewingPlan(false);
    setSubscribingPackageId(null);
  }

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
            style={({ pressed }) => [styles.planCard, shadow.card, pressed && { opacity: 0.9 }]}
            onPress={() => (profile.plan ? setDetail({ kind: "plan" }) : router.push("/plans"))}
          >
            <View style={styles.planCardRow}>
              <Text style={styles.planName}>{profile.plan?.name ?? "No plan yet"}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.white} />
            </View>
            <Text style={styles.planCredits}>
              {profile.plan ? `${profile.member.creditsLeft} classes left` : "Tap to choose a plan"}
            </Text>
            {profile.member.walletGHS > 0 && (
              <Text style={styles.planWallet}>Wallet · {formatGHS(profile.member.walletGHS)}</Text>
            )}
          </Pressable>
        )}

        {myPackages.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Your packages</Text>
            <View style={styles.packageList}>
              {myPackages.map((pkg) => (
                <Pressable
                  key={pkg.id}
                  style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.85 }]}
                  onPress={() => setDetail({ kind: "myPackage", pkg })}
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
            </View>
          </>
        )}

        {availablePackages.length > 0 && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Promotional packages</Text>
              <Pressable onPress={() => router.push("/packages")} hitSlop={8}>
                <Text style={styles.seeAllText}>See all</Text>
              </Pressable>
            </View>
            <View style={styles.packageList}>
              {availablePackages.map((pkg) => (
                <Pressable
                  key={pkg.id}
                  style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.85 }]}
                  onPress={() => setDetail({ kind: "promoPackage", pkg })}
                >
                  <View style={styles.cardIconWrap}>
                    <Ionicons name="pricetag-outline" size={18} color={colors.green} />
                  </View>
                  <View style={styles.cardTextWrap}>
                    <Text style={styles.cardLabel} numberOfLines={1}>{pkg.name}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {pkg.classTypeName} · {pkg.sessionsGranted} sessions · {formatGHS(pkg.priceGHS)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
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
          >
            <View style={styles.detailActionRow}>
              <Pressable
                style={({ pressed }) => [styles.detailButton, styles.detailButtonFlex, pressed && styles.detailButtonPressed]}
                disabled={renewingPlan}
                onPress={onRenewPlan}
              >
                {renewingPlan ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.detailButtonText}>Renew plan</Text>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.detailSecondaryButton, styles.detailButtonFlex, pressed && styles.detailSecondaryPressed]}
                disabled={renewingPlan}
                onPress={onChangePlan}
              >
                <Text style={styles.detailSecondaryText}>Change plan</Text>
              </Pressable>
            </View>
            <Pressable style={styles.detailCashButton} onPress={onRenewPlanCash} disabled={renewingPlan}>
              <Text style={styles.detailCashText}>Pay with cash at the studio</Text>
            </Pressable>
          </DetailModal>
        )}
        {detail?.kind === "myPackage" && (
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
          >
            <Text style={styles.detailSectionLabel}>Book a class</Text>
            {packageSessions.length === 0 ? (
              <Text style={styles.detailEmptyText}>
                No upcoming {detail.pkg.classTypeName} sessions right now — check Classes to see what&apos;s coming up.
              </Text>
            ) : (
              packageSessions.map((s) => (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.sessionPickRow,
                    { borderLeftColor: s.trainer.calendarColor },
                    pressed && { opacity: 0.85 },
                  ]}
                  onPress={() => openSession(s)}
                >
                  <View style={styles.sessionPickTextWrap}>
                    <Text style={styles.sessionPickTitle} numberOfLines={1}>
                      {s.classType?.name ?? detail.pkg.classTypeName}
                    </Text>
                    <Text style={styles.sessionPickSub} numberOfLines={1}>
                      {new Date(s.startsAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                      {" · "}
                      {new Date(s.startsAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      {" · "}
                      {s.trainer.name}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))
            )}
          </DetailModal>
        )}
        {detail?.kind === "promoPackage" && (
          <DetailModal
            visible
            onClose={() => setDetail(null)}
            title={detail.pkg.name}
            price={formatGHS(detail.pkg.priceGHS)}
            metaLines={[
              `${detail.pkg.classTypeName}`,
              `${detail.pkg.sessionsGranted} sessions · valid ${detail.pkg.validDays} days`,
            ]}
            description={detail.pkg.classTypeDescription}
            perks={detail.pkg.perks}
          >
            <Pressable
              style={({ pressed }) => [styles.detailButton, pressed && styles.detailButtonPressed]}
              disabled={subscribingPackageId === detail.pkg.id}
              onPress={() => onBuyPackage(detail.pkg)}
            >
              {subscribingPackageId === detail.pkg.id ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.detailButtonText}>Buy this package</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.detailCashButton}
              disabled={subscribingPackageId === detail.pkg.id}
              onPress={() => onBuyPackageCash(detail.pkg)}
            >
              <Text style={styles.detailCashText}>Pay with cash at the studio</Text>
            </Pressable>
          </DetailModal>
        )}
        <CheckoutModal url={checkoutUrl} onClose={onCheckoutClose} />

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

              {contact.locations.map((loc) => {
                const phones = loc.phone ? splitPhones(loc.phone) : [];
                return (
                  <View key={loc.id} style={styles.locationRow}>
                    <View style={styles.locationTextWrap}>
                      <Text style={styles.locationName}>{loc.name}</Text>
                      {!!loc.address && <Text style={styles.locationAddress}>{loc.address}</Text>}
                    </View>
                    {phones.length > 0 && (
                      <View style={styles.locationPhoneList}>
                        {phones.map((phone) => (
                          <Pressable
                            key={phone}
                            style={styles.locationCallWrap}
                            onPress={() => Linking.openURL(`tel:${phone}`)}
                          >
                            <Ionicons name="call-outline" size={14} color={colors.green} />
                            <Text style={styles.locationPhone}>{phone}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
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
    marginBottom: 28,
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
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  locationTextWrap: { flex: 1, minWidth: 0 },
  locationName: { fontSize: 14, fontWeight: "600", color: colors.text },
  locationAddress: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  locationPhoneList: { gap: 6 },
  locationCallWrap: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  locationPhone: { fontSize: 12, fontWeight: "600", color: colors.greenDark },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  seeAllText: { fontSize: 13, fontWeight: "700", color: colors.greenDark },
  packageList: { gap: 10, marginBottom: 24 },
  detailActionRow: { flexDirection: "row", gap: 10, marginTop: 20 },
  detailButtonFlex: { flex: 1, marginTop: 0 },
  detailButton: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 20,
  },
  detailButtonPressed: { backgroundColor: colors.greenDark },
  detailButtonText: { color: colors.white, fontWeight: "700" },
  detailSecondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
  },
  detailSecondaryPressed: { backgroundColor: colors.card },
  detailSecondaryText: { color: colors.text, fontWeight: "700" },
  detailCashButton: { alignItems: "center", paddingVertical: 10, marginTop: 6 },
  detailCashText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  detailSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginTop: 20,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  detailEmptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  sessionPickRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  sessionPickTextWrap: { flex: 1, minWidth: 0 },
  sessionPickTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  sessionPickSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
