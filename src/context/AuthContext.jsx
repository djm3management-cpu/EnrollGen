import { createContext, useContext } from "react";
import { useAuth } from "@clerk/clerk-react";

const AuthContext = createContext({ getToken: async () => null });

export const useAppAuth = () => useContext(AuthContext);

const DISABLED = import.meta.env.VITE_DISABLE_CLERK_AUTH === "true";

function ClerkAuthBridge({ children }) {
  const { getToken } = useAuth();
  return (
    <AuthContext.Provider value={{ getToken }}>{children}</AuthContext.Provider>
  );
}

export function AuthProvider({ children }) {
  if (DISABLED) {
    return (
      <AuthContext.Provider value={{ getToken: async () => null }}>
        {children}
      </AuthContext.Provider>
    );
  }
  return <ClerkAuthBridge>{children}</ClerkAuthBridge>;
}
