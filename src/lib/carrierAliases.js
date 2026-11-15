// Pure carrier naming rules shared by browser intakes and server selection.
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g,'');
export const CARRIER_ALIASES = {
  UnitedHealthcare:['UHC','United Healthcare','AARP Medicare Advantage'],
  Devoted:['Devoted Health'], WellCare:['Centene','Wellcare by Allwell','Wellcare / Centene'], Zing:['Zing Health'],
  Anthem:['Elevance','Anthem Blue Cross','Elevance / Anthem'], Aetna:['Aetna Medicare','CVS'],
  HealthSpring:['Cigna','Cigna HealthSpring','Cigna / HealthSpring'], Humana:[],
};
const aliases=new Map(Object.entries(CARRIER_ALIASES).flatMap(([name,values])=>[name,...values].map(value=>[normalize(value),name])));
export const canonicalCarrier = value => aliases.get(normalize(value)) || null;
