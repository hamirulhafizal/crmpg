# Dealer Rotation System Documentation

## Overview
The dealer rotation system ensures equal distribution of leads among dealers using a round-robin (rotating) approach. This prevents any single dealer from receiving too many leads while ensuring all dealers get their fair share.

## How It Works

### 1. Lead Distribution Logic
- Each dealer has a `lead_email` boolean field in the database
- `lead_email: false` = dealer is available for leads
- `lead_email: true` = dealer has received a lead and is not available

### 2. Rotation Process
1. **Form Submission**: When a user submits a form, it's sent to the FIRST dealer with `lead_email: false`
2. **Status Update**: After successful submission, that dealer's `lead_email` is set to `true`
3. **Next Rotation**: The next form submission goes to the NEXT dealer with `lead_email: false`
4. **Continue**: This continues until all dealers have `lead_email: true`

### 3. Cycle Reset
- When all dealers have `lead_email: true`, the system automatically resets all to `false`
- This starts a new rotation cycle, ensuring equal distribution continues indefinitely

## Code Implementation

### Key Functions

#### `findNextAvailableDealer()`
```typescript
const findNextAvailableDealer = useCallback(() => {
  // Find the first dealer with lead_email: false
  const availableDealer = allAgents.find(agent => !agent.lead_email);
  
  if (availableDealer) {
    return availableDealer;
  }

  // If all dealers have lead_email: true, reset all to false
  const resetAgents = allAgents.map(agent => ({ ...agent, lead_email: false }));
  setAllAgents(resetAgents);
  
  // Reset in database
  resetAllDealersLeadStatus();
  
  // Return first dealer after reset
  return resetAgents[0];
}, [allAgents, resetAllDealersLeadStatus]);
```

#### `handleSubmit()`
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  // ... form submission logic ...
  
  if (result.success) {
    // Mark current dealer as completed
    setAllAgents(prevAgents => 
      prevAgents.map(agent => 
        agent.email === dealerInfo.email 
          ? { ...agent, lead_email: true }
          : agent
      )
    );

    // Update database
    await fetch('/api/update-dealer-lead-status', {
      method: 'POST',
      body: JSON.stringify({ dealerEmail: dealerInfo.email }),
    });

    // Rotate to next dealer
    const nextDealer = findNextAvailableDealer();
    if (nextDealer) {
      setDealerInfo({...nextDealer});
    }
  }
};
```

## API Endpoints

### 1. Update Dealer Lead Status
**Endpoint**: `/api/update-dealer-lead-status`
**Method**: POST
**Purpose**: Sets a specific dealer's `lead_email` to `true`

### 2. Reset All Dealers Lead Status
**Endpoint**: `/api/reset-all-dealers-lead-status`
**Method**: POST
**Purpose**: Resets all dealers' `lead_email` to `false` when rotation cycle completes

## Database Schema

The system expects dealers to have this structure:
```typescript
interface Agent {
  username: string;
  name: string;
  email: string;
  lead_email: boolean;  // Key field for rotation
  // ... other fields
}
```

## Testing and Debugging

### Debug Functions

1. **`debugDealerRotation()`**: Shows current rotation status in console
2. **`testDealerRotation()`**: Simulates one form submission and rotation
3. **`testMultipleRotations()`**: Simulates full rotation cycle
4. **`advanceToNextDealer()`**: Manually advances to next dealer
5. **`getCurrentRotationStatus()`**: Returns current rotation statistics

### UI Monitoring
The system includes a visual interface showing:
- Current dealer information
- Rotation progress bar
- Available vs. completed dealer counts
- Warning when cycle is about to reset

## Example Rotation Flow

```
Initial State:
- Dealer A: lead_email = false (available)
- Dealer B: lead_email = false (available)  
- Dealer C: lead_email = false (available)

Form 1 submitted → Dealer A receives lead
- Dealer A: lead_email = true (completed)
- Dealer B: lead_email = false (available)
- Dealer C: lead_email = false (available)

Form 2 submitted → Dealer B receives lead
- Dealer A: lead_email = true (completed)
- Dealer B: lead_email = true (completed)
- Dealer C: lead_email = false (available)

Form 3 submitted → Dealer C receives lead
- Dealer A: lead_email = true (completed)
- Dealer B: lead_email = true (completed)
- Dealer C: lead_email = true (completed)

All dealers completed → System resets all to false
- Dealer A: lead_email = false (available)
- Dealer B: lead_email = false (available)
- Dealer C: lead_email = false (available)

New cycle begins...
```

## Benefits

1. **Equal Distribution**: Every dealer gets the same number of leads over time
2. **Automatic Rotation**: No manual intervention required
3. **Fair System**: Prevents favoritism or overload of specific dealers
4. **Scalable**: Works with any number of dealers
5. **Resilient**: Handles database failures gracefully
6. **Transparent**: Easy to monitor and debug

## Monitoring

- Check browser console for detailed rotation logs
- Use UI buttons to test rotation manually
- Monitor database for `lead_email` field changes
- Watch for automatic cycle resets

## Troubleshooting

### Common Issues

1. **Dealer not rotating**: Check if `lead_email` field is being updated in database
2. **All dealers showing as completed**: System should automatically reset - check logs
3. **Rotation skipping dealers**: Verify dealer data structure and `lead_email` field

### Debug Steps

1. Open browser console and look for rotation logs
2. Use `debugDealerRotation()` function
3. Check database for `lead_email` field values
4. Verify API endpoints are working correctly
5. Test with `testMultipleRotations()` function

## Future Enhancements

Potential improvements could include:
- Weighted rotation based on dealer performance
- Time-based rotation (daily/weekly cycles)
- Lead type filtering (different rotation for different lead types)
- Analytics dashboard for rotation statistics
- Email notifications when rotation cycles complete 