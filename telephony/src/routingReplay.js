import { supabase } from "./supabase.js";

// Persist routing responses so webhook retries cannot consume another agent.
// An unfinished request fails closed; never steal a processing reservation.
export async function routingReplay(req, res, next) {
  const callSid = req.body.CallSid;
  if (!callSid) return res.status(400).send("CallSid required");
  const requestKey = `${req.path}:${callSid}:${String(req.query.tried || "")}`;
  try {
    const { error } = await supabase.from("telephony_routing_responses")
      .insert({ request_key: requestKey });
    if (error) {
      if (error.code !== "23505") throw error;
      const { data, error: readError } = await supabase.from("telephony_routing_responses")
        .select("response_xml").eq("request_key", requestKey).single();
      if (readError) throw readError;
      if (data.response_xml == null) return res.status(503).send("Routing request is still processing");
      return res.type("text/xml").send(data.response_xml);
    }
    res.locals.routingRequestKey = requestKey;
    return next();
  } catch (err) {
    console.error("Routing replay guard failed:", err);
    return res.status(503).send("Routing unavailable");
  }
}

export async function sendRoutingTwiml(res, response) {
  const xml = response.toString();
  const { error } = await supabase.from("telephony_routing_responses")
    .update({ response_xml: xml }).eq("request_key", res.locals.routingRequestKey);
  if (error) {
    console.error("Could not persist routing response:", error);
    return res.status(503).send("Routing unavailable");
  }
  return res.type("text/xml").send(xml);
}
