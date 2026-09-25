const identifier = value => typeof value==='string' && /^[\w .:@+-]{1,128}$/.test(value) ? value : null;
// Twilio verifies the URL/query and form body before this projection is used.
export function vendorMetadata(req) {
  return {
    publisher: identifier(req.body?.['SipHeader_X-Publisher-ID'] || req.body?.PublisherId || req.query?.publisher || req.body?.publisher),
    aggregator_call_id: identifier(req.body?.['SipHeader_X-Aggregator-Call-ID'] || req.body?.AggregatorCallId || req.query?.aggregator_call_id || req.body?.aggregator_call_id),
  };
}
