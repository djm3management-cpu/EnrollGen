/*
  Geographic utilities for the SEP Lookup Tool.
  Zip-to-state mapping, carrier availability, and date helpers.
*/

import { CARRIERS } from "../data/sepCarriers";
import { PLAN_DB } from "../data/sepPlanDb";

export function getStateFromZip(zip) {
  const z = parseInt(zip);
  if (z >= 35000 && z <= 36999) return "AL";
  if (z >= 99500 && z <= 99999) return "AK";
  if (z >= 85000 && z <= 86599) return "AZ";
  if (z >= 71600 && z <= 72999) return "AR";
  if (z >= 90000 && z <= 96699) return "CA";
  if (z >= 80000 && z <= 81699) return "CO";
  if (z >= 6000 && z <= 6999) return "CT";
  if (z >= 19700 && z <= 19999) return "DE";
  if (z >= 32000 && z <= 34999) return "FL";
  if (z >= 30000 && z <= 31999) return "GA";
  if (z >= 96700 && z <= 96899) return "HI";
  if (z >= 83200 && z <= 83899) return "ID";
  if (z >= 60000 && z <= 62999) return "IL";
  if (z >= 46000 && z <= 47999) return "IN";
  if (z >= 50000 && z <= 52899) return "IA";
  if (z >= 66000 && z <= 67999) return "KS";
  if (z >= 40000 && z <= 42799) return "KY";
  if (z >= 70000 && z <= 71499) return "LA";
  if (z >= 3900 && z <= 4999) return "ME";
  if (z >= 20600 && z <= 21999) return "MD";
  if (z >= 1000 && z <= 2799) return "MA";
  if (z >= 48000 && z <= 49999) return "MI";
  if (z >= 55000 && z <= 56799) return "MN";
  if (z >= 38600 && z <= 39799) return "MS";
  if (z >= 63000 && z <= 65899) return "MO";
  if (z >= 59000 && z <= 59999) return "MT";
  if (z >= 68000 && z <= 69399) return "NE";
  if (z >= 88900 && z <= 89899) return "NV";
  if (z >= 3000 && z <= 3899) return "NH";
  if (z >= 7000 && z <= 8999) return "NJ";
  if (z >= 87000 && z <= 88499) return "NM";
  if (z >= 10000 && z <= 14999) return "NY";
  if (z >= 27000 && z <= 28999) return "NC";
  if (z >= 58000 && z <= 58899) return "ND";
  if (z >= 43000 && z <= 45999) return "OH";
  if (z >= 73000 && z <= 74999) return "OK";
  if (z >= 97000 && z <= 97999) return "OR";
  if (z >= 15000 && z <= 19699) return "PA";
  if (z >= 2800 && z <= 2999) return "RI";
  if (z >= 29000 && z <= 29999) return "SC";
  if (z >= 57000 && z <= 57799) return "SD";
  if (z >= 37000 && z <= 38599) return "TN";
  if (z >= 75000 && z <= 79999) return "TX";
  if ((z >= 73300 && z <= 73399) || (z >= 77000 && z <= 77099)) return "TX";
  if (z >= 84000 && z <= 84799) return "UT";
  if (z >= 5000 && z <= 5999) return "VT";
  if (z >= 22000 && z <= 24699) return "VA";
  if (z >= 20000 && z <= 20599) return "DC";
  if (z >= 98000 && z <= 99499) return "WA";
  if (z >= 24700 && z <= 26899) return "WV";
  if (z >= 53000 && z <= 54999) return "WI";
  if (z >= 82000 && z <= 83199) return "WY";
  return "Unknown";
}

export function getCarriersForZip(zip) {
  const state = getStateFromZip(zip);
  const kaiserStates = ["CA", "CO", "GA", "HI", "MD", "OR", "VA", "WA", "DC"];
  const alignmentStates = ["CA", "NC", "NV", "AZ", "TX"];
  return Object.keys(CARRIERS)
    .filter((key) => {
      if (key === "kaiser" && !kaiserStates.includes(state)) return false;
      if (key === "alignment" && !alignmentStates.includes(state)) return false;
      return true;
    })
    .map((key) => ({ key, ...CARRIERS[key] }));
}

export function hasFiveStarPlans(zip) {
  const st = getStateFromZip(zip);
  return PLAN_DB.some(
    (p) => p.stars >= 5 && (p.states.includes("ALL") || p.states.includes(st))
  );
}

export function daysRemaining(dateStr) {
  return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
}

export function isActiveNow(s, e) {
  const now = new Date();
  if (s === "Year-round" || s === "Varies by individual") return true;
  return new Date(s) <= now && now <= new Date(e);
}
