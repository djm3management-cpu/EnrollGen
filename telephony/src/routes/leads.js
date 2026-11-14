import {createIncomingLeadHandler} from '../lib/incomingLead.js';
import crypto from "node:crypto";
import { Router } from "express";
import { config } from "../config.js";
import { supabase } from "../supabase.js";
import { findOrCreateContactByPhone } from "../contacts.js";

export const leadsRouter = Router();

function timingSafeEquals(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireVendorApiKey(req, res, next) {
  if (!timingSafeEquals(req.header("x-api-key"), config.inboundVendorApiKey)) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  return next();
}

// FMO lead intake. Called before (or with) the live transfer so the
// agent screen can show reviewed lead intel at ring time. Unknown fields
// are discarded before persistence and never logged.
//
// Contract: POST /api/leads/incoming
// { "phone": "+15551234567" (required),
//   "first_name", "last_name", "email", "dob", "zip", "county", "state",
//   "lead_score": 87, "churn_risk": "low|medium|high", "vendor_source": "...",
//   ...any additional fields }
leadsRouter.post("/api/leads/incoming",requireVendorApiKey,createIncomingLeadHandler({findContact:findOrCreateContactByPhone,db:supabase,settings:config}));
