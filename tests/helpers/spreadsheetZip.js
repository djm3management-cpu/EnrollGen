// Original test-only ZIP construction, using Node's built-in compression.
// No spreadsheet writing library or third-party source is included.
import { deflateRawSync, inflateRawSync } from 'node:zlib';
export function unpackZip(buffer) {
  const end = buffer.length - 22;
  let cursor = buffer.readUInt32LE(end + 16);
  const entries = {};
  for (let i = 0; i < buffer.readUInt16LE(end + 10); i++) {
    const compressed = buffer.readUInt32LE(cursor + 20);
    const offset = buffer.readUInt32LE(cursor + 42);
    const n = buffer.readUInt16LE(cursor + 28), x = buffer.readUInt16LE(cursor + 30), c = buffer.readUInt16LE(cursor + 32);
    const name = buffer.subarray(cursor + 46, cursor + 46 + n).toString();
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const content = buffer.subarray(start, start + compressed);
    entries[name] = buffer.readUInt16LE(cursor + 10) === 8 ? inflateRawSync(content) : content;
    cursor += 46 + n + x + c;
  }
  return entries;
}
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
export function packZip(entries) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const content = Buffer.from(data), path = Buffer.from(name), compressed = deflateRawSync(content);
    const local = Buffer.alloc(30), directory = Buffer.alloc(46), crc = crc32(content);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(path.length, 26);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(content.length, 24); directory.writeUInt16LE(path.length, 28); directory.writeUInt32LE(offset, 42);
    locals.push(local, path, compressed); central.push(directory, path);
    offset += local.length + path.length + compressed.length;
  }
  const index = Buffer.concat(central), end = Buffer.alloc(22), count = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, index, end]);
}
