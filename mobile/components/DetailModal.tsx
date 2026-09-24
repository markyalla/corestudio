import type { ReactNode } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius, shadow } from "@/lib/theme";

/** Bottom-sheet "what does this cover" detail view — shared by Plan and
 *  Package cards across Home, Profile, Plans and Packages so tapping any of
 *  them shows the same full picture (price, what's included, perks). */
export function DetailModal({
  visible,
  onClose,
  title,
  price,
  metaLines,
  description,
  perks,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  price?: string;
  metaLines: string[];
  description?: string;
  perks: string[];
  /** Extra content (e.g. Renew/Change-plan buttons, a package's bookable
   *  sessions) rendered between perks and the Close button. */
  children?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{title}</Text>
              {!!price && <Text style={styles.price}>{price}</Text>}
            </View>

            {metaLines.map((line, i) => (
              <Text key={i} style={styles.meta}>{line}</Text>
            ))}

            {!!description && <Text style={styles.description}>{description}</Text>}

            {perks.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>What&apos;s included</Text>
                {perks.map((perk) => (
                  <View key={perk} style={styles.perkRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                    <Text style={styles.perkText}>{perk}</Text>
                  </View>
                ))}
              </>
            )}

            {children}

            <Pressable style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "80%",
    ...shadow.card,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  title: { fontSize: 19, fontWeight: "700", color: colors.text, flex: 1 },
  price: { fontSize: 17, fontWeight: "700", color: colors.greenDark },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  description: { fontSize: 14, color: colors.text, marginTop: 14, lineHeight: 20 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginTop: 18, marginBottom: 8, textTransform: "uppercase" },
  perkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  perkText: { fontSize: 14, color: colors.text, flex: 1 },
  closeButton: {
    marginTop: 24,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  closeButtonText: { fontWeight: "700", color: colors.text },
});
