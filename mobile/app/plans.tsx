import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  api,
  ApiError,
  getPlans,
  subscribeToPlan,
  subscribeToPlanWithCash,
  verifyPayment,
  type PlanOption,
} from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";
import { CheckoutModal } from "@/components/CheckoutModal";

export default function PlansScreen() {
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLocation, setHasLocation] = useState<boolean | null>(null);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, profileRes] = await Promise.all([
        getPlans(),
        api<{ member: { location: { id: string } | null } }>("/api/app/profile"),
      ]);
      setPlans(plansRes.plans);
      setHasLocation(!!profileRes.member.location);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onPick(plan: PlanOption) {
    setSubscribingId(plan.id);
    try {
      const res = await subscribeToPlan(plan.id);
      setCheckoutUrl(res.authorizationUrl);
    } catch (e) {
      Alert.alert("Couldn't start checkout", e instanceof ApiError ? e.message : "Try again");
      setSubscribingId(null);
    }
  }

  function onPickCash(plan: PlanOption) {
    Alert.alert(
      "Pay with cash",
      `You'll pay ${formatGHS(plan.priceGHS)} for ${plan.name} at the studio. A staff member will confirm it there, and your credits go live right after.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setSubscribingId(plan.id);
            try {
              await subscribeToPlanWithCash(plan.id);
              Alert.alert("Saved", "Show up at the studio and pay in person — staff will confirm it and your credits will activate.");
              router.back();
            } catch (e) {
              Alert.alert("Couldn't save this", e instanceof ApiError ? e.message : "Try again");
            } finally {
              setSubscribingId(null);
            }
          },
        },
      ],
    );
  }

  async function onCheckoutClose(reference: string | null) {
    setCheckoutUrl(null);
    if (reference) {
      try {
        const { status } = await verifyPayment(reference);
        if (status === "success") {
          Alert.alert("You're subscribed!", "Your credits are ready — go book a class.");
          router.back();
        } else {
          Alert.alert("Payment not completed", `Status: ${status}.`);
        }
      } catch {
        Alert.alert("Couldn't confirm payment", "If you completed checkout, check back shortly.");
      }
    }
    setSubscribingId(null);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <CheckoutModal url={checkoutUrl} onClose={onCheckoutClose} />
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Plans</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />}
      >
        {hasLocation === false ? (
          <View style={styles.emptyCard}>
            <Ionicons name="location-outline" size={28} color={colors.warning} />
            <Text style={styles.empty}>
              Choose your studio location first so we can match you to the right plan and classes.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, { alignSelf: "stretch" }]}
              onPress={() => router.replace("/(tabs)/profile")}
            >
              <Text style={styles.buttonText}>Go to Profile</Text>
            </Pressable>
          </View>
        ) : (
          <>
        <Text style={styles.subtitle}>
          Subscribe to a plan for monthly credits, or keep paying per class instead.
        </Text>

        {plans.map((plan) => (
          <View key={plan.id} style={[styles.card, shadow.card]}>
            <View style={styles.cardHeader}>
              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planPrice}>{formatGHS(plan.priceGHS)}</Text>
            </View>
            <Text style={styles.planMeta}>
              {plan.classesPerCycle} classes
              {plan.bonusCredits > 0 ? ` + ${plan.bonusCredits} free` : ""} · every {plan.cycleDays} days
            </Text>
            {!!plan.description && <Text style={styles.planDesc}>{plan.description}</Text>}
            {plan.perks.length > 0 && (
              <View style={styles.perkRow}>
                {plan.perks.map((perk) => (
                  <View key={perk} style={styles.perkChip}>
                    <Text style={styles.perkChipText}>{perk}</Text>
                  </View>
                ))}
              </View>
            )}
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              disabled={subscribingId === plan.id}
              onPress={() => onPick(plan)}
            >
              {subscribingId === plan.id ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Choose this plan</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.cashButton, pressed && styles.cashButtonPressed]}
              disabled={subscribingId === plan.id}
              onPress={() => onPickCash(plan)}
            >
              <Text style={styles.cashButtonText}>Pay with cash at the studio</Text>
            </Pressable>
          </View>
        ))}

        {!loading && plans.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="ribbon-outline" size={28} color={colors.textMuted} />
            <Text style={styles.empty}>No plans available right now.</Text>
          </View>
        )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  content: { padding: 20 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 19 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  planName: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  planPrice: { fontSize: 17, fontWeight: "700", color: colors.greenDark },
  planMeta: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
  planDesc: { fontSize: 13, color: colors.textMuted, marginTop: 8, lineHeight: 19 },
  perkRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  perkChip: {
    backgroundColor: colors.greenTint,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  perkChipText: { fontSize: 11, fontWeight: "600", color: colors.greenDark },
  button: {
    backgroundColor: colors.green,
    borderRadius: radius.sm,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 14,
  },
  buttonPressed: { backgroundColor: colors.greenDark },
  buttonText: { color: colors.white, fontWeight: "700" },
  cashButton: {
    alignItems: "center",
    paddingVertical: 10,
    marginTop: 6,
  },
  cashButtonPressed: { opacity: 0.6 },
  cashButtonText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
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
