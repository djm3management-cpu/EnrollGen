import { createContext, useContext, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";

const AuthContext = createContext({ getToken: async () => null });
let authTokenGetter = async () => null;

export const useAppAuth = () => useContext(AuthContext);
export const getAuthToken = async () => authTokenGetter();

const DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";

function ClerkAuthBridge({ children }) {
  const { getToken } = useAuth();

  useEffect(() => {
    authTokenGetter = getToken;
    return () => {
      authTokenGetter = async () => null;
    };
  }, [getToken]);

  return (
    <AuthContext.Provider value={{ getToken }}>{children}</AuthContext.Provider>
  );
}

export function AuthProvider({ children }) {
  if (DISABLED) {
    authTokenGetter = async () => null;
    return (
      <AuthContext.Provider value={{ getToken: async () => null }}>
        {children}
      </AuthContext.Provider>
    );
  }
  return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
}
