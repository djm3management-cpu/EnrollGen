import {createLogger} from './logger.js';
const logger=createLogger('telephony','incominglead');
import {allowlistedLeadPayload,allowlistedLeadInput} from './leadPayload.js';
export function createIncomingLeadHandler({findContact,db,settings,log=(...args)=>logger.error(...args)}={}) {
 return async (req,res)=>{
  const body = {...allowlistedLeadInput(req.body),phone:req.body?.phone};
  if(!settings.paragonEnabled && /paragon/i.test(String(body.vendor_source || req.body?.publisher || '')))return res.status(503).json({status:'disabled',feature:'PARAGON_ENABLED'});
  if (!body.phone) {
    return res.status(400).json({ error: "phone is required" });
  }

  try {
    const { contact, created, error } = await findContact({
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
      return res.status(422).json({ error: "could not resolve contact" });
    }

    // Backfill identity fields the vendor sends on an existing contact
    // without clobbering data agents already entered.
    if (!created) {
      const updates = {};
      for (const field of ["first_name", "last_name", "email", "dob", "zip", "county", "state"]) {
        if (body[field] && !contact[field]) updates[field] = body[field];
      }
      if (Object.keys(updates).length) {
        await db.from("contacts").update(updates).eq("id", contact.id);
      }
    }

    const { error: intelError } = await db.from("contact_lead_intel").insert({
      tenant_id: contact.tenant_id,
      contact_id: contact.id,
      payload: allowlistedLeadPayload(body),
      lead_score: body.lead_score != null ? Number(body.lead_score) : null,
      churn_risk: body.churn_risk || null,
      vendor_source: body.vendor_source || null,
    });
    if (intelError) {
      return res.status(500).json({ error: "lead intel insert failed" });
    }

    return res.status(created ? 201 : 200).json({ contact_id: contact.id });
  } catch {
    log("/api/leads/incoming failed");
    return res.status(500).json({ error: "internal error" });
  }
};
}
