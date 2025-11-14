// Cookie-based demo system for new users
// Shows demo mode by default for new users, remembers when they've seen it

const DEMO_SEEN_COOKIE = 'evercash_demo_seen';
const COOKIE_EXPIRY_DAYS = 365; // Remember for 1 year

export function setCookie(name: string, value: string, days: number = COOKIE_EXPIRY_DAYS) {
  try {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    console.log(`🍪 Cookie set: ${name}=${value}`);
  } catch (e) {
    console.error(`Failed to set cookie ${name}:`, e);
  }
}

export function getCookie(name: string): string | null {
  try {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        const value = c.substring(nameEQ.length, c.length);
        console.log(`🍪 Cookie read: ${name}=${value}`);
        return value;
      }
    }
    console.log(`🍪 Cookie not found: ${name}`);
    return null;
  } catch (e) {
    console.error(`Failed to read cookie ${name}:`, e);
    return null;
  }
}

export function deleteCookie(name: string) {
  try {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    console.log(`🍪 Cookie deleted: ${name}`);
  } catch (e) {
    console.error(`Failed to delete cookie ${name}:`, e);
  }
}

// Check if user has seen demo before
export function hasSeenDemo(): boolean {
  const seen = getCookie(DEMO_SEEN_COOKIE);
  return seen === 'true';
}

// Mark that user has seen demo
export function markDemoAsSeen() {
  setCookie(DEMO_SEEN_COOKIE, 'true', COOKIE_EXPIRY_DAYS);
}

// Check if user should see demo (new user who hasn't seen it yet)
export function shouldShowDemoForNewUser(isAuthenticated: boolean, profile: any): boolean {
  console.log('🍪 shouldShowDemoForNewUser called with:', {
    isAuthenticated,
    profile: profile ? {
      id: profile.id,
      onboarding_completed: profile.onboarding_completed,
      created_at: profile.created_at
    } : null
  });
  
  // Only show demo if:
  // 1. User is authenticated (has signin)
  // 2. User hasn't seen demo before (no demo cookie)
  // 3. User is new or hasn't completed onboarding
  
  if (!isAuthenticated) {
    console.log('🍪 Demo check: Not authenticated, no demo');
    return false;
  }
  
  const hasSeenDemoBefore = hasSeenDemo();
  if (hasSeenDemoBefore) {
    console.log('🍪 Demo check: User has seen demo before, no demo');
    return false;
  }
  
  // Show demo for new users or users who haven't completed onboarding
  const onboardingCompleted = profile?.onboarding_completed;
  const shouldShow = !onboardingCompleted;
  
  console.log('🍪 Demo check decision:', {
    isAuthenticated,
    hasSeenDemoBefore,
    onboardingCompleted,
    shouldShow,
    reasoning: shouldShow ? 'New user - show demo' : 'Experienced user - no demo'
  });
  
  return shouldShow;
}

// Reset demo cookies (for testing/debugging)
export function resetDemoCookies() {
  deleteCookie(DEMO_SEEN_COOKIE);
  console.log('🍪 Demo cookies reset');
}
