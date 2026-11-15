# Synthetic spreadsheet parity corpus

Created locally with the formerly installed SheetJS 0.18.5 in one generation invocation, before its removal. Fixture commit: `73d073a`. Every person, organization, identifier and plan is synthetic. No downloaded workbook or real roster is included.

- `shapes.xlsx`: two sheets, text and numeric IDs, dates, booleans, empty rows, duplicate and blank headings, merged header cells.
- `formats.xlsx`: dates, custom ISO date format, zero-padded numeric plan ID, percentage, grouped decimal amount and preserved whitespace.
- `epoch1904.xlsx`: 1904 date system, day and date/time formats.
- `cy2027-dsnp.xlsx`: synthetic overview plus a valid CY2027 D-SNP sheet.
- `cy2027-invalid.xlsx`: the same synthetic row on an unverifiable sheet name, for the existing live-load year guard.
- `offset.xlsx`: title/empty rows before the header, duplicate/blank headers and empty data rows.
- `legacy.xls`, `macro.xlsm`: synthetic rejection inputs, including a macro-enabled container with no executable macro.
- `sheetjs-golden.json`: former reader's formatted object and array outputs with `cellDates:true`, `raw:false`, `blankrows:false`; object `defval:null`, array `defval:""`. Serial-date expectations record the former SSF day conversion, including its leap-day and rounding behavior. Date serials in the workbooks are authoritative; fixture generation used the local timezone.

The tests consume these committed binary fixtures. They never recreate them with the removed package. Malformed ZIP/limit cases are derived in memory with an original test-only helper and Node's built-in zlib. Operator tabular exports use the already installed Papa Parse package and produce CSV.
