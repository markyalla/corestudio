import { useState } from "react";
import { View, Text, TextInput, Pressable, Modal, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COUNTRIES, DEFAULT_DIAL_CODE, combinePhone } from "@/lib/phone";
import { colors, radius } from "@/lib/theme";

/** Country-code dropdown + local-number field. Calls onChange with the
 *  combined "+<dialCode><digits>" value on every keystroke, same shape the
 *  backend's phone validation already expects. Uncontrolled by design (no
 *  `value` prop): its one call site (signup) navigates away on success, so
 *  there's nothing to resync from externally — give it a `key` if a future
 *  caller needs to force-reset one that stays mounted. */
export function PhoneInput({ onChange }: { onChange: (combined: string) => void }) {
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [local, setLocal] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const selected = COUNTRIES.find((c) => c.dialCode === dialCode) ?? COUNTRIES[0];

  return (
    <View style={styles.row}>
      <Pressable style={styles.dialButton} onPress={() => setPickerOpen(true)}>
        <Text style={styles.dialText}>{selected.iso2} {dialCode}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>
      <TextInput
        style={styles.numberInput}
        placeholder="542512558"
        placeholderTextColor={colors.textMuted}
        keyboardType="phone-pad"
        value={local}
        onChangeText={(v) => {
          setLocal(v);
          onChange(combinePhone(dialCode, v));
        }}
      />

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Choose a country</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(c) => `${c.iso2}-${c.dialCode}`}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.countryRow}
                  onPress={() => {
                    setDialCode(item.dialCode);
                    onChange(combinePhone(item.dialCode, local));
                    setPickerOpen(false);
                  }}
                >
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryDial}>{item.dialCode}</Text>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  dialButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
  },
  dialText: { fontSize: 14, fontWeight: "600", color: colors.text },
  numberInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
  },
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
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 8 },
  countryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  countryName: { fontSize: 15, color: colors.text },
  countryDial: { fontSize: 14, color: colors.textMuted, fontWeight: "600" },
});
