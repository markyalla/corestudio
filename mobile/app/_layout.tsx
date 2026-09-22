import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth";
import { getDeviceSecurityIssue } from "@/lib/device-security";
import { DeviceBlockedScreen } from "@/components/DeviceBlockedScreen";

export default function RootLayout() {
  // undefined = still checking, null = clean, string = blocked with this reason
  const [blockedReason, setBlockedReason] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getDeviceSecurityIssue().then(setBlockedReason);
  }, []);

  if (blockedReason === undefined) return null;
  if (blockedReason) return <DeviceBlockedScreen reason={blockedReason} />;

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
