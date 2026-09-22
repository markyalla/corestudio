import { useCallback, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, RefreshControl, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import {
  ApiError,
  getPackages,
  subscribeToPackage,
  subscribeToPackageWithCash,
  verifyPayment,
  type MyPackage,
  type PackageOption,
} from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { colors, radius, shadow } from "@/lib/theme";
import { CheckoutModal } from "@/components/CheckoutModal";
import { DetailModal } from "@/components/DetailModal";

export default function PackagesScreen() {
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [myPackages, setMyPackages] = useState<MyPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribingId, setSubscribingId] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ kind: "offer"; pkg: PackageOption } | { kind: "mine"; pkg: MyPackage } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPackages();
      setPackages(res.packages);
      setMyPackages(res.myPackages);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onPick(pkg: PackageOption) {
    setSubscribingId(pkg.id);
    try {
      const res = await subscribeToPackage(pkg.id);
      setCheckoutUrl(res.authorizationUrl);
    } catch (e) {
      Alert.alert("Couldn't start checkout", e instanceof ApiError ? e.message : "Try again");
      setSubscribingId(null);
    }
  }

  function onPickCash(pkg: PackageOption) {
    Alert.alert(
      "Pay with cash",
      `You'll pay ${formatGHS(pkg.priceGHS)} for ${pkg.name} at the studio. A staff member will confirm it there, and your sessions go live right after.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setSubscribingId(pkg.id);
            try {
              await subscribeToPackageWithCash(pkg.id);
              Alert.alert("Saved", "Show up at the studio and pay in person — staff will confirm it and your sessions will activate.");
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
          Alert.alert("You're set!", "Your sessions are ready — go book a class.");
          await load();
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
        <Text style={styles.title}>Packages</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.green} />}
      >
        {myPackages.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Your packages</Text>
            {myPackages.map((mp) => (
              <Pressable
                key={mp.id}
                style={({ pressed }) => [styles.myCard, shadow.card, pressed && { opacity: 0.85 }]}
                onPress={() => setDetail({ kind: "mine", pkg: mp })}
              >
                <View>
                  <Text style={styles.myCardTitle}>{mp.name}</Text>
                  <Text style={styles.myCardSub}>
                    {mp.classTypeName} · expires {new Date(mp.expiresAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.myCardSessions}>{mp.sessionsLeft} left</Text>
              </Pressable>
            ))}
          </>
        )}

        <Text style={styles.sectionLabel}>Buy a package</Text>
        <Text style={styles.subtitle}>
          One-time session bundles for a specific class — no monthly renewal, just book until they
          run out or expire.
        </Text>

        {packages.map((pkg) => (
          <View key={pkg.id} style={[styles.card, shadow.card]}>
            <Pressable onPress={() => setDetail({ kind: "offer", pkg })}>
              <View style={styles.cardHeader}>
                <Text style={styles.planName}>{pkg.name}</Text>
                <Text style={styles.planPrice}>{formatGHS(pkg.priceGHS)}</Text>
              </View>
              <Text style={styles.planMeta}>
                {pkg.classTypeName} · {pkg.sessionsGranted} sessions · valid {pkg.validDays} days
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              disabled={subscribingId === pkg.id}
              onPress={() => onPick(pkg)}
            >
              {subscribingId === pkg.id ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Buy this package</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.cashButton, pressed && styles.cashButtonPressed]}
              disabled={subscribingId === pkg.id}
              onPress={() => onPickCash(pkg)}
            >
              <Text style={styles.cashButtonText}>Pay with cash at the studio</Text>
            </Pressable>
          </View>
        ))}

        {!loading && packages.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="ribbon-outline" size={28} color={colors.textMuted} />
            <Text style={styles.empty}>No packages available right now.</Text>
          </View>
        )}
      </ScrollView>

      {detail?.kind === "offer" && (
        <DetailModal
          visible
          onClose={() => setDetail(null)}
          title={detail.pkg.name}
          price={formatGHS(detail.pkg.priceGHS)}
          metaLines={[`${detail.pkg.classTypeName}`, `${detail.pkg.sessionsGranted} sessions · valid ${detail.pkg.validDays} days`]}
          description={detail.pkg.classTypeDescription}
          perks={detail.pkg.perks}
        />
      )}
      {detail?.kind === "mine" && (
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
  sectionLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginBottom: 8, textTransform: "uppercase" },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16, lineHeight: 19 },
  myCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  myCardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  myCardSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  myCardSessions: { fontSize: 16, fontWeight: "700", color: colors.greenDark },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, marginBottom: 14 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  planName: { fontSize: 17, fontWeight: "700", color: colors.text, flexShrink: 1 },
  planPrice: { fontSize: 17, fontWeight: "700", color: colors.greenDark },
  planMeta: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
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
