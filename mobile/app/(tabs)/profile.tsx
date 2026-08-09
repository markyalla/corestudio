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
import { useFocusEffect, router } from "expo-router";
import { api, ApiError, verifyPayment } from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { useAuth } from "@/lib/auth";
import { colors, radius, shadow } from "@/lib/theme";
import { CheckoutModal } from "@/components/CheckoutModal";

interface ProfileResponse {
  member: {
    id: string;
    status: string;
    creditsLeft: number;
    walletGHS: number;
    cycleRenewsAt: string | null;
    joinedAt: string;
  };
  user: { name: string; email: string; phone: string | null };
  plan: { name: string; priceGHS: number; classesPerCycle: number; bonusCredits: number; perks: string[] } | null;
  payments: PaymentItem[];
}

export interface PaymentItem {
  id: string;
  amountGHS: number;
  method: string;
  description: string;
  status: string;
  paystackRef: string | null;
  createdAt: string;
  booking: {
    id: string;
    status: string;
    session: {
      startsAt: string;
      classType: { name: string } | null;
      trainer: { name: string };
    };
  } | null;
}

/** A short, human-friendly membership number derived from the member's id —
 *  mirrors gym-management apps (e.g. GymMaster) showing a membership # on
 *  the profile/membership screen. */
function membershipNumber(memberId: string): string {
  return memberId.slice(-8).toUpperCase();
}

export default function ProfileScreen() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await api<ProfileResponse>("/api/app/profile"));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRenew() {
    setRenewing(true);
    try {
      const res = await api<{ authorizationUrl: string; reference?: string }>("/api/app/renew", {
        method: "POST",
      });
      setCheckoutUrl(res.authorizationUrl);
    } catch (e) {
      Alert.alert("Couldn't start renewal", e instanceof ApiError ? e.message : "Try again");
      setRenewing(false);
    }
  }

  async function onCheckoutClose(reference: string | null) {
    setCheckoutUrl(null);
    if (reference) {
      try {
        const { status } = await verifyPayment(reference);
        if (status === "success") {
          Alert.alert("Plan renewed!", "Your credits have been topped up.");
        } else {
          Alert.alert("Payment not completed", `Status: ${status}.`);
        }
      } catch {
        Alert.alert("Couldn't confirm payment", "If you completed checkout, check back shortly.");
      }
    }
    await load();
    setRenewing(false);
  }

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <CheckoutModal url={checkoutUrl} onClose={onCheckoutClose} />
      <FlatList
        style={styles.container}
        contentContainerStyle={{ padding: 20, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />
        }
        data={profile?.payments ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          profile ? (
            <View>
              <View style={styles.profileHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarInitial}>{profile.user.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.nameWrap}>
                  <Text style={styles.name} numberOfLines={1}>{profile.user.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{profile.user.email}</Text>
                </View>
              </View>

              <View style={[styles.card, shadow.card]}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>{profile.plan?.name ?? "No plan"}</Text>
                  <Ionicons name="ribbon-outline" size={20} color={colors.green} />
                </View>
                <Text style={styles.cardValue}>{profile.member.creditsLeft} classes left</Text>
                {profile.member.walletGHS > 0 && (
                  <Text style={styles.cardSub}>Wallet · {formatGHS(profile.member.walletGHS)}</Text>
                )}
                {profile.plan ? (
                  <View style={styles.planButtonRow}>
                    <Pressable
                      style={({ pressed }) => [styles.button, styles.buttonFlex, pressed && styles.buttonPressed]}
                      disabled={renewing}
                      onPress={onRenew}
                    >
                      {renewing ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.buttonText}>Renew plan</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.secondaryButton, styles.buttonFlex, pressed && styles.secondaryPressed]}
                      onPress={() => router.push("/plans")}
                    >
                      <Text style={styles.secondaryButtonText}>Change plan</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                    onPress={() => router.push("/plans")}
                  >
                    <Text style={styles.buttonText}>Choose a plan</Text>
                  </Pressable>
                )}
              </View>

              <Text style={styles.sectionTitle}>Membership</Text>
              <View style={[styles.card, shadow.card, styles.membershipCard]}>
                <View style={styles.membershipRow}>
                  <Text style={styles.membershipLabel}>Membership #</Text>
                  <Text style={styles.membershipValue}>{membershipNumber(profile.member.id)}</Text>
                </View>
                <View style={styles.membershipRow}>
                  <Text style={styles.membershipLabel}>Member since</Text>
                  <Text style={styles.membershipValue}>
                    {new Date(profile.member.joinedAt).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                </View>
                <View style={styles.membershipRow}>
                  <Text style={styles.membershipLabel}>Status</Text>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>{profile.member.status}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Payment history</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.paymentRow, pressed && styles.paymentRowPressed]}
            onPress={() =>
              router.push({ pathname: "/payment/[id]", params: { id: item.id, data: JSON.stringify(item) } })
            }
          >
            <View style={styles.paymentIconWrap}>
              <Ionicons name="receipt-outline" size={16} color={colors.green} />
            </View>
            <Text style={styles.paymentDesc} numberOfLines={1}>{item.description}</Text>
            <Text style={styles.paymentAmount}>{formatGHS(item.amountGHS)}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        )}
        ListFooterComponent={
          <Pressable
            style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
            onPress={onLogout}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.danger} />
            <Text style={styles.logoutText}>Sign out</Text>
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  nameWrap: { flex: 1, minWidth: 0 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: colors.white, fontSize: 22, fontWeight: "700" },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginTop: 20, marginBottom: 10, textTransform: "uppercase" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardLabel: { fontSize: 16, fontWeight: "600", color: colors.text, flexShrink: 1 },
  cardValue: { fontSize: 20, fontWeight: "700", color: colors.text, marginTop: 6 },
  cardSub: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: 14,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonText: { color: colors.white, fontWeight: "700" },
  planButtonRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  buttonFlex: { flex: 1, marginTop: 0 },
  secondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryPressed: { backgroundColor: colors.card },
  secondaryButtonText: { color: colors.text, fontWeight: "700" },
  membershipCard: { gap: 12 },
  membershipRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  membershipLabel: { fontSize: 13, color: colors.textMuted },
  membershipValue: { fontSize: 13, color: colors.text, fontWeight: "600" },
  statusPill: {
    backgroundColor: colors.greenTint,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusPillText: { fontSize: 11, fontWeight: "700", color: colors.greenDark },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paymentRowPressed: { opacity: 0.6 },
  paymentIconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.greenTint,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentDesc: { fontSize: 14, color: colors.text, flex: 1 },
  paymentAmount: { fontSize: 14, color: colors.text, fontWeight: "700" },
  logoutButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: 12,
    marginTop: 28,
  },
  logoutPressed: { backgroundColor: colors.card },
  logoutText: { color: colors.danger, fontWeight: "700" },
});
