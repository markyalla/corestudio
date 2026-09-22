-- Month-scoped recurring classes: each RecurrenceRule can be bounded to a
-- calendar month (or any date range). NULL/NULL keeps the previous "recurs
-- forever" behaviour, so existing rows are unaffected.
ALTER TABLE "RecurrenceRule" ADD COLUMN "validFrom" TIMESTAMP(3);
ALTER TABLE "RecurrenceRule" ADD COLUMN "validUntil" TIMESTAMP(3);
