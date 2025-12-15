# WhatsApp Services - Birthday Automation Action Plan

## Overview
Add a WhatsApp Services tool to automate birthday wishes to customers. Users must connect their WhatsApp account before using the service.

---

## Phase 1: Database Schema Design

### 1.1 Create Supabase Table: `whatsapp_connections`

**Purpose**: Store WhatsApp device connection info per user

**SQL Migration:**
```sql
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- WhatsApp Device Info
  sender_number TEXT NOT NULL, -- WhatsApp number (e.g., 60162888xxxx)
  device_status TEXT CHECK (device_status IN ('Connected', 'Disconnected', 'Connecting', 'Failed')),
  
  -- API Configuration
  api_key TEXT, -- User's API key (can be shared or per-user)
  
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_user_id ON whatsapp_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_connections_status ON whatsapp_connections(device_status);

-- RLS Policies
ALTER TABLE whatsapp_connections ENABLE ROW LEVEL SECURITY;

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
```

### 1.2 Create Supabase Table: `birthday_messages`

**Purpose**: Track sent birthday messages to prevent duplicates

**SQL Migration:**
```sql
CREATE TABLE IF NOT EXISTS birthday_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  whatsapp_connection_id UUID NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  
  -- Message Details
  recipient_number TEXT NOT NULL,
  message_sent TEXT,
  message_status TEXT CHECK (message_status IN ('sent', 'failed', 'pending')),
  
  -- Birthday Info
  birthday_date DATE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_birthday_message UNIQUE (user_id, customer_id, birthday_date, DATE_TRUNC('year', sent_at))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_birthday_messages_user_id ON birthday_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_customer_id ON birthday_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_birthday_date ON birthday_messages(birthday_date);
CREATE INDEX IF NOT EXISTS idx_birthday_messages_sent_at ON birthday_messages(sent_at);

-- RLS Policies
ALTER TABLE birthday_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own birthday messages"
  ON birthday_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own birthday messages"
  ON birthday_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

**Action Items:**
- [ ] Create `whatsapp_connections` table migration
- [ ] Create `birthday_messages` table migration
- [ ] Run migrations in Supabase
- [ ] Verify RLS policies

---

## Phase 2: Environment Configuration

### 2.1 Add Environment Variables

**Required:**
```env
# WhatsApp API Configuration
WHATSAPP_API_ENDPOINT=https://ustazai.my/
WHATSAPP_API_KEY=kPow7uZLfxBof0b6aqbFVv4Ac582ll
```

**Optional (for per-user API keys):**
- Store in database instead of env (if users have their own API keys)

**Action Items:**
- [ ] Add environment variables to `.env.local`
- [ ] Document in README or setup guide
- [ ] Add to deployment configuration

---

## Phase 3: API Endpoints

### 3.1 WhatsApp Connection Endpoints

#### `POST /api/whatsapp/generate-qr`
- Generate QR code for WhatsApp connection
- Parameters: `sender_number` (user's WhatsApp number)
- Returns: QR code base64 or connection status
- Polling mechanism for QR code generation

#### `GET /api/whatsapp/status`
- Check WhatsApp connection status
- Returns: Connection status, device info

#### `POST /api/whatsapp/disconnect`
- Disconnect WhatsApp device
- Clears connection from database

#### `GET /api/whatsapp/check-connection`
- Check if user has active WhatsApp connection
- Returns: Boolean + connection details

**Action Items:**
- [ ] Create `/app/api/whatsapp/generate-qr/route.ts`
- [ ] Create `/app/api/whatsapp/status/route.ts`
- [ ] Create `/app/api/whatsapp/disconnect/route.ts`
- [ ] Create `/app/api/whatsapp/check-connection/route.ts`
- [ ] Test all endpoints

### 3.2 Birthday Message Endpoints

#### `GET /api/birthday/upcoming`
- Get customers with upcoming birthdays
- Parameters: `days` (default: 7), `date` (optional)
- Returns: List of customers with birthdays

#### `POST /api/birthday/send`
- Send birthday message to single customer
- Parameters: `customer_id`, `message` (optional custom message)
- Returns: Success/failure status

#### `POST /api/birthday/send-bulk`
- Send birthday messages to multiple customers
- Parameters: `customer_ids[]`, `message_template` (optional)
- Returns: Success count, failure count, details

#### `GET /api/birthday/history`
- Get sent birthday messages history
- Parameters: `date_from`, `date_to`, `page`, `limit`
- Returns: Paginated list of sent messages

**Action Items:**
- [ ] Create `/app/api/birthday/upcoming/route.ts`
- [ ] Create `/app/api/birthday/send/route.ts`
- [ ] Create `/app/api/birthday/send-bulk/route.ts`
- [ ] Create `/app/api/birthday/history/route.ts`
- [ ] Test all endpoints

---

## Phase 4: WhatsApp Connection UI

### 4.1 Create WhatsApp Services Page

**Route**: `/app/whatsapp-services/page.tsx`

**Features:**
1. **Connection Status Card**
   - Show current connection status
   - Display connected device number
   - "Disconnect" button if connected
   - "Connect WhatsApp" button if not connected

2. **QR Code Connection Flow**
   - Input field for WhatsApp number
   - "Generate QR Code" button
   - QR code display (with polling)
   - Status messages (Processing, Scan QR, Connected, Failed)
   - Auto-refresh connection status after scanning

3. **Connection Info**
   - Device number
   - Connection status
   - Last connected time
   - Messages sent count

**Action Items:**
- [ ] Create `/app/whatsapp-services/page.tsx`
- [ ] Implement QR code generation UI
- [ ] Implement polling mechanism
- [ ] Add connection status display
- [ ] Add disconnect functionality
- [ ] Test connection flow

---

## Phase 5: Birthday Automation UI

### 5.1 Birthday Management Section

**Features:**
1. **Upcoming Birthdays List**
   - Show customers with birthdays in next 7 days (configurable)
   - Display: SenderName, Birthday Date, Phone, Age
   - Checkbox selection for bulk send
   - "Send All" button

2. **Today's Birthdays**
   - Highlight customers with birthdays today
   - Quick send button

3. **Message Template Editor**
   - Default template: "Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂"
   - Customizable message template
   - Variables: {Name}, {Age}, {SenderName}, {SaveName}
   - Preview message

4. **Send Birthday Message**
   - Single customer send
   - Bulk send (selected customers)
   - Show sending progress
   - Success/failure notifications

5. **Message History**
   - View sent birthday messages
   - Filter by date range
   - Show message content, recipient, status

**Action Items:**
- [ ] Add birthday section to WhatsApp Services page
- [ ] Create upcoming birthdays component
- [ ] Create message template editor
- [ ] Implement send functionality
- [ ] Add message history view
- [ ] Test birthday automation

---

## Phase 6: Integration & Automation

### 6.1 Scheduled Birthday Checks (Optional)

**Option A: Client-side (on page load)**
- Check for today's birthdays when user opens WhatsApp Services page
- Show notification if birthdays found

**Option B: Server-side Cron Job**
- Daily cron job to check birthdays
- Auto-send messages (if enabled)
- Send email notification to user

**Action Items:**
- [ ] Decide on automation approach
- [ ] Implement daily birthday check
- [ ] Add auto-send option (user preference)
- [ ] Test scheduled automation

### 6.2 Dashboard Integration

- Add WhatsApp Services link to dashboard
- Show connection status badge
- Show today's birthdays count
- Quick access to send birthday messages

**Action Items:**
- [ ] Add WhatsApp Services link to dashboard
- [ ] Add connection status indicator
- [ ] Add birthday count badge
- [ ] Test dashboard integration

---

## Phase 7: Message Template System

### 7.1 Default Templates

**Malay Template:**
```
Selamat Hari Jadi, {Name}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂
```

**English Template:**
```
Happy Birthday, {Name}! Wishing you a long life, prosperity, and happiness! 🎉🎂
```

**Custom Template:**
- User can create custom templates
- Support variables: {Name}, {Age}, {SenderName}, {SaveName}, {PGCode}

### 7.2 Template Storage

- Store in database: `user_message_templates` table
- Or store in user metadata (Supabase)
- Allow multiple templates per user

**Action Items:**
- [ ] Create message template system
- [ ] Add template editor UI
- [ ] Implement variable replacement
- [ ] Test template rendering

---

## Phase 8: Error Handling & Validation

### 8.1 Validation Rules

1. **Phone Number Validation**
   - Format: 60123456789 (Malaysia format)
   - Must start with 60
   - Minimum 10 digits

2. **WhatsApp Connection**
   - Must be connected before sending messages
   - Check connection status before each send
   - Handle disconnection gracefully

3. **Customer Data**
   - Must have phone number
   - Must have date of birth
   - Validate phone format before sending

### 8.2 Error Handling

- API failures (WhatsApp API down)
- Invalid phone numbers
- Connection lost during send
- Rate limiting
- Duplicate message prevention

**Action Items:**
- [ ] Add phone number validation
- [ ] Add connection status checks
- [ ] Implement error handling
- [ ] Add retry mechanism
- [ ] Add user-friendly error messages

---

## Phase 9: Security & Privacy

### 9.1 Data Protection

- Store API keys securely (encrypted or env vars)
- RLS policies for all tables
- User can only access their own connections/messages
- Phone numbers stored securely

### 9.2 Rate Limiting

- Limit messages per day per user
- Prevent spam
- Queue system for bulk sends

**Action Items:**
- [ ] Review security measures
- [ ] Implement rate limiting
- [ ] Add message queue system
- [ ] Test security policies

---

## Phase 10: Testing & Documentation

### 10.1 Testing Checklist

- [ ] WhatsApp connection flow (QR code generation)
- [ ] Connection status checking
- [ ] Disconnect functionality
- [ ] Birthday detection (today, upcoming)
- [ ] Single message send
- [ ] Bulk message send
- [ ] Message template rendering
- [ ] Error handling
- [ ] Duplicate prevention
- [ ] Message history
- [ ] Mobile responsiveness

### 10.2 Documentation

- [ ] User guide for WhatsApp connection
- [ ] Birthday automation guide
- [ ] Message template guide
- [ ] Troubleshooting guide
- [ ] API documentation

**Action Items:**
- [ ] Write user documentation
- [ ] Create setup guide
- [ ] Add troubleshooting section
- [ ] Test all features

---

## Implementation Order

1. **Database Setup** (Phase 1)
   - Create tables
   - Set up RLS policies
   - Test database operations

2. **Environment Setup** (Phase 2)
   - Add environment variables
   - Configure API endpoints

3. **API Endpoints** (Phase 3)
   - WhatsApp connection APIs
   - Birthday message APIs
   - Test all endpoints

4. **WhatsApp Connection UI** (Phase 4)
   - Create WhatsApp Services page
   - Implement QR code flow
   - Test connection

5. **Birthday Automation UI** (Phase 5)
   - Add birthday management
   - Implement send functionality
   - Test automation

6. **Integration** (Phase 6)
   - Dashboard integration
   - Scheduled checks (optional)

7. **Polish** (Phases 7-10)
   - Message templates
   - Error handling
   - Security
   - Testing
   - Documentation

---

## Key Considerations

### WhatsApp API Limitations
- Unofficial API (may have rate limits)
- WhatsApp Business less stable (use regular WhatsApp)
- QR code expires (need polling)
- Connection can drop (need reconnection)

### Birthday Detection Logic
- Parse DOB from customers table
- Handle different date formats
- Calculate age dynamically
- Handle leap years (Feb 29)

### Message Sending Strategy
- Queue system for bulk sends
- Rate limiting to avoid spam
- Retry failed messages
- Track sent messages to prevent duplicates

### User Experience
- Clear connection status
- Progress indicators for bulk sends
- Success/failure notifications
- Message preview before sending
- Easy template customization

---

## Estimated Timeline

- **Phase 1 (Database)**: 1-2 hours
- **Phase 2 (Environment)**: 30 minutes
- **Phase 3 (API)**: 4-5 hours
- **Phase 4 (Connection UI)**: 3-4 hours
- **Phase 5 (Birthday UI)**: 4-5 hours
- **Phase 6 (Integration)**: 2-3 hours
- **Phase 7-10 (Polish)**: 3-4 hours

**Total**: ~18-24 hours

---

## Next Steps

1. Review and approve this action plan
2. Start with Phase 1: Database setup
3. Continue with remaining phases in order
4. Test thoroughly before production

---

## Questions to Clarify

1. **API Key**: Should each user have their own API key, or use shared key from env? - ans : user have their own API KEY
2. **Auto-send**: Should messages be sent automatically daily, or only manually? - ANS : 
AUTOMATICALLY trigger (based on user set time, default is 8am malaysia time )
3. **Message Template**: Default language (Malay/English) or both?
and: default is malay
4. **Rate Limiting**: How many messages per day per user?
ans: all customer that today birthday
5. **Scheduling**: Should we implement server-side cron jobs or client-side only?
ans: try use vercel cron job 
