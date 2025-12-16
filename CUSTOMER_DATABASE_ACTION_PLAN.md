# Customer Database Management - Action Plan

## Overview
Enable users to save processed Excel data to Supabase, manage their customer database with full CRUD operations, and perform bulk operations.

---

## Phase 1: Database Schema Design

### 1.1 Create Supabase Table: `customers`

**SQL Migration:**
```sql
-- Create customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Core customer data (from Excel)
  name TEXT,
  dob DATE,
  email TEXT,
  phone TEXT,
  location TEXT,
  
  -- Processed data (from OpenAI)
  gender TEXT CHECK (gender IN ('Male', 'Female')),
  ethnicity TEXT CHECK (ethnicity IN ('Malay', 'Chinese', 'Indian', 'Other')),
  age INTEGER,
  prefix TEXT CHECK (prefix IN ('En', 'Pn', 'Cik', 'Tn')),
  first_name TEXT,
  sender_name TEXT,
  save_name TEXT,
  
  -- Additional fields from original Excel
  pg_code TEXT,
  row_number INTEGER,
  
  -- Metadata
  original_data JSONB, -- Store all original Excel columns as JSON
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own customers
CREATE POLICY "Users can view their own customers"
  ON customers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own customers"
  ON customers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own customers"
  ON customers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own customers"
  ON customers FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Action Items:**
- [ ] Run SQL migration in Supabase SQL Editor
- [ ] Verify RLS policies are active
- [ ] Test with a test user account

---

## Phase 2: API Endpoints

### 2.1 Create API Routes

#### `/app/api/customers/route.ts` - List & Create
```typescript
// GET: List all customers for logged-in user
// POST: Create new customer(s)
```

#### `/app/api/customers/[id]/route.ts` - Get, Update, Delete
```typescript
// GET: Get single customer
// PUT: Update customer
// DELETE: Delete customer
```

#### `/app/api/customers/bulk/route.ts` - Bulk Operations
```typescript
// POST: Bulk create customers
// DELETE: Bulk delete customers (by IDs array)
```

**Action Items:**
- [ ] Create `/app/api/customers/route.ts`
- [ ] Create `/app/api/customers/[id]/route.ts`
- [ ] Create `/app/api/customers/bulk/route.ts`
- [ ] Test all endpoints with Postman/Thunder Client

---

## Phase 3: Update Excel Processor Page

### 3.1 Add "Save to Database" Button
- Add button after "Download Excel" button
- Show save progress
- Handle success/error states

### 3.2 Save Processed Data to Supabase
- Call bulk create API endpoint
- Show success message with count
- Option to view saved customers

**Action Items:**
- [ ] Add save button UI
- [ ] Implement `handleSaveToDatabase()` function
- [ ] Add loading/success/error states
- [ ] Test save functionality

---

## Phase 4: Customer Management Page

### 4.1 Create `/app/customers/page.tsx`
- List all customers in table format
- Search/filter functionality
- Pagination
- Bulk selection with checkboxes
- CRUD operations

**Features:**
- View all customers
- Search by name, email, phone
- Filter by gender, ethnicity
- Sort by columns
- Pagination (50 per page)
- Bulk delete selected
- Edit individual customer
- Create new customer
- Export to Excel

**Action Items:**
- [ ] Create customer management page
- [ ] Implement data fetching
- [ ] Add search/filter UI
- [ ] Add table with checkboxes
- [ ] Implement CRUD operations
- [ ] Add pagination
- [ ] Test all features

---

## Phase 5: Customer CRUD Components

### 5.1 Customer Form Component
- Reusable form for Create/Edit
- Validation
- All customer fields

### 5.2 Customer Table Component
- Sortable columns
- Selectable rows
- Action buttons (Edit/Delete)

### 5.3 Customer Dialog/Modal
- Edit customer in modal
- Form validation
- Save/Cancel actions

**Action Items:**
- [ ] Create `CustomerForm.tsx` component
- [ ] Create `CustomerTable.tsx` component
- [ ] Create `CustomerDialog.tsx` component
- [ ] Add form validation
- [ ] Test form submission

---

## Phase 6: Bulk Operations

### 6.1 Bulk Delete
- Select multiple customers with checkboxes
- Confirm dialog before deletion
- Show progress
- Refresh list after deletion

### 6.2 Bulk Export
- Export selected customers to Excel
- Use existing Excel generation API

**Action Items:**
- [ ] Implement bulk delete API call
- [ ] Add confirmation dialog
- [ ] Add bulk export functionality
- [ ] Test bulk operations

---

## Phase 7: Integration & Testing

### 7.1 Excel Processor Integration
- After processing, show "Save to Database" option
- Link to customer management page
- Show count of saved customers

### 7.2 Customer Management Integration
- Link from dashboard
- Navigation between pages
- Breadcrumbs

**Action Items:**
- [ ] Add navigation links
- [ ] Update dashboard with customer count
- [ ] Test full workflow
- [ ] Fix any bugs

---

## Phase 8: UI/UX Enhancements

### 8.1 Loading States
- Skeleton loaders
- Progress indicators
- Optimistic updates

### 8.2 Error Handling
- User-friendly error messages
- Retry mechanisms
- Validation feedback

### 8.3 Success Feedback
- Toast notifications
- Success animations
- Confirmation messages

**Action Items:**
- [ ] Add loading states
- [ ] Improve error messages
- [ ] Add success animations
- [ ] Test user experience

---

## Implementation Order

1. **Database Setup** (Phase 1)
   - Create table
   - Set up RLS policies
   - Test with SQL queries

2. **API Endpoints** (Phase 2)
   - Create all API routes
   - Test with API client
   - Verify authentication

3. **Save to Database** (Phase 3)
   - Add save button to Excel processor
   - Implement save functionality
   - Test save flow

4. **Customer Management Page** (Phase 4)
   - Create page structure
   - Implement data fetching
   - Add basic table

5. **CRUD Operations** (Phase 5)
   - Create form components
   - Implement create/edit/delete
   - Test all operations

6. **Bulk Operations** (Phase 6)
   - Add checkboxes
   - Implement bulk delete
   - Add bulk export

7. **Integration** (Phase 7)
   - Connect all pieces
   - Test full workflow
   - Fix integration issues

8. **Polish** (Phase 8)
   - Improve UI/UX
   - Add loading states
   - Enhance error handling

---

## Database Schema Details

### Table: `customers`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY | Auto-generated UUID |
| user_id | UUID | NOT NULL, FK to auth.users | Owner of the customer record |
| name | TEXT | | Full name from Excel |
| dob | DATE | | Date of birth |
| email | TEXT | | Email address |
| phone | TEXT | | Phone number |
| location | TEXT | | Location/address |
| gender | TEXT | CHECK (Male/Female) | Processed gender |
| ethnicity | TEXT | CHECK (Malay/Chinese/Indian/Other) | Processed ethnicity |
| age | INTEGER | | Calculated age |
| prefix | TEXT | CHECK (En/Pn/Cik/Tn) | Title prefix |
| first_name | TEXT | | Extracted first name |
| sender_name | TEXT | | Prefix + FirstName |
| save_name | TEXT | | PGCode - SenderName |
| pg_code | TEXT | | Public Gold code |
| row_number | INTEGER | | Original row number |
| original_data | JSONB | | All original Excel columns |
| created_at | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

### Indexes
- `idx_customers_user_id` - Fast user queries
- `idx_customers_email` - Fast email lookups
- `idx_customers_phone` - Fast phone lookups
- `idx_customers_created_at` - Fast date sorting

### RLS Policies
- Users can only SELECT their own customers
- Users can only INSERT customers with their user_id
- Users can only UPDATE their own customers
- Users can only DELETE their own customers

---

## API Endpoints Specification

### GET `/api/customers`
**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `search` (optional): Search term (searches name, email, phone)
- `gender` (optional): Filter by gender
- `ethnicity` (optional): Filter by ethnicity
- `sortBy` (optional): Column to sort by (default: created_at)
- `sortOrder` (optional): asc or desc (default: desc)

**Response:**
```json
{
  "data": [...customers],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "totalPages": 3
  }
}
```

### POST `/api/customers`
**Body:**
```json
{
  "customers": [
    {
      "name": "...",
      "dob": "...",
      "email": "...",
      // ... other fields
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "ids": ["uuid1", "uuid2", ...]
}
```

### GET `/api/customers/[id]`
**Response:**
```json
{
  "id": "uuid",
  "name": "...",
  // ... all fields
}
```

### PUT `/api/customers/[id]`
**Body:**
```json
{
  "name": "...",
  "email": "...",
  // ... fields to update
}
```

**Response:**
```json
{
  "success": true,
  "customer": {...}
}
```

### DELETE `/api/customers/[id]`
**Response:**
```json
{
  "success": true,
  "message": "Customer deleted"
}
```

### POST `/api/customers/bulk`
**Body:**
```json
{
  "customers": [...]
}
```

**Response:**
```json
{
  "success": true,
  "count": 50,
  "ids": [...]
}
```

### DELETE `/api/customers/bulk`
**Body:**
```json
{
  "ids": ["uuid1", "uuid2", ...]
}
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "message": "5 customers deleted"
}
```

---

## Component Structure

```
app/
├── customers/
│   └── page.tsx              # Customer management page
├── components/
│   ├── CustomerTable.tsx      # Customer table with checkboxes
│   ├── CustomerForm.tsx       # Create/Edit form
│   ├── CustomerDialog.tsx     # Edit modal
│   └── CustomerFilters.tsx    # Search/filter component
└── api/
    └── customers/
        ├── route.ts           # List & Create
        ├── [id]/
        │   └── route.ts       # Get, Update, Delete
        └── bulk/
            └── route.ts       # Bulk operations
```

---

## Testing Checklist

### Database
- [ ] Table created successfully
- [ ] RLS policies working
- [ ] User can only see their own data
- [ ] Indexes improve query performance

### API Endpoints
- [ ] GET /api/customers returns user's customers
- [ ] POST /api/customers creates customers
- [ ] GET /api/customers/[id] returns single customer
- [ ] PUT /api/customers/[id] updates customer
- [ ] DELETE /api/customers/[id] deletes customer
- [ ] POST /api/customers/bulk creates multiple customers
- [ ] DELETE /api/customers/bulk deletes multiple customers
- [ ] All endpoints require authentication
- [ ] All endpoints respect RLS policies

### Excel Processor Integration
- [ ] "Save to Database" button appears after processing
- [ ] Save button saves all processed data
- [ ] Success message shows count
- [ ] Error handling works correctly

### Customer Management Page
- [ ] Page loads customer list
- [ ] Search functionality works
- [ ] Filters work correctly
- [ ] Pagination works
- [ ] Table displays all columns
- [ ] Checkboxes work for selection
- [ ] Bulk delete works
- [ ] Create customer works
- [ ] Edit customer works
- [ ] Delete customer works
- [ ] Export to Excel works

### UI/UX
- [ ] Loading states show during operations
- [ ] Error messages are user-friendly
- [ ] Success messages appear
- [ ] Forms validate input
- [ ] Mobile responsive
- [ ] Smooth animations

---

## Estimated Timeline

- **Phase 1 (Database)**: 1-2 hours
- **Phase 2 (API)**: 3-4 hours
- **Phase 3 (Save)**: 1-2 hours
- **Phase 4 (Page)**: 4-5 hours
- **Phase 5 (CRUD)**: 3-4 hours
- **Phase 6 (Bulk)**: 2-3 hours
- **Phase 7 (Integration)**: 2-3 hours
- **Phase 8 (Polish)**: 2-3 hours

**Total**: ~18-26 hours

---

## Next Steps

1. Start with Phase 1: Create database table
2. Then Phase 2: Build API endpoints
3. Then Phase 3: Add save functionality
4. Continue with remaining phases


