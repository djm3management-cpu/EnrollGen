import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth, useOrganization, useUser } from "@clerk/clerk-react";
import { installTokenRefresh } from "../lib/clerkFetch.js";
import { createAuthRecovery, onAuthFailure, reportAuthFailure } from "../lib/authRecovery.js";
import { callContinuity, installCallNavigationGuard } from "../lib/callContinuity.js";

const AuthContext = createContext({ getToken: async () => null });
let authTokenGetter = async () => null;
export const useAppAuth = () => useContext(AuthContext);
export const getAuthToken = async options => authTokenGetter(options);

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
  // A document reload discards every module cache, pending request, singleton,
  // token client, and React tree before another identity can mount. Defer only
  // for an already-owned call, preserving the existing call-auth safeguards.
  const documentIdentity = useRef(auth.userId || null);
  if (!documentIdentity.current && auth.userId) documentIdentity.current = auth.userId;
  const identityChanged = Boolean(documentIdentity.current && auth.isLoaded && !callProtected && documentIdentity.current !== auth.userId);
  useEffect(() => {
    if (!identityChanged) return;
    clearIdentityBrowserState(window);
    window.location?.reload();
  }, [identityChanged]);

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
  }}>{identityChanged ? null : children}</AuthContext.Provider>;
}

export function AuthProvider({ children }) {
  return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
}

export function clearIdentityBrowserState(host) {
  // Preference-only keys (theme/audio) and identity-scoped durable outboxes are
  // intentionally retained. These legacy unscoped keys can contain agent/call context.
  for (const key of ['enrollgen_persist', 'enrollgen.session-lock.v1']) {
    try { host.localStorage?.removeItem(key); } catch { /* The document still resets. */ }
  }
  for (const key of ['enrollgen_ancillary_prompts_v1', 'enrollgen_carrier_reference_popup_v2']) {
    try { host.sessionStorage?.removeItem(key); } catch { /* The document still resets. */ }
  }
}
