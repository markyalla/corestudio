import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "@/lib/theme";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
const CALLBACK_PREFIX = `${API_URL}/api/app/pay/callback`;

interface Props {
  /** Paystack checkout URL, or null to keep the modal hidden. */
  url: string | null;
  /** Called once, either when Paystack redirects back to our callback (payment
   *  attempted — reference is set) or the user closes the sheet manually
   *  (reference is null, treat as cancelled). */
  onClose: (reference: string | null) => void;
}

/** Presents Paystack checkout as an in-app modal sheet with a WebView,
 *  instead of handing off to the system browser — gives us a native "X to
 *  close" affordance and, more importantly, lets us reliably detect when
 *  checkout finishes by watching navigation instead of depending on a
 *  browser redirect callback that isn't always dismissed automatically. */
export function CheckoutModal({ url, onClose }: Props) {
  function onNavigationStateChange(nav: WebViewNavigation) {
    if (nav.url.startsWith(CALLBACK_PREFIX)) {
      const reference = new URL(nav.url).searchParams.get("reference");
      onClose(reference);
    }
  }

  return (
    <Modal visible={!!url} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => onClose(null)}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Checkout</Text>
          <Pressable style={styles.closeButton} onPress={() => onClose(null)} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        {url && (
          <WebView
            source={{ uri: url }}
            onNavigationStateChange={onNavigationStateChange}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.green} size="large" />
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
