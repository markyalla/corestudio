-- Help-desk contact info: a shared studio-wide email/WhatsApp, plus a
-- front-desk phone number per location, all shown to members in the app.
ALTER TABLE "Studio" ADD COLUMN "contactEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Studio" ADD COLUMN "whatsapp" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Location" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';
