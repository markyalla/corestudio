import { Platform } from "react-native";
import Constants, { AppOwnership } from "expo-constants";
import JailMonkey from "jail-monkey";

/** This app handles payments and member data, so it refuses to run on a
 *  device with developer/debug tooling enabled or visible signs of
 *  tampering — those make it far easier to intercept traffic, read the
 *  token out of memory, or manipulate the app's behavior at runtime.
 *  Returns a human-readable reason, or null if the device looks clean.
 *
 *  Skipped entirely inside Expo Go: it can't load jail-monkey's native
 *  module at all (calling it there would crash on startup), and Expo Go was
 *  never the thing this needed to protect — a real member always opens the
 *  actual built app (dev client, internal build, or store build), where
 *  jail-monkey is properly linked and this check runs for real. Native-only
 *  otherwise: there's no equivalent signal available on web. */
export async function getDeviceSecurityIssue(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (Constants.appOwnership === AppOwnership.Expo) return null;

  if (JailMonkey.isJailBroken()) {
    return Platform.OS === "ios"
      ? "This device appears to be jailbroken."
      : "This device appears to be rooted.";
  }
  if (Platform.OS === "android" && JailMonkey.AdbEnabled()) {
    return "USB debugging is turned on for this device.";
  }
  if (Platform.OS === "android" && (await JailMonkey.isDevelopmentSettingsMode())) {
    return "Developer options are turned on for this device.";
  }
  if (await JailMonkey.isDebuggedMode()) {
    return "A debugger is attached to this app.";
  }
  if (JailMonkey.hookDetected()) {
    return "This device shows signs of tampering.";
  }
  return null;
}
