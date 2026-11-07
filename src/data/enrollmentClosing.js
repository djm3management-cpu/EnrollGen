import {formatAgencyPhone} from '../lib/agencyLine.js';
export const ENROLLMENT_CLOSING_TEMPLATE = `Congratulations, you're all set! Thank you for trusting us with your coverage today. From this point forward, I'm your agent, and New Gen Health Solutions is your agency. If you ever have a question about your plan, a bill, a doctor, or a prescription, call us first at {AGENCY_PHONE} and we'll take care of it.

One important thing before we hang up. After enrolling, a lot of people start getting calls from other agencies claiming to be from Medicare, your insurance company, or 'your plan.' Please don't give those callers any information. We've seen people switched into plans they never agreed to, and it can take months to undo. Medicare and your insurance company will never cold call you asking for your Medicare number, Social Security number, or banking information.

If anyone calls about changing your plan, just hang up and call us. If you ever want to review or change your coverage, we're happy to do that with you anytime. Thanks again, and welcome to the family!`;
export const ENROLLMENT_CLOSING = ENROLLMENT_CLOSING_TEMPLATE.replace('{AGENCY_PHONE}',formatAgencyPhone());
