import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth, useOrganization, useUser } from "@clerk/clerk-react";
import { installTokenRefresh } from "../lib/clerkFetch.js";
import { createAuthRecovery, onAuthFailure, reportAuthFailure } from "../lib/authRecovery.js";
import { callContinuity, installCallNavigationGuard } from "../lib/callContinuity.js";

const AuthContext = createContext({ getToken: async () => null });
let authTokenGetter = async () => null;
export const useAppAuth = () => useContext(AuthContext);
export const getAuthToken = async options => authTokenGetter(options);
const DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";

function ClerkAuthBridge({ children }) {
  const auth = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const { organization, isLoaded: organizationLoaded } = useOrganization();
  const callProtected = useSyncExternalStore(callContinuity.subscribe, callContinuity.getSnapshot, () => false);
  const identity = useRef(null);
  // Freeze only UI/call identity, never a token or server authorization.
  if (!identity.current || (!callProtected && auth.isSignedIn && userLoaded && user)) {
    identity.current = {user, organization, organizationLoaded};
  }
  const retained = callProtected ? identity.current : {user, organization, organizationLoaded};
  const rawAuthRef = useRef(auth);
  rawAuthRef.current = auth;
  const [sessionExpired, setSessionExpired] = useState(false);
  const recoveryRef = useRef(null);
  const getToken = useCallback(async options => {
    try {
      if (callContinuity.getSnapshot() && rawAuthRef.current.userId && rawAuthRef.current.userId !== identity.current?.user?.id) {
        throw new Error('Session changed during the call.');
      }
      const token = await rawAuthRef.current.getToken(options);
      if (!token) throw new Error('Sign in to continue.');
      if (callContinuity.getSnapshot() && !rawAuthRef.current.userId) {
        let subject;
        try { subject = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch { /* Fail closed. */ }
        if (subject !== identity.current?.user?.id) throw new Error('Session changed during the call.');
      }
      return token;
    } catch (error) {
      reportAuthFailure();
      throw error;
    }
  }, []);

  useEffect(() => {
    authTokenGetter = getToken;
    const recovery = createAuthRecovery({
      getToken,
      onChange: setSessionExpired,
      onRecovered: async () => {
        const { refreshClerkSupabaseToken } = await import('../lib/supabase');
        await refreshClerkSupabaseToken();
      },
    });
    recoveryRef.current = recovery;
    const stopFailure = onAuthFailure(() => recovery.fail());
    const stopRefresh = installTokenRefresh({getToken: () => recovery.refresh(), windowTarget: window, documentTarget: document});
    const stopNavigation = installCallNavigationGuard();
    return () => {
      recovery.dispose(); stopFailure(); stopRefresh(); stopNavigation();
      recoveryRef.current = null;
      authTokenGetter = async () => null;
    };
  }, [getToken]);

  useEffect(() => {
    if (auth.isLoaded && callProtected && (!auth.isSignedIn || (auth.userId && auth.userId !== retained?.user?.id))) recoveryRef.current?.fail();
  }, [auth.isLoaded, auth.isSignedIn, auth.userId, callProtected, retained?.user?.id]);

  return <AuthContext.Provider value={{
    getToken, callProtected, sessionExpired,
    isSignedIn: auth.isSignedIn, identityLoaded: callProtected || (auth.isLoaded && userLoaded),
    user: retained?.user, organization: retained?.organization,
    organizationLoaded: callProtected || retained?.organizationLoaded,
  }}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  if (DISABLED) {
    authTokenGetter = async () => null;
    return <AuthContext.Provider value={{getToken: authTokenGetter, identityLoaded: true, isSignedIn: true}}>{children}</AuthContext.Provider>;
  }
  return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
}
