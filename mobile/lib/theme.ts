// Primary accent is the P4Studio logo's dusty-rose (#E0C2C0, sampled from
// assets/p4.png / icon.png) — "green" is a legacy name kept because it's used
// as the accent-color key across every screen; the hue itself is rose, not green.
/** P4Studio palette — brand dusty-rose on white, native-feeling neutrals. */
export const colors = {
  green: "#B85851", // primary accent — deepened brand rose (enough contrast for white text)
  greenDark: "#853832", // pressed/dark state
  greenTint: "#F6E6E5", // pale rose for badges/cards

  white: "#FFFFFF",
  background: "#FFFFFF",
  card: "#F7F8F7",
  border: "#E5E7E5",
  text: "#1C1D1B",
  textMuted: "#6B7269",
  danger: "#FF3B30",
  warning: "#FF9500",
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};
