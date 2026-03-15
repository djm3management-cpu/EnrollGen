/*
  FEMA disaster API integration for SEP Lookup.
  Fetches live disaster declarations from OpenFEMA API,
  computes SEP enrollment windows, falls back to local DB.
*/

import { FEMA_DISASTER_DB } from "../data/sepFemaDb";

export async function fetchLiveFemaDisasters() {
  const now = new Date();
  const lookbackDate = new Date(now);
  lookbackDate.setMonth(lookbackDate.getMonth() - 12);
  const dateStr = lookbackDate.toISOString().split("T")[0];
  const url = `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=declarationDate ge '${dateStr}' and (declarationType eq 'DR' or declarationType eq 'FM')&$orderby=declarationDate desc&$top=1000&$select=disasterNumber,declarationType,declarationDate,incidentType,declarationTitle,state,designatedArea,ihProgramDeclared,iaProgramDeclared,paProgramDeclared,incidentBeginDate,incidentEndDate`;

  let apiResults = null;
  let apiFailed = false;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`FEMA API ${res.status}`);
    const data = await res.json();
    const records = data.DisasterDeclarationsSummaries || [];
    if (records.length === 0) throw new Error("FEMA API returned 0 records");

    const map = {};
    records.forEach((r) => {
      const key = r.disasterNumber;
      if (!map[key]) {
        const declarationType = r.declarationType || "DR";
        map[key] = {
          id: `${declarationType}-${r.disasterNumber}`,
          disasterNumber: r.disasterNumber,
          declarationType,
          title: r.declarationTitle || "Unnamed Disaster",
          type: r.incidentType || "Other",
          state: r.state,
          declaredDate: r.declarationDate?.split("T")[0],
          incidentBegin: r.incidentBeginDate?.split("T")[0],
          incidentEnd: r.incidentEndDate?.split("T")[0],
          iaProgram: r.iaProgramDeclared,
          ihProgram: r.ihProgramDeclared,
          paOnly:
            !r.iaProgramDeclared && !r.ihProgramDeclared && r.paProgramDeclared,
          counties: [],
        };
      }
      const county = (r.designatedArea || "")
        .replace(/\s*\(County\)\s*/i, "")
        .replace(/\s*\(Parish\)\s*/i, "")
        .replace(/\s*\(Borough\)\s*/i, "")
        .replace(/\s*\(Census Area\)\s*/i, "")
        .replace(/\s*\(Municipality\)\s*/i, "")
        .replace(/\s*\(Statewide\)\s*/i, "Statewide")
        .trim();
      if (county && !map[key].counties.includes(county))
        map[key].counties.push(county);
    });
    apiResults = Object.values(map);
  } catch (err) {
    console.error("FEMA API error:", err);
    apiFailed = true;
  }

  const disasters =
    apiResults && apiResults.length > 0 ? apiResults : FEMA_DISASTER_DB;
  if (!apiResults || apiResults.length === 0) apiFailed = true;

  return {
    apiFailed,
    disasters: disasters
      .filter((d) => d.iaProgram || d.ihProgram || d.paOnly)
      .map((d) => {
        const declared = new Date(d.declaredDate);
        const incidentEnd = d.incidentEnd ? new Date(d.incidentEnd) : null;
        const isOngoing = !incidentEnd || incidentEnd > now;
        let sepEnd, durationLabel;

        if (d.paOnly) {
          const baseDate = incidentEnd || declared;
          sepEnd = new Date(baseDate);
          sepEnd.setMonth(sepEnd.getMonth() + 2);
          sepEnd = new Date(sepEnd.getFullYear(), sepEnd.getMonth() + 1, 0);
          durationLabel = "PA only — SEP activates if IA is declared";
        } else if (isOngoing) {
          sepEnd = new Date(now.getFullYear() + 1, 0, 1);
          durationLabel = "Ongoing — SEP open until closed + 2 mo";
        } else {
          const baseDate = incidentEnd > declared ? incidentEnd : declared;
          sepEnd = new Date(baseDate);
          sepEnd.setMonth(sepEnd.getMonth() + 2);
          sepEnd = new Date(sepEnd.getFullYear(), sepEnd.getMonth() + 1, 0);
          durationLabel = `2 cal months after incident end (${d.incidentEnd})`;
        }

        return {
          ...d,
          sepEndDate: sepEnd.toISOString().split("T")[0],
          isOngoing,
          durationLabel,
          counties: (d.counties || []).sort(),
        };
      })
      .filter((d) => new Date(d.sepEndDate) > now),
  };
}
