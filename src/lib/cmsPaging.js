// Supabase caps CMS responses at 1,000 rows. Request that size so a capped
// page is never mistaken for the final page of a state inventory.
const PAGE_SIZE = 1000;

export async function fetchPagedRows(makeQuery) {
  const rows = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const { data, error } = await makeQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}
