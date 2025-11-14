# 🍪 Cookie-Based Demo System for New Users

## Overview
This system ensures new users see a populated demo instead of empty real data, giving them a great first impression of what Evercash can do.

## How It Works

### For New Users (First Visit):
1. **User signs in** → Has signin cookie but NO demo cookie
2. **Auto-loads demo mode** → Shows populated demo data immediately
3. **User explores** → Sees transactions, budgets, goals, etc.
4. **User clicks "Exit demo"** → Demo cookie is set, real data loads

### For Returning Users:
1. **User signs in** → Has both signin cookie AND demo cookie
2. **Loads real data** → No demo mode, goes straight to their actual data

## Cookie Details

- **Cookie Name**: `evercash_demo_seen`
- **Value**: `'true'` when user has seen demo
- **Expiry**: 365 days
- **Path**: `/` (site-wide)
- **SameSite**: `Lax` (secure)

## Key Functions

### `shouldShowDemoForNewUser(isAuthenticated, profile)`
Determines if demo should auto-load:
- ✅ User is authenticated (has signin)
- ✅ User hasn't seen demo before (no demo cookie)
- ✅ User is new (onboarding not completed)

### `markDemoAsSeen()`
Sets the demo cookie when:
- User clicks "Exit demo"
- User clicks "Skip for now" in demo prompt

### `hasSeenDemo()`
Checks if user has demo cookie

## User Experience Flow

```
New User Journey:
Sign In → Auto Demo Mode → Exit Demo → Real Data + Cookie Set

Returning User Journey:
Sign In → Real Data (Cookie Exists)
```

## Benefits

1. **Great First Impression**: New users see a populated app immediately
2. **No Blank State**: Eliminates confusing empty screens
3. **Persistent Memory**: Cookie remembers user preference across sessions
4. **Smooth Transition**: Clear path from demo to real data

## Testing & Debugging

### Console Commands:
```javascript
// Reset everything for testing
window.resetDemo()

// Check current state
window.checkDemoState()
```

### Manual Testing:
1. **Test New User Flow**:
   - Clear cookies and localStorage
   - Sign in → Should auto-load demo
   - Click "Exit demo" → Should load real data and set cookie

2. **Test Returning User Flow**:
   - Keep cookies
   - Sign in → Should load real data directly (no demo)

### Console Logs to Watch:
```
🍪 Demo system check: { userEmail, isAuthenticated, hasSeenDemoBefore, shouldShowDemo }
🍪 Auto-enabling demo for new user
🍪 EXIT DEMO: Marked demo as seen in cookies
🍪 Cookie set: evercash_demo_seen=true
```

## Implementation Files

- **`src/lib/demo-cookies.ts`** - Cookie management functions
- **`src/App.tsx`** - Main demo system logic
- **`src/lib/demo-overlay.ts`** - Demo data overlay (existing)
- **`src/components/DemoBanner.tsx`** - Exit demo button (existing)

## Edge Cases Handled

1. **Cookie disabled browsers** - Falls back to localStorage flags
2. **Profile not loaded yet** - Waits for profile before deciding
3. **Authentication in progress** - Waits for auth to complete
4. **Multiple tabs** - Cookie is shared across tabs
5. **Incognito mode** - Works but cookies reset on close

## Migration from Old System

The new system is **fully backward compatible**:
- Existing `onboarding_completed` flags still work
- Demo prompt still shows for edge cases
- All existing demo functionality preserved

## Security & Privacy

- **No personal data** stored in cookies
- **Minimal data** - just a boolean flag
- **Standard expiry** - 365 days
- **Secure defaults** - SameSite=Lax, Path=/
