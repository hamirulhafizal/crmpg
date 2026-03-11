-- Add a human-readable title for each scheduled message (e.g. "Birthday", "Hari Raya wish").
ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS title TEXT;

