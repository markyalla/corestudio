import { Redirect } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function Index() {
  const { isReady, isLoggedIn } = useAuth();
  if (!isReady) return null;
  return <Redirect href={isLoggedIn ? "/(tabs)/home" : "/welcome"} />;
}
