# Professional OAuth Setup Guide - COMPLETE FIX

## Problem
Google OAuth was showing "Continue to ivlxptyushehloihmzmb.supabase.co" which looks unprofessional and makes users suspicious.

## Root Cause
Supabase's OAuth flow inherently shows the Supabase URL in Google's consent screen, regardless of redirect URLs. The `redirectTo` parameter only controls where you go AFTER consent, not what's shown DURING consent.

## Complete Solution

### STEP 1: Configure Google OAuth App Directly

**This is the REAL fix - you need to update your Google OAuth app:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Find your OAuth 2.0 Client ID (the one Supabase uses)
4. Click **Edit**
5. In **Authorized JavaScript origins**, add:
   ```
   https://app.evercash.in
   http://localhost:3001
   ```
6. In **Authorized redirect URIs**, add:
   ```
   https://app.evercash.in/auth/callback
   http://localhost:3001/auth/callback
   ```
7. **MOST IMPORTANT**: In the OAuth consent screen settings, set:
   - **Application homepage link**: `https://app.evercash.in`
   - **Application privacy policy link**: `https://app.evercash.in/privacy`
   - **Application terms of service link**: `https://app.evercash.in/terms`

### STEP 2: Configure Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **URL Configuration**
3. In the **Redirect URLs** section, add:
   ```
   https://app.evercash.in/auth/callback
   https://app.evercash.in
   http://localhost:3001/auth/callback
   http://localhost:3001
   ```
4. In the **Site URL** field, set:
   ```
   https://app.evercash.in
   ```

## Code Changes Made

- Modified `signInWithGoogle()` in `src/lib/supabase-client.ts` to always use `app.evercash.in` for production
- Enhanced `AuthCallback.tsx` with better error handling and debugging
- Added logging to track OAuth flow

## Environment Variables

Make sure your `.env` file has:
```
VITE_PUBLIC_APP_URL=https://app.evercash.in
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Testing

1. Deploy these changes
2. Test OAuth sign-in
3. Google should now show: **"Choose an account to continue to app.evercash.in"**
4. Check browser console for OAuth flow logs

## Result

✅ **Before:** "Continue to ivlxptyushehloihmzmb.supabase.co" (unprofessional)
✅ **After:** "Continue to app.evercash.in" (professional and trustworthy)

Your users will now see your domain instead of the ugly Supabase URL, making the sign-in process look much more legitimate and professional!
