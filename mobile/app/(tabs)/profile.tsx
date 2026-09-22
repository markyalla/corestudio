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
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, router } from "expo-router";
import {
  api,
  ApiError,
  mediaUrl,
  verifyPayment,
  renewPlanWithCash,
  getMemberLocations,
  setPreferredLocation,
  type LocationOption,
} from "@/lib/api";
import { formatGHS } from "@/lib/money";
import { useAuth } from "@/lib/auth";
import { colors, radius, shadow } from "@/lib/theme";
import { CheckoutModal } from "@/components/CheckoutModal";
import { DetailModal } from "@/components/DetailModal";

interface ProfileResponse {
  member: {
    id: string;
    status: string;
    creditsLeft: number;
    walletGHS: number;
    cycleRenewsAt: string | null;
    joinedAt: string;
    photoUrl: string | null;
    location: { id: string; name: string } | null;
  };
  user: { name: string; email: string; phone: string | null };
  plan: {
    name: string;
    priceGHS: number;
    classesPerCycle: number;
    bonusCredits: number;
    cycleDays: number;
    description: string;
    perks: string[];
  } | null;
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
  const { logout, logoutAll } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [renewing, setRenewing] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [locationModal, setLocationModal] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [savingLocationId, setSavingLocationId] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [planDetailOpen, setPlanDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfile(await api<ProfileResponse>("/api/app/profile"));
    } finally {
      setLoading(false);
    }
  }, []);

  async function openLocationPicker() {
    setLocationModal(true);
    try {
      const res = await getMemberLocations();
      setLocations(res.locations);
    } catch {
      setLocations([]);
    }
  }

  async function onPickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photo access needed", "Allow photo library access to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    setPhotoBusy(true);
    try {
      const asset = result.assets[0];
      const mime = asset.mimeType ?? "image/jpeg";
      await api("/api/app/profile", {
        method: "PATCH",
        body: { photoDataUrl: `data:${mime};base64,${asset.base64}` },
      });
      await load();
    } catch (e) {
      Alert.alert("Couldn't update photo", e instanceof ApiError ? e.message : "Try again");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onChooseLocation(id: string) {
    setSavingLocationId(id);
    try {
      await setPreferredLocation(id);
      setLocationModal(false);
      await load();
    } catch (e) {
      Alert.alert("Couldn't save location", e instanceof ApiError ? e.message : "Try again");
    } finally {
      setSavingLocationId(null);
    }
  }

  /** Plans require a location first — route there only once one is set. */
  function goToPlans() {
    if (!profile?.member.location) {
      Alert.alert(
        "Pick your studio location first",
        "Choose the studio you'll attend so we can show you the right classes.",
        [{ text: "Choose location", onPress: openLocationPicker }],
      );
      return;
    }
    router.push("/plans");
  }

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

  function onRenewCash() {
    Alert.alert(
      "Pay with cash",
      "Renew at the studio — a staff member confirms your payment there and your credits top up right after.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setRenewing(true);
            try {
              await renewPlanWithCash();
              Alert.alert("Saved", "Pay at the studio — staff will confirm it and your credits will top up.");
              await load();
            } catch (e) {
              Alert.alert("Couldn't do that", e instanceof ApiError ? e.message : "Try again");
            } finally {
              setRenewing(false);
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

  function onLogoutAll() {
    Alert.alert(
      "Log out of all devices?",
      "This signs you out everywhere, including this device — useful if your phone was lost or you think someone else has your password.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out everywhere",
          style: "destructive",
          onPress: async () => {
            await logoutAll();
            router.replace("/login");
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <CheckoutModal url={checkoutUrl} onClose={onCheckoutClose} />
      {profile?.plan && (
        <DetailModal
          visible={planDetailOpen}
          onClose={() => setPlanDetailOpen(false)}
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
      <Modal
        visible={locationModal}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setLocationModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose your studio</Text>
            <Text style={styles.modalSub}>
              You&apos;ll see classes for this location. You can change it anytime.
            </Text>
            {locations.length === 0 ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={colors.green} />
            ) : (
              <FlatList
                data={locations}
                keyExtractor={(l) => l.id}
                renderItem={({ item }) => {
                  const selected = profile?.member.location?.id === item.id;
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.locationOption, pressed && styles.locationOptionPressed]}
                      disabled={savingLocationId !== null}
                      onPress={() => onChooseLocation(item.id)}
                    >
                      <View style={styles.locationTextWrap}>
                        <Text style={styles.locationOptionName}>{item.name}</Text>
                        {!!item.address && <Text style={styles.locationHint}>{item.address}</Text>}
                      </View>
                      {savingLocationId === item.id ? (
                        <ActivityIndicator size="small" color={colors.green} />
                      ) : selected ? (
                        <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
                <Pressable style={styles.avatar} onPress={onPickPhoto} disabled={photoBusy}>
                  {photoBusy ? (
                    <ActivityIndicator color={colors.white} />
                  ) : profile.member.photoUrl ? (
                    <Image source={{ uri: mediaUrl(profile.member.photoUrl) }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitial}>{profile.user.name.charAt(0).toUpperCase()}</Text>
                  )}
                  <View style={styles.avatarEditBadge}>
                    <Ionicons name="camera" size={12} color={colors.white} />
                  </View>
                </Pressable>
                <View style={styles.nameWrap}>
                  <Text style={styles.name} numberOfLines={1}>{profile.user.name}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{profile.user.email}</Text>
                </View>
              </View>

              <View style={[styles.card, shadow.card]}>
                <Pressable
                  style={styles.cardRow}
                  disabled={!profile.plan}
                  onPress={() => setPlanDetailOpen(true)}
                >
                  <Text style={styles.cardLabel}>{profile.plan?.name ?? "No plan"}</Text>
                  <Ionicons name={profile.plan ? "chevron-forward" : "ribbon-outline"} size={20} color={colors.green} />
                </Pressable>
                <Text style={styles.cardValue}>{profile.member.creditsLeft} classes left</Text>
                {profile.member.walletGHS > 0 && (
                  <Text style={styles.cardSub}>Wallet · {formatGHS(profile.member.walletGHS)}</Text>
                )}
                {profile.plan ? (
                  <>
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
                        onPress={goToPlans}
                      >
                        <Text style={styles.secondaryButtonText}>Change plan</Text>
                      </Pressable>
                    </View>
                    <Pressable style={styles.cashButton} onPress={onRenewCash} disabled={renewing}>
                      <Text style={styles.cashButtonText}>Pay with cash at the studio</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable
                    style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                    onPress={goToPlans}
                  >
                    <Text style={styles.buttonText}>Choose a plan</Text>
                  </Pressable>
                )}
              </View>

              <View style={[styles.card, shadow.card]}>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>Packages</Text>
                  <Ionicons name="pricetags-outline" size={20} color={colors.green} />
                </View>
                <Text style={styles.cardSub}>One-time session bundles — massage, physio, private Pilates and more.</Text>
                <Pressable
                  style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                  onPress={() => router.push("/packages")}
                >
                  <Text style={styles.buttonText}>Browse packages</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Studio location</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  shadow.card,
                  styles.locationCard,
                  !profile.member.location && styles.locationCardUnset,
                  pressed && styles.locationCardPressed,
                ]}
                onPress={openLocationPicker}
              >
                <View style={styles.locationIconWrap}>
                  <Ionicons
                    name="location"
                    size={18}
                    color={profile.member.location ? colors.green : colors.warning}
                  />
                </View>
                <View style={styles.locationTextWrap}>
                  <Text style={styles.locationValue}>
                    {profile.member.location?.name ?? "Not set"}
                  </Text>
                  <Text style={styles.locationHint}>
                    {profile.member.location
                      ? "Classes you see are for this studio"
                      : "Pick your studio before choosing a plan"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>

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
          <View>
            <Pressable
              style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
              onPress={onLogout}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={styles.logoutText}>Sign out</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.logoutAllButton, pressed && styles.logoutPressed]}
              onPress={onLogoutAll}
            >
              <Text style={styles.logoutAllText}>Log out of all devices</Text>
            </Pressable>
          </View>
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
    overflow: "visible",
  },
  avatarImage: { width: 56, height: 56, borderRadius: radius.pill },
  avatarEditBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.greenDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.background,
  },
  avatarInitial: { color: colors.white, fontSize: 22, fontWeight: "700" },
  name: { fontSize: 20, fontWeight: "700", color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: colors.textMuted, marginTop: 20, marginBottom: 10, textTransform: "uppercase" },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18 },
  locationCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  locationCardUnset: { borderWidth: 1, borderColor: colors.warning },
  locationCardPressed: { opacity: 0.7 },
  locationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  locationTextWrap: { flex: 1, minWidth: 0 },
  locationValue: { fontSize: 15, fontWeight: "700", color: colors.text },
  locationHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    maxHeight: "70%",
  },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  modalSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 12 },
  locationOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  locationOptionPressed: { opacity: 0.6 },
  locationOptionName: { fontSize: 15, fontWeight: "600", color: colors.text },
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
  cashButton: { alignItems: "center", paddingVertical: 10, marginTop: 6 },
  cashButtonText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
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
  logoutAllButton: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  logoutAllText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
});
