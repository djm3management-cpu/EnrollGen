import {securityEvent,inspectInput} from '../../telephony/src/lib/logger.js';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

// Applied before any model, roster lookup, hash or ingestion write.
export const SPREADSHEET_LIMITS = Object.freeze({
  uploadBytes: 10 * 1024 * 1024,
  decompressedBytes: 40 * 1024 * 1024,
  zipEntries: 2048,
  sheets: 10,
  rows: 3001, // Header plus the existing 3,000 RTS data-row budget, per sheet.
  columns: 100,
  cells: 300100,
  parseMs: 5000,
  workerMemoryMb: 256,
});
export const OPERATOR_SPREADSHEET_LIMITS = Object.freeze({
  ...SPREADSHEET_LIMITS,
  uploadBytes: 256 * 1024 * 1024, decompressedBytes: 512 * 1024 * 1024,
  sheets: 64, rows: 1048576, columns: 16384, cells: 5000000, parseMs: 120000,
  workerMemoryMb: 1024,
});
const require = createRequire(import.meta.url);
const readerUrl = pathToFileURL(require.resolve('read-excel-file/node')).href;
// Resolve the reader's own XML dependency, rather than adding a direct dependency.
const readerRequire = createRequire(require.resolve('read-excel-file/package.json'));
const xmlUrl = pathToFileURL(readerRequire.resolve('saxen')).href;
const csvUrl = pathToFileURL(require.resolve('papaparse')).href;

/** A terminable worker covers decompression, XML, formatting and CSV parsing.
 * A Promise.race around an in-process parser cannot stop synchronous CPU work.
 * Exported for deterministic deadline tests; callers never supply worker code.
 */
export function runSpreadsheetWorker(bytes, mode, limits = SPREADSHEET_LIMITS, job = spreadsheetJob) {
  return rawSpreadsheetWorker(bytes,mode,limits,job).then(result=>{inspectInput(result);return result;}).catch(error=>{securityEvent("upload_rejected");throw error;});
}
function rawSpreadsheetWorker(bytes, mode, limits, job) {
  if (bytes.byteLength > limits.uploadBytes) return Promise.reject(new Error(`The uploaded file must be smaller than ${limits.uploadBytes / (1024 * 1024)} MB.`));
  return new Promise((resolve, reject) => {
    const worker = new Worker(`(${job.toString()})()`, {
      eval: true, execArgv: [],
      workerData: { bytes, mode, limits, readerUrl, xmlUrl, csvUrl },
      resourceLimits: { maxOldGenerationSizeMb: limits.workerMemoryMb },
    });
    let settled = false;
    const finish = async (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      await worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error(`Spreadsheet parse time limit exceeded (${limits.parseMs} ms). Save a smaller file as .xlsx or CSV.`)), limits.parseMs);
    worker.once('message', message => finish(message.error ? new Error(message.error) : null, message.result));
    worker.once('error', () => finish(new Error('Unable to parse spreadsheet safely. Save the file as .xlsx or CSV.')));
    worker.once('exit', code => { if (!settled) finish(new Error(`Spreadsheet parser stopped (${code}). Save a smaller file as .xlsx or CSV.`)); });
  });
}

export async function readWorkbook(input, limits = OPERATOR_SPREADSHEET_LIMITS) {
  const bytes = typeof input === 'string' || input instanceof URL ? await readFile(input) : Buffer.from(input);
  return runSpreadsheetWorker(bytes, 'xlsx', limits);
}

// SheetJS-compatible object headers: preserve blank/merged cells, disambiguate
// duplicates (including names already ending in _1), and skip empty data rows.
export function sheetObjects(data, defval = '') {
  if (!data?.length) return [];
  const used = new Set();
  const headers = data[0].map(value => {
    const base = value === null || value === undefined ? '__EMPTY' : String(value);
    let header = base;
    for (let n = 1; used.has(header); n++) header = `${base}_${n}`;
    used.add(header);
    return header;
  });
  return data.slice(1).filter(row => row.some(value => value !== null && value !== undefined)).map(row =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? defval])));
}
export const sheetArrays = data => data.filter(row => row.some(value => value !== null && value !== undefined)).map(row => row.map(value => value ?? ''));

/** Equivalent to the former SSF day conversion, including Excel's fictitious
 * 1900-02-29 (normalized by Date.UTC to March 1) and near-midnight rounding.
 */
export function excelSerialIsoDate(serial) {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 2958465) return null;
  let day = Math.floor(serial);
  if ((serial - day) * 86400 > 86399.9999) day++;
  if (day === 60) return '1900-03-01';
  return new Date(Date.UTC(1899, 11, 31) + (day > 60 ? day - 1 : day) * 86400000).toISOString().slice(0, 10);
}

// Self-contained to keep the exact same worker code in source and Netlify bundles.
async function spreadsheetJob() {
  const { parentPort, workerData } = await import('node:worker_threads');
  const { bytes, mode, limits, readerUrl, xmlUrl, csvUrl } = workerData;
  const buffer = Buffer.from(bytes);
  const fail = message => { throw new Error(message); };
  try {
    if (!buffer.length) fail('The uploaded file is empty.');
    const saveAs = 'Legacy .xls, binary or macro-enabled workbooks are unsupported. Save the file as .xlsx.';
    if (buffer.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11e1', 'hex'))) fail(saveAs);
    const zip = buffer.readUInt16LE(0) === 0x4b50;
    if (!zip) {
      if (!['csv', 'tsv'].includes(mode)) fail('Invalid spreadsheet signature. Save the file as .xlsx.');
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { fail('Invalid CSV/TSV text signature. Save the file as .xlsx or UTF-8 CSV.'); }
      // Binary control bytes are forbidden in UTF-8 CSV/TSV uploads.
      // eslint-disable-next-line no-control-regex
      if (/[\x00-\x08\x0e-\x1f]/.test(text) || text.startsWith('%PDF-')) fail('Invalid CSV/TSV text. Save the file as .xlsx or UTF-8 CSV.');
      const { default: Papa } = await import(csvUrl);
      const first = Papa.parse(text, { delimiter: mode === 'tsv' ? '\t' : '', skipEmptyLines: 'greedy', preview: 1 }).data[0] || [];
      if (first.length > limits.columns) fail(`Column limit exceeded (maximum ${limits.columns}).`);
      let rowCount = 0;
      const records = [];
      let headers = first.map(header => String(header).trim());
      Papa.parse(text, {
        header: true, delimiter: mode === 'tsv' ? '\t' : '', skipEmptyLines: 'greedy', transformHeader: header => header.trim(),
        step(result) {
          headers = result.meta.fields || [];
          if (headers.length > limits.columns || Object.keys(result.data).length > limits.columns) fail(`Column limit exceeded (maximum ${limits.columns}).`);
          if (++rowCount + 1 > limits.rows) fail(`Row limit exceeded (maximum ${limits.rows - 1} data rows).`);
          const errors = result.errors.filter(error => error.code !== 'TooFewFields');
          if (errors.length) fail(`Unable to parse ${mode.toUpperCase()}: row ${rowCount + 1}: ${errors[0].message}`);
          records.push(result.data);
        },
      });
      parentPort.postMessage({ result: { rows: records, headers, sheetName: null, sheetNames: [] } });
      return;
    }
    // Read every entry with bounded inflation BEFORE the spreadsheet reader sees it.
    const { inflateRawSync } = await import('node:zlib');
    const pathModule = await import('node:path');
    let end = -1;
    for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { end = i; break; }
    }
    if (end < 0) fail('Invalid XLSX ZIP signature. Save the file as .xlsx.');
    const count = buffer.readUInt16LE(end + 10);
    const directorySize = buffer.readUInt32LE(end + 12);
    const directory = buffer.readUInt32LE(end + 16);
    if (buffer.readUInt32LE(end + 4) || buffer.readUInt16LE(end + 8) !== count || count === 65535 || directory + directorySize !== end) fail('Unsupported ZIP archive. Save the file as .xlsx.');
    if (count > limits.zipEntries) fail(`ZIP entry limit exceeded (maximum ${limits.zipEntries}).`);
    const files = new Map();
    const spans = [];
    let cursor = directory, declared = 0, actual = 0;
    for (let i = 0; i < count; i++) {
      if (buffer.readUInt32LE(cursor) !== 0x02014b50) fail('Invalid XLSX ZIP directory.');
      const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10);
      const compressed = buffer.readUInt32LE(cursor + 20), size = buffer.readUInt32LE(cursor + 24);
      const nameLength = buffer.readUInt16LE(cursor + 28), extraLength = buffer.readUInt16LE(cursor + 30), commentLength = buffer.readUInt16LE(cursor + 32);
      const offset = buffer.readUInt32LE(cursor + 42);
      const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
      if (flags & 1 || ![0, 8].includes(method) || size === 0xffffffff || compressed === 0xffffffff || offset === 0xffffffff) fail('Encrypted or unsupported ZIP archive. Save the file as .xlsx.');
      if (files.has(name) || name.includes('..') || name.includes('\\') || name.startsWith('/')) fail('Invalid or duplicate XLSX ZIP entry.');
      declared += size;
      if (declared > limits.decompressedBytes) fail(`Decompressed size limit exceeded (maximum ${limits.decompressedBytes} bytes).`);
      if (buffer.readUInt32LE(offset) !== 0x04034b50 || buffer.readUInt16LE(offset + 6) !== flags || buffer.readUInt16LE(offset + 8) !== method) fail('Invalid XLSX ZIP local header.');
      const localNameLength = buffer.readUInt16LE(offset + 26), localExtraLength = buffer.readUInt16LE(offset + 28);
      if (buffer.subarray(offset + 30, offset + 30 + localNameLength).toString('utf8') !== name) fail('Inconsistent XLSX ZIP names.');
      const start = offset + 30 + localNameLength + localExtraLength;
      let stop = start + compressed;
      if (stop > directory) fail('Invalid XLSX ZIP entry bounds.');
      if (flags & 8) {
        const descriptor = buffer.readUInt32LE(stop) === 0x08074b50 ? stop + 4 : stop;
        if (buffer.readUInt32LE(descriptor + 4) !== compressed || buffer.readUInt32LE(descriptor + 8) !== size) fail('Invalid ZIP data descriptor.');
        stop = descriptor + 12;
      } else if (buffer.readUInt32LE(offset + 18) !== compressed || buffer.readUInt32LE(offset + 22) !== size) fail('Inconsistent XLSX ZIP sizes.');
      spans.push([offset, stop]);
      let content;
      try {
        content = method === 0 ? buffer.subarray(start, start + compressed) : inflateRawSync(buffer.subarray(start, start + compressed), { maxOutputLength: Math.max(1, limits.decompressedBytes - actual) });
      } catch { fail('Decompressed size limit exceeded or invalid compressed XLSX data.'); }
      actual += content.length;
      if (actual > limits.decompressedBytes) fail(`Decompressed size limit exceeded (maximum ${limits.decompressedBytes} bytes).`);
      if (content.length !== size) fail('Inconsistent decompressed XLSX size.');
      const text = content.toString('utf8');
      if (/\.(?:xml|rels)$/i.test(name) && /<!\s*(?:DOCTYPE|ENTITY)/i.test(text)) fail('Unsafe XML declarations in workbook. Save the file as .xlsx.');
      files.set(name, text);
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    if (cursor !== end) fail('Invalid XLSX directory length.');
    spans.sort((a, b) => a[0] - b[0]);
    let covered = 0;
    for (const [start, stop] of spans) { if (start !== covered || stop > directory) fail('Ambiguous XLSX ZIP entries.'); covered = stop; }
    if (covered !== directory) fail('Unlisted XLSX ZIP data.');
    const { Parser } = await import(xmlUrl);
    const scan = (xml, open, close = () => {}, text = () => {}) => {
      const parser = new Parser();
      parser.on('openTag', (name, getter, decode) => open(name.split(':').pop(), Object.fromEntries(Object.entries(getter()).map(([key, value]) => [key, decode(value)]))));
      parser.on('closeTag', name => close(name.split(':').pop()));
      parser.on('text', (value, decode) => text(decode(value)));
      parser.on('error', () => fail('Invalid spreadsheet XML.'));
      parser.on('warn', () => fail('Invalid spreadsheet XML.'));
      parser.parse(xml);
    };
    const types = files.get('[Content_Types].xml') || '';
    if (!types) fail('Invalid spreadsheet content signature. Save the file as .xlsx.');
    if ([...files.keys()].some(name => /vbaProject|\.bin$/i.test(name))) fail(saveAs);
    let validType = false;
    scan(types, (name, attrs) => {
      if (name === 'Default' && /macroEnabled|vbaProject|macrosheet/i.test(attrs.ContentType || '') && [...files.keys()].some(path => path.endsWith(`.${attrs.Extension}`))) fail(saveAs);
      if (name === 'Override' && /macroEnabled|vbaProject|sheet\.binary|macrosheet/i.test(attrs.ContentType || '')) fail(saveAs);
      if (name === 'Override' && attrs.PartName === '/xl/workbook.xml' && attrs.ContentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml') validType = true;
    });
    if (!validType || !files.has('xl/workbook.xml')) fail('Invalid spreadsheet content signature. Save the file as .xlsx.');
    let sheets = 0, epoch1904 = false;
    scan(files.get('xl/workbook.xml'), (name, attrs) => { if (name === 'workbookPr') epoch1904 = ['1', 'true'].includes(attrs.date1904); });
    scan(files.get('xl/workbook.xml'), name => { if (name === 'sheet' && ++sheets > limits.sheets) fail(`Sheet limit exceeded (maximum ${limits.sheets}).`); });
    if (!sheets) fail('The workbook does not contain a worksheet.');
    const formats = { 0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 14: 'm/d/yy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yy h:mm', 49: '@' };
    const styles = [];
    let inXfs = false;
    scan(files.get('xl/styles.xml') || '<styleSheet/>', (name, attrs) => {
      if (name === 'numFmt') formats[attrs.numFmtId] = attrs.formatCode;
      if (name === 'cellXfs') inXfs = true;
      if (inXfs && name === 'xf') styles.push(formats[attrs.numFmtId] || 'General');
    }, name => { if (name === 'cellXfs') inXfs = false; });
    const paths = new Map();
    scan(files.get('xl/_rels/workbook.xml.rels') || '<Relationships/>', (name, attrs) => {
      if (name === 'Relationship') {
        if (attrs.TargetMode === 'External') return; // Reader never fetches relationships.
        const { posix } = pathModule;
        paths.set(attrs.Id, attrs.Target.startsWith('/') ? attrs.Target.slice(1) : posix.normalize(`xl/${attrs.Target}`));
      }
    });
    const sheetPaths = [];
    scan(files.get('xl/workbook.xml'), (name, attrs) => { if (name === 'sheet') sheetPaths.push(paths.get(attrs['r:id'])); });
    if (sheetPaths.some(path => !files.has(path))) fail('Invalid worksheet relationship. Save the file as .xlsx.');
    const sheetMetadata = new Map();
    // Inspect every worksheet, including unselected ones and sparse addresses.
    let totalCells = 0, denseCells = 0;
    for (const [path, xml] of files) {
      if (!sheetPaths.includes(path) && !/^xl\/worksheets\/.*\.xml$/i.test(path)) continue;
      const metadata = new Map();
      let row = 0, col = 0, rowTags = 0, current, inValue = false, range;
      scan(xml, (name, attrs) => {
        if (name === 'dimension') {
          range = (attrs.ref || '').split(':').map(checkAddress);
          if (range.length === 1) range.push(range[0]);
        }
        if (name === 'dimension' || name === 'mergeCell') {
          for (const ref of (attrs.ref || '').split(':')) checkAddress(ref);
        }
        if (name === 'row') {
          row = attrs.r ? Number(attrs.r) : row + 1; col = 0;
          if (++rowTags > limits.rows || !Number.isSafeInteger(row) || row < 1 || row > limits.rows) fail(`Row limit exceeded (maximum ${limits.rows - 1} data rows).`);
        }
        if (name === 'v') inValue = true;
        if (name === 'c') {
          const address = attrs.r ? checkAddress(attrs.r) : [row, col + 1];
          [row, col] = address;
          if (++totalCells > limits.cells) fail(`Cell limit exceeded (maximum ${limits.cells}).`);
          if (col > limits.columns) fail(`Column limit exceeded (maximum ${limits.columns}).`);
          current = { format: styles[Number(attrs.s || 0)] || 'General', type: attrs.t };
          metadata.set(`${row}:${col}`, current);
        }
      }, name => { if (name === 'v') inValue = false; if (name === 'c') current = null; }, text => { if (inValue && current && (!current.type || current.type === 'n')) current.serial = Number(text); });
      const dimensions = [...metadata.keys()].map(key => key.split(':').map(Number));
      const maxRow = dimensions.reduce((max, [r]) => Math.max(max, r), 0);
      const maxCol = dimensions.reduce((max, [, c]) => Math.max(max, c), 0);
      denseCells += maxRow * maxCol;
      if (denseCells > limits.cells) fail(`Cell limit exceeded (maximum ${limits.cells}).`);
      if (!range && dimensions.length) range = [[dimensions.reduce((min, [r]) => Math.min(min, r), maxRow), dimensions.reduce((min, [, c]) => Math.min(min, c), maxCol)], [maxRow, maxCol]];
      sheetMetadata.set(path, { cells: metadata, range });
      function checkAddress(ref) {
        const match = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref);
        if (!match) fail('Invalid worksheet cell address.');
        let column = 0;
        for (const letter of match[1]) column = column * 26 + letter.charCodeAt(0) - 64;
        const r = Number(match[2]);
        if (!Number.isSafeInteger(r) || r < 1 || r > limits.rows) fail(`Row limit exceeded (maximum ${limits.rows - 1} data rows).`);
        if (column > limits.columns) fail(`Column limit exceeded (maximum ${limits.columns}).`);
        return [r, column];
      }
    }
    const { default: readExcelFile } = await import(readerUrl);
    const result = await readExcelFile(buffer, { trim: false });
    const output = result.map(({ sheet, data }, index) => {
      const metadata = sheetMetadata.get(sheetPaths[index]);
      if (!data.length) return { sheet, data: [] };
      const [[firstRow, firstCol], [lastRow, lastCol]] = metadata?.range || [[1, 1], [data.length, data[0]?.length || 0]];
      return { sheet, data: data.slice(firstRow - 1, lastRow).map((row, r) =>
        Array.from({ length: lastCol - firstCol + 1 }, (_, c) => format(row[c + firstCol - 1] ?? null, metadata?.cells.get(`${r + firstRow}:${c + firstCol}`)))) };
    });
    parentPort.postMessage({ result: output });

    function format(value, meta) {
      if (value === null || value === undefined) return null;
      if (meta?.type === 'e') return null; // Same defval handling as the former reader.
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      if (typeof value === 'string') return value;
      const code = meta?.format || 'General';
      const dateCode = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
      if (value instanceof Date || (typeof value === 'number' && /[ymdhis]/i.test(dateCode) && !/General/i.test(dateCode))) {
        if (Number.isFinite(meta?.serial)) {
          const serial = meta.serial + (epoch1904 ? 1462 : 0);
          const day = Math.floor(serial);
          const date = new Date(Date.UTC(1899, 11, 31) + (serial - (day >= 60 ? 1 : 0)) * 86400000);
          return formatDate(date, code, day === 60);
        }
        return formatDate(value, code);
      }
      if (typeof value !== 'number') return String(value);
      if (code === 'General' || code === '@') return String(value);
      const section = code.split(';')[value < 0 ? 1 : value === 0 ? 2 : 0] || code.split(';')[0];
      const pattern = section.replace(/\[[^\]]*\]/g, '').replace(/_.|\*./g, '');
      if (/E[+-]0+/i.test(pattern)) return value.toExponential((pattern.match(/\.([0#]+)/)?.[1] || '').length).replace(/e([+-])(\d+)/, (_, sign, exponent) => `E${sign}${exponent.padStart(2, '0')}`);
      const percent = pattern.includes('%');
      const decimals = pattern.match(/\.([0#]+)/)?.[1] || '';
      const numeric = (percent ? value * 100 : value);
      let text = Math.abs(numeric).toFixed(decimals.length);
      if (!decimals.length && /^0+$/.test(pattern)) text = text.padStart(pattern.length, '0');
      if (pattern.includes(',')) text = text.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      if (value < 0) text = pattern.includes('(') ? `(${text})` : `-${text}`;
      const prefix = pattern.match(/^(?:"([^"]*)"|([$£€]))/)?.slice(1).find(Boolean) || '';
      return prefix + text + (percent ? '%' : '');
    }
    function formatDate(date, code, leapDay = false) {
      const pad = n => String(n).padStart(2, '0');
      const year = date.getUTCFullYear(), month = leapDay ? 2 : date.getUTCMonth() + 1, day = leapDay ? 29 : date.getUTCDate();
      const hour = date.getUTCHours(), minute = date.getUTCMinutes(), second = date.getUTCSeconds();
      const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const twelve = /AM\/PM/i.test(code);
      return code.replace(/"([^"]*)"|AM\/PM|yyyy|yy|mmmm|mmm|mm|m|dd|d|hh|h|ss|s/gi, (token, literal, offset) => {
        if (literal !== undefined) return literal;
        switch (token.toLowerCase()) {
          case 'yyyy': return String(year); case 'yy': return pad(year % 100);
          case 'mmmm': return new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(date);
          case 'mmm': return names[month - 1];
          case 'mm': case 'm': { const minutes = /h[^ymd]*$/i.test(code.slice(0, offset)) || /^:[s]/i.test(code.slice(offset + token.length)); return token.length === 2 ? pad(minutes ? minute : month) : String(minutes ? minute : month); }
          case 'dd': return pad(day); case 'd': return String(day);
          case 'hh': return pad(twelve ? hour % 12 || 12 : hour); case 'h': return String(twelve ? hour % 12 || 12 : hour);
          case 'ss': return pad(second); case 's': return String(second);
          case 'am/pm': return hour < 12 ? 'AM' : 'PM'; default: return token;
        }
      });
    }
  } catch (error) {
    parentPort.postMessage({ error: error instanceof RangeError ? 'Invalid spreadsheet bounds. Save the file as .xlsx.' : error.message });
  }
  // Imports above are deliberately inside this function for worker serialization.
}
