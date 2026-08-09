import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/lib/theme";

interface Props {
  taken: number;
  capacity: number;
  size?: number;
  strokeWidth?: number;
}

/** Circular fill indicator for a class's booked/total spots — mirrors the
 *  "availability ring" gym-booking apps (e.g. GymMaster) show per class,
 *  instead of a plain "3/6" text badge. */
export function CapacityRing({ taken, capacity, size = 44, strokeWidth = 4 }: Props) {
  const pct = capacity > 0 ? Math.min(taken / capacity, 1) : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const full = taken >= capacity;
  const ringColor = full ? colors.danger : pct >= 0.75 ? colors.warning : colors.green;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      <View style={styles.label}>
        <Text style={[styles.count, { fontSize: size * 0.3 }]}>{taken}</Text>
        <Text style={[styles.total, { fontSize: size * 0.2 }]}>/{capacity}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  svg: { transform: [{ rotate: "-90deg" }] },
  label: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  count: { fontWeight: "700", color: colors.text },
  total: { color: colors.textMuted, marginLeft: 1 },
});
