import twilio from "twilio";
import { config, publicUrl } from "./config.js";

// Express middleware validating X-Twilio-Signature against the
// public URL Twilio actually posted to. Requires express.urlencoded
// to have parsed the body first.
export function requireTwilioSignature(req, res, next) {
  const signature = req.header("X-Twilio-Signature") || "";
  const url = publicUrl(req.originalUrl);
  const valid = twilio.validateRequest(
    config.twilioAuthToken,
    signature,
    url,
    req.body || {}
  );
  if (!valid) {
    console.warn(`Rejected unsigned Twilio webhook: ${req.originalUrl}`);
    return res.status(403).send("Invalid Twilio signature");
  }
  return next();
}
