-- Tag-triggered funnels (added after 0007 had already been applied in production; never edit applied migrations).
ALTER TABLE funnels ADD COLUMN trigger_tag TEXT;
