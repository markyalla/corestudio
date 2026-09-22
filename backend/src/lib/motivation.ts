// Daily motivation pool. The app Home screen shows one line per calendar day,
// rotating deterministically through the active pool — no per-day row, no
// deletion cron. Studio timezone is Africa/Accra (UTC), so the calendar day
// derived below matches the studio's day.

/** Starter pool seeded on a fresh database. Staff can add/edit/deactivate
 *  these from Admin → Settings → Daily motivation. */
export const STARTER_MOTIVATION: string[] = [
  "Small steps every day add up to big change. Show up today.",
  "You don't have to be extreme, just consistent.",
  "The hardest part is getting on the mat. You've got this.",
  "Progress, not perfection.",
  "Your body can stand almost anything. It's your mind you have to convince.",
  "One class at a time. That's how it's done.",
  "Strong is not a look, it's a feeling. Go earn it today.",
  "The only bad workout is the one you didn't do.",
  "Breathe in strength, breathe out doubt.",
  "You're one session away from a better mood.",
  "Discipline is choosing what you want most over what you want now.",
  "Show up for yourself the way you show up for everyone else.",
  "Every rep is a promise you keep to yourself.",
  "Core strong, mind calm.",
  "You didn't come this far to only come this far.",
  "Consistency beats intensity. Book your next class.",
  "Move today so you can move well for life.",
  "The reformer doesn't care how you feel — it just makes you better.",
  "A little bit of movement is always better than none.",
  "Your future self is watching. Make them proud.",
  "Control the movement, and you control the day.",
  "Stretch your limits, not your excuses.",
  "It never gets easier, you just get stronger.",
  "Balance isn't something you find, it's something you build.",
  "Fall in love with taking care of yourself.",
  "The mat is a judgment-free zone. Just begin.",
  "Energy you spend on a class comes back doubled.",
  "You are allowed to be both a work in progress and a masterpiece.",
  "Ten more minutes on your posture pays off for years.",
  "Today's effort is tomorrow's ease.",
  "Doubt kills more dreams than failure ever will. Just book it.",
  "Slow is smooth, smooth is strong.",
  "Your only competition is who you were yesterday.",
  "Commit to the process and the results will follow.",
  "A calm mind starts with a moved body.",
  "Don't count the classes — make the classes count.",
  "You've never regretted a class you attended.",
  "The habit is the hard part. Protect it.",
  "Deep breath. Long spine. Let's go.",
  "Keep going. Your body is learning even when it feels hard.",
];

/**
 * Picks today's message from a pool, rotating one per calendar day. Returns
 * null for an empty pool.
 */
export function pickForToday<T extends { text: string }>(
  pool: T[],
  now: Date = new Date(),
): string | null {
  if (pool.length === 0) return null;
  const epochDay = Math.floor(now.getTime() / 86_400_000);
  return pool[epochDay % pool.length].text;
}
