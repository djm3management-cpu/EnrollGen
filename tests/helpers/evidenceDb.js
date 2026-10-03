// Thin Supabase-shaped adapter. All authorization and mutations execute in
// PostgreSQL under the caller's real role; no RLS outcomes are mocked.
export function evidenceDb(pg, onError = () => {}) {
  const q = name => '"' + name.replaceAll('"', '""') + '"';
  return {
    async rpc(name, input) {
      const entries = Object.entries(input);
      try {
        const sql = "SELECT * FROM public." + q(name) + "(" + entries.map(([key], index) =>
          q(key) + "=>$" + (index + 1) + (key === "query_embedding" ? "::vector" : "")).join(",") + ")";
        const jsonArgs = new Set(['p_transcript', 'p_result']);
        const rows = (await pg.query(sql, entries.map(([key,item]) => key === "query_embedding" ? "{" + item.join(",") + "}"
          : jsonArgs.has(key) ? JSON.stringify(item) : item))).rows;
        const scalarScoring = ['begin_scoring_job','persist_scoring_result','fail_scoring_job'].includes(name);
        return { data: scalarScoring ? rows[0]?.[name] : rows, error: null };
      } catch (error) { return { data: null, error }; }
    },
    from(table) {
      let operation = "select", projection = "*", rows, single = false, head = false, count = false, limit, offset;
      const filters = [], order = [], args = [];
      const value = item => { args.push(item); return "$" + args.length; };
      const chain = {
        select(columns = "*", options = {}) { projection = columns; head = options.head; count = options.count; return chain; },
        insert(input) { operation = "insert"; rows = Array.isArray(input) ? input : [input]; return chain; },
        update(input) { operation = "update"; rows = [input]; return chain; },
        gte(column, item) { filters.push(q(column) + ">=" + value(item)); return chain; },
        lt(column, item) { filters.push(q(column) + "<" + value(item)); return chain; },
        eq(column, item) { filters.push(q(column) + "=" + value(item)); return chain; },
        is(column, item) { if (item !== null) throw new Error('Fixture IS only supports NULL'); filters.push(q(column) + ' IS NULL'); return chain; },
        range(from, to) { offset = Number(from); limit = Number(to) - offset + 1; return chain; },
        in(column, items) { filters.push(q(column) + " IN (" + items.map(value).join(",") + ")"); return chain; },
        order(column, options = {}) { order.push(q(column) + (options.ascending === false ? " DESC" : " ASC")); return chain; },
        limit(size) { limit = Number(size); return chain; },
        single() { single = "required"; return chain; },
        maybeSingle() { single = "optional"; return chain; },
        abortSignal() { return chain; },
        then(resolve, reject) {
          const run = async () => {
            if (rows?.length === 0) return { data: [], error: null };
            const where = filters.length ? " WHERE " + filters.join(" AND ") : "";
            const sort = order.length ? " ORDER BY " + order.join(",") : "";
            const bounded = (limit == null ? "" : " LIMIT " + limit) + (offset == null ? "" : " OFFSET " + offset);
            // Only these production relationship projections are used by handlers.
            const cols = projection.replace(/compliance_flags\(count\)/g,
              "(SELECT jsonb_build_array(jsonb_build_object('count',count(*))) FROM compliance_flags WHERE session_id=sessions.id) AS compliance_flags")
              .replace(/section_scores\(count\)/g,
                "(SELECT jsonb_build_array(jsonb_build_object('count',count(*))) FROM section_scores WHERE session_id=sessions.id) AS section_scores")
              .replace(/compliance_intents\(intent_code\)/g,
                "(SELECT jsonb_build_object('intent_code',intent_code) FROM compliance_intents WHERE id=scoring_template_items.intent_id) AS compliance_intents");
            let sql;
            if (operation === "select") sql = "SELECT " + cols + " FROM public." + q(table) + where + sort + bounded;
            if (operation === "update") {
              const assignment = Object.entries(rows[0]).filter(([,item]) => item !== undefined)
                .map(([key,item]) => q(key) + "=" + value(item));
              sql = "UPDATE public." + q(table) + " SET " + assignment.join(",") + where + " RETURNING " + cols;
            }
            if (operation === "insert") {
              const keys = [...new Set(rows.flatMap(row => Object.keys(row).filter(key => row[key] !== undefined)))];
              const tuples = rows.map(row => "(" + keys.map(key => row[key] === undefined ? "DEFAULT" : value(row[key])).join(",") + ")");
              sql = "INSERT INTO public." + q(table) + "(" + keys.map(q).join(",") + ") VALUES " + tuples.join(",") + " RETURNING " + cols;
            }
            try {
              // pg drivers require JSON strings for jsonb and arrays for SQL arrays.
              // Discover the captured column type rather than guessing from values.
              const types = (await pg.query("SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table])).rows;
              const jsonColumns = new Set(types.filter(col => col.udt_name === "jsonb").map(col => col.column_name));
              if (rows) {
                // Find placeholders assigned to each JSON column in generated SQL.
                if (operation === "update") for (const key of jsonColumns) {
                  const match = sql.match(new RegExp(q(key) + "=\\$(\\d+)"));
                  if (match && args[Number(match[1])-1] != null) args[Number(match[1])-1] = JSON.stringify(args[Number(match[1])-1]);
                }
                if (operation === "insert") {
                  const keys = [...new Set(rows.flatMap(row => Object.keys(row).filter(key => row[key] !== undefined)))];
                  let index = 0;
                  for (const row of rows) for (const key of keys) if (row[key] !== undefined) {
                    if (jsonColumns.has(key) && args[index] != null) args[index] = JSON.stringify(args[index]);
                    if (table === "transcript_chunks" && key === "embedding") args[index] = "{" + args[index].join(",") + "}";
                    index++;
                  }
                }
              }
              const data = (await pg.query(sql, args)).rows;
              // PostgREST emits JSON numbers for PostgreSQL numeric columns.
              for (const row of data) for (const col of types) {
                if (col.udt_name === "numeric" && row[col.column_name] != null) row[col.column_name] = Number(row[col.column_name]);
              }
              if (single && (data.length > 1 || (single === "required" && data.length !== 1))) {
                return { data: null, error: { code: "PGRST116", message: "Unexpected row count" } };
              }
              const total = count ? Number((await pg.query("SELECT count(*) AS total FROM public." + q(table) + where, args)).rows[0].total) : null;
              return { data: head ? null : single ? data[0] || null : data, count: total, error: null };
            } catch (error) { onError({table,code:error.code,message:error.message}); return { data: null, error }; }
          };
          return run().then(resolve, reject);
        },
      };
      return chain;
    },
  };
}
