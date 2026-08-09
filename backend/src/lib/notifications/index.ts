// NotificationService abstraction — provider selected via SMS_PROVIDER
// ("arkesel" | "hubtel" | "console"). Console logs to stdout for dev.

export interface NotificationService {
  sendSms(to: string, message: string): Promise<void>;
}

class ConsoleNotificationService implements NotificationService {
  async sendSms(to: string, message: string) {
    console.log(`[SMS → ${to}] ${message}`);
  }
}

/** https://developers.arkesel.com/#tag/SMS-V2 */
class ArkeselNotificationService implements NotificationService {
  async sendSms(to: string, message: string) {
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: {
        "api-key": process.env.ARKESEL_API_KEY ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: process.env.SMS_SENDER_ID ?? "CoreStudio",
        message,
        recipients: [to],
      }),
    });
    if (!res.ok) {
      console.error(`Arkesel SMS to ${to} failed: ${res.status} ${await res.text()}`);
    }
  }
}

/** https://developers.hubtel.com/docs/send-sms */
class HubtelNotificationService implements NotificationService {
  async sendSms(to: string, message: string) {
    const auth = Buffer.from(
      `${process.env.HUBTEL_CLIENT_ID}:${process.env.HUBTEL_CLIENT_SECRET}`,
    ).toString("base64");
    const res = await fetch("https://smsc.hubtel.com/v1/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.SMS_SENDER_ID ?? "CoreStudio",
        to,
        content: message,
      }),
    });
    if (!res.ok) {
      console.error(`Hubtel SMS to ${to} failed: ${res.status} ${await res.text()}`);
    }
  }
}

export function getNotificationService(): NotificationService {
  switch (process.env.SMS_PROVIDER ?? "console") {
    case "arkesel":
      return new ArkeselNotificationService();
    case "hubtel":
      return new HubtelNotificationService();
    default:
      return new ConsoleNotificationService();
  }
}
