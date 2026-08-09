import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";

interface ProfileResponse {
  member: { creditsLeft: number; walletGHS: number; cycleRenewsAt: string | null };
  user: { name: string };
  plan: { name: string; classesPerCycle: number; bonusCredits: number } | null;
}

interface BookingsResponse {
  bookings: {
    id: string;
    status: string;
    session: { startsAt: string; classType: { name: string } | null; trainer: { name: string } };
  }[];
}

export default function HomeScreen() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [nextBooking, setNextBooking] = useState<BookingsResponse["bookings"][number] | null>(null);
  const [totalVisits, setTotalVisits] = useState(0);
  const [monthCount, setMonthCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, bookingsRes] = await Promise.all([
        api<ProfileResponse>("/api/app/profile"),
        api<BookingsResponse>("/api/app/bookings"),
      ]);
      setProfile(profileRes);
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

        {profile && (
          <View style={[styles.planCard, shadow.card]}>
            <View style={styles.planCardRow}>
              <Text style={styles.planName}>{profile.plan?.name ?? "No plan"}</Text>
              <Ionicons name="checkmark-circle" size={20} color={colors.white} />
            </View>
            <Text style={styles.planCredits}>{profile.member.creditsLeft} classes left</Text>
            {profile.member.walletGHS > 0 && (
              <Text style={styles.planWallet}>Wallet · {formatGHS(profile.member.walletGHS)}</Text>
            )}
          </View>
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
          <View style={[styles.card, shadow.card]}>
            <View style={styles.cardIconWrap}>
              <Ionicons name="calendar" size={20} color={colors.green} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardLabel} numberOfLines={1}>
                {nextBooking.session.classType?.name ?? "PT session"}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {new Date(nextBooking.session.startsAt).toLocaleString()}
              </Text>
              <Text style={styles.cardSub} numberOfLines={1}>
                {nextBooking.session.trainer.name}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={28} color={colors.textMuted} />
            <Text style={styles.empty}>No upcoming bookings — check Classes to reserve a class.</Text>
          </View>
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
  planWallet: { fontSize: 13, color: "#EAFBEE", marginTop: 4 },
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
});
