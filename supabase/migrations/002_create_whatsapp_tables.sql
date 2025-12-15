-- Create whatsapp_connections table
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- WhatsApp Device Info
  sender_number TEXT NOT NULL, -- WhatsApp number (e.g., 60162888xxxx)
  device_status TEXT CHECK (device_status IN ('Connected', 'Disconnected', 'Connecting', 'Failed')) DEFAULT 'Disconnected',
  
  -- API Configuration
  api_key TEXT NOT NULL, -- User's API key
  
  -- Connection Metadata
  last_connected_at TIMESTAMP WITH TIME ZONE,
  last_disconnected_at TIMESTAMP WITH TIME ZONE,
  qr_code_data TEXT, -- Base64 QR code (temporary)
  qr_code_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Statistics
  messages_sent INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_user_sender UNIQUE (user_id, sender_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_user_id ON whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_status ON whatsapp_connections(device_status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_sender_number ON whatsapp_connections(sender_number);

-- Enable RLS
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own WhatsApp connections"
  ON whatsapp_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WhatsApp connections"
  ON whatsapp_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own WhatsApp connections"
  ON whatsapp_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WhatsApp connections"
  ON whatsapp_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_connections_updated_at
  BEFORE UPDATE ON whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create birthday_messages table
CREATE TABLE IF NOT EXISTS birthday_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  whatsapp_connection_id UUID NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  
  -- Message Details
  recipient_number TEXT NOT NULL,
  message_sent TEXT,
  message_status TEXT CHECK (message_status IN ('sent', 'failed', 'pending')) DEFAULT 'pending',
  
  -- Birthday Info
  birthday_date DATE NOT NULL,
  sent_year INTEGER NOT NULL, -- Store year separately for unique constraint
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints - Prevent duplicate messages for same birthday in same year
  CONSTRAINT unique_birthday_message UNIQUE (user_id, customer_id, birthday_date, sent_year)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_birthday_messages_user_id ON birthday_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_customer_id ON birthday_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_birthday_date ON birthday_messages(birthday_date);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_sent_at ON birthday_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_status ON birthday_messages(message_status);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_sent_year ON birthday_messages(sent_year);

-- Function to automatically set sent_year from sent_at
CREATE OR REPLACE FUNCTION set_birthday_message_year()
RETURNS TRIGGER AS $$
BEGIN
  NEW.sent_year := EXTRACT(YEAR FROM NEW.sent_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-set sent_year
CREATE TRIGGER set_birthday_message_sent_year
  BEFORE INSERT OR UPDATE ON birthday_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_birthday_message_year();

-- Enable RLS
ALTER TABLE birthday_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own birthday messages"
  ON birthday_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own birthday messages"
  ON birthday_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create whatsapp_settings table for user preferences
CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Scheduling
  auto_send_enabled BOOLEAN DEFAULT true,
  send_time TIME DEFAULT '08:00:00', -- Default 8 AM Malaysia time
  timezone TEXT DEFAULT 'Asia/Kuala_Lumpur',
  
  -- Message Template
  default_template TEXT DEFAULT 'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_user_id ON whatsapp_settings(user_id);

-- Enable RLS
ALTER TABLE whatsapp_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own WhatsApp settings"
  ON whatsapp_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WhatsApp settings"
  ON whatsapp_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own WhatsApp settings"
  ON whatsapp_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_whatsapp_settings_updated_at
  BEFORE UPDATE ON whatsapp_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
