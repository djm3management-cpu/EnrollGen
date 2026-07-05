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
// agent screen can show lead intel at ring time. The full payload is
// stored as raw jsonb; new vendor fields are never lost.
//
// Contract: POST /api/leads/incoming
// { "phone": "+15551234567" (required),
//   "first_name", "last_name", "email", "dob", "zip", "county", "state",
//   "lead_score": 87, "churn_risk": "low|medium|high", "vendor_source": "...",
//   ...any additional fields }
leadsRouter.post("/api/leads/incoming", requireVendorApiKey, async (req, res) => {
  const body = req.body || {};
  if (!body.phone) {
    return res.status(400).json({ error: "phone is required" });
  }

  try {
    const { contact, created, error } = await findOrCreateContactByPhone({
      phone: body.phone,
      source: "fmo_transfer",
      fields: {
        first_name: body.first_name || null,
        last_name: body.last_name || null,
        email: body.email || null,
        dob: body.dob || null,
        zip: body.zip || null,
        county: body.county || null,
        state: body.state || null,
      },
    });
    if (error || !contact) {
      return res.status(422).json({ error: error || "could not resolve contact" });
    }

    // Backfill identity fields the vendor sends on an existing contact
    // without clobbering data agents already entered.
    if (!created) {
      const updates = {};
      for (const field of ["first_name", "last_name", "email", "dob", "zip", "county", "state"]) {
        if (body[field] && !contact[field]) updates[field] = body[field];
      }
      if (Object.keys(updates).length) {
        await supabase.from("contacts").update(updates).eq("id", contact.id);
      }
    }

    const { error: intelError } = await supabase.from("contact_lead_intel").insert({
      tenant_id: contact.tenant_id,
      contact_id: contact.id,
      payload: body,
      lead_score: body.lead_score != null ? Number(body.lead_score) : null,
      churn_risk: body.churn_risk || null,
      vendor_source: body.vendor_source || null,
    });
    if (intelError) {
      return res.status(500).json({ error: `lead intel insert failed: ${intelError.message}` });
    }

    return res.status(created ? 201 : 200).json({ contact_id: contact.id });
  } catch (err) {
    console.error("/api/leads/incoming failed:", err);
    return res.status(500).json({ error: "internal error" });
  }
});
