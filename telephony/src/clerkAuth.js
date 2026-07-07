import { verifyToken } from "@clerk/backend";
import { config } from "./config.js";

// Verifies the Clerk session bearer token on browser-facing endpoints.
// Returns the token payload, or null after writing the 401 response.
export async function requireClerkUser(req, res) {
  const header = req.header("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) {
    res.status(401).json({ error: "Missing Bearer token" });
    return null;
  }
  try {
    const payload = await verifyToken(header.slice(7).trim(), {
      secretKey: config.clerkSecretKey,
    });
    return payload;
  } catch (err) {
    console.error("Clerk token verification failed:", err.message);
    res.status(401).json({ error: "Invalid or expired Clerk session token" });
    return null;
  }
}
