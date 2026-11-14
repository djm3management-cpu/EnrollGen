import {deploymentProfile} from './deploymentProfile.js';
import {calendarMidnight,localDay,shiftCalendarDay} from './deploymentCalendar.js';
export function previousReportDate(now,timezone=deploymentProfile().timezone) {return shiftCalendarDay(localDay(now,timezone),-1);}
export function zonedMidnight(day,timezone=deploymentProfile().timezone) {return calendarMidnight(day,timezone);}
