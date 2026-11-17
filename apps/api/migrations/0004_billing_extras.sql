-- Add-on packs bought in Checkout (each pack = +50,000 emails/month, +5,000/day) and billing interval.
ALTER TABLE accounts ADD COLUMN extra_packs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN billing_interval TEXT;
