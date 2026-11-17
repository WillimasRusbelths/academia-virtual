import { MaterialError } from '../domain/material-error.js';

function check(condition: unknown): asserts condition {
  if (!condition) throw new MaterialError('VALIDATION_ERROR', ['mediaType']);
}
type Reference = { object: number; generation: number };
type Value = number | string | Reference | Value[] | Map<string, Value>;
const whitespace = (byte: number) => [0, 9, 10, 12, 13, 32].includes(byte);
const delimiter = (byte: number) => whitespace(byte) || [40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(byte);

/** Only structural dictionaries are read. Streams are never decoded or executed.
 * Depth <= 64 and every token advances within the already bounded upload.
 */
class Reader {
  constructor(readonly bytes: Buffer, public position: number) {}
  skip(): void {
    while (this.position < this.bytes.length) {
      if (whitespace(this.bytes[this.position])) { this.position++; continue; }
      if (this.bytes[this.position] !== 37) break;
      while (this.position < this.bytes.length && ![10, 13].includes(this.bytes[this.position])) this.position++;
    }
  }
  token(): string {
    this.skip(); const start = this.position;
    check(start < this.bytes.length);
    const byte = this.bytes[this.position++];
    if (byte === 40) {
      let depth = 1;
      while (this.position < this.bytes.length && depth) {
        const next = this.bytes[this.position++];
        if (next === 92) this.position++; else if (next === 40) depth++; else if (next === 41) depth--;
        check(depth <= 64);
      }
      check(depth === 0 && this.position <= this.bytes.length); return '(literal)';
    }
    if ((byte === 60 || byte === 62) && this.bytes[this.position] === byte) { this.position++; return byte === 60 ? '<<' : '>>'; }
    if (byte === 60) {
      while (this.position < this.bytes.length && this.bytes[this.position] !== 62) {
        check(whitespace(this.bytes[this.position]) || /[0-9a-f]/i.test(String.fromCharCode(this.bytes[this.position]))); this.position++;
      }
      check(this.bytes[this.position++] === 62); return '<hex>';
    }
    if (byte === 91 || byte === 93) return String.fromCharCode(byte);
    while (this.position < this.bytes.length && !delimiter(this.bytes[this.position])) this.position++;
    // Names and keywords in structural dictionaries are small; no unbounded text copy.
    check(this.position - start <= 1024);
    return this.bytes.toString('latin1', start, this.position).replace(/#([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }
  number(): number {
    const token = this.token(); check(/^\d+$/.test(token));
    const value = Number(token); check(Number.isSafeInteger(value)); return value;
  }
  value(depth = 0): Value {
    check(depth < 64); const token = this.token();
    if (token === '<<') {
      const values = new Map<string, Value>();
      while (true) {
        const key = this.token(); if (key === '>>') return values;
        check(key.startsWith('/') && !values.has(key)); values.set(key, this.value(depth + 1));
      }
    }
    if (token === '[') {
      const values: Value[] = [];
      while (true) {
        const position = this.position;
        if (this.token() === ']') return values;
        this.position = position; values.push(this.value(depth + 1));
      }
    }
    check(token !== '>>' && token !== ']');
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(token)) {
      const number = Number(token); check(Number.isFinite(number));
      const position = this.position;
      if (/^\d+$/.test(token)) {
        const generation = this.token();
        if (/^\d+$/.test(generation) && this.token() === 'R') {
          check(Number.isSafeInteger(number) && number > 0 && Number(generation) <= 65535);
          return { object: number, generation: Number(generation) };
        }
      }
      this.position = position; return number;
    }
    return token;
  }
}
function dictionary(value: Value): Map<string, Value> { check(value instanceof Map); return value; }
function reference(value: Value | undefined): value is Reference {
  return typeof value === 'object' && value !== null && 'object' in value;
}
function positive(value: Value | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Checks the terminal cross-reference structure and predecessor chain, including
 * xref-stream framing. It does not claim to validate page operators or decode objects.
 */
export function validatePdfStructure(bytes: Buffer): void {
  check(/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n|\r|\n)/.test(bytes.toString('latin1', 0, 16)));
  const tail = bytes.toString('latin1', Math.max(0, bytes.length - 1024));
  // PDF whitespace explicitly includes byte zero (ISO 32000 lexical conventions).
  // eslint-disable-next-line no-control-regex
  const terminal = /startxref[\x00\t\n\f\r ]+(\d+)[\x00\t\n\f\r ]+%%EOF[\x00\t\n\f\r ]*$/.exec(tail);
  check(terminal); let offset = Number(terminal[1]);
  const visited = new Set<number>(), objects = new Map<string, number>();
  let root: Reference | undefined, hasXrefStream = false;
  while (true) {
    check(Number.isSafeInteger(offset) && offset > 0 && offset < bytes.length && !visited.has(offset)); visited.add(offset);
    const reader = new Reader(bytes, offset);
    let trailer: Map<string, Value>;
    if (reader.token() === 'xref') {
      let entries = 0, subsections = 0;
      while (true) {
        const start = reader.position, token = reader.token();
        if (token === 'trailer') break;
        reader.position = start;
        const first = reader.number(), count = reader.number();
        // A trailer-only incremental update may contain an empty subsection.
        // Its predecessor must still resolve real objects and the catalog below.
        check(count >= 0 && first + count <= Number.MAX_SAFE_INTEGER && count <= bytes.length / 20);
        subsections++;
        for (let index = 0; index < count; index++) {
          reader.skip();
          const entry = /^(\d{10}) (\d{5}) ([nf])(?: \r| \n|\r\n)/.exec(bytes.toString('latin1', reader.position, reader.position + 20));
          check(entry); reader.position += 20; entries++;
          check(Number(entry[2]) <= 65535);
          if (entry[3] === 'n') {
            const target = Number(entry[1]); check(target > 0 && target < bytes.length);
            const object = new Reader(bytes, target);
            check(object.number() === first + index && object.number() === Number(entry[2]) && object.token() === 'obj');
            const key = `${first + index}:${Number(entry[2])}`;
            if (!objects.has(key)) objects.set(key, target);
          }
        }
      }
      trailer = dictionary(reader.value());
      check(subsections > 0 && (entries > 0 || positive(trailer.get('/Prev'))));
    } else {
      hasXrefStream = true;
      // PDF >= 1.5 may point startxref directly to an indirect cross-reference stream.
      reader.position = offset; check(reader.number() > 0 && reader.number() <= 65535 && reader.token() === 'obj');
      trailer = dictionary(reader.value());
      const widths = trailer.get('/W'), length = trailer.get('/Length');
      check(trailer.get('/Type') === '/XRef' && Array.isArray(widths) && widths.length === 3
        && widths.every(width => typeof width === 'number' && Number.isSafeInteger(width) && width >= 0 && width <= 8)
        && widths.some(width => Number(width) > 0) && positive(length));
      check(reader.token() === 'stream');
      if (bytes[reader.position] === 13) { reader.position++; if (bytes[reader.position] === 10) reader.position++; }
      else check(bytes[reader.position++] === 10);
      check(reader.position + length <= bytes.length); reader.position += length;
      check(reader.token() === 'endstream' && reader.token() === 'endobj');
    }
    check(positive(trailer.get('/Size')));
    if (trailer.has('/Root')) {
      const candidate = trailer.get('/Root'); check(reference(candidate)); root ??= candidate;
    }
    if (!trailer.has('/Prev')) break;
    const previous = trailer.get('/Prev'); check(positive(previous) && previous < offset); offset = previous;
  }
  check(root);
  if (!hasXrefStream) {
    for (const target of objects.values()) {
      const reader = new Reader(bytes, target); reader.number(); reader.number(); check(reader.token() === 'obj');
      const value = reader.value();
      const next = reader.token();
      if (next === 'stream') {
        const attributes = dictionary(value); let length = attributes.get('/Length');
        if (reference(length)) {
          const target = objects.get(`${length.object}:${length.generation}`); check(target !== undefined);
          const indirect = new Reader(bytes, target); indirect.number(); indirect.number(); check(indirect.token() === 'obj');
          length = indirect.value(); check(indirect.token() === 'endobj');
        }
        check(typeof length === 'number' && Number.isSafeInteger(length) && length >= 0);
        if (bytes[reader.position] === 13) { reader.position++; if (bytes[reader.position] === 10) reader.position++; }
        else check(bytes[reader.position++] === 10);
        check(reader.position + length <= bytes.length); reader.position += length;
        check(reader.token() === 'endstream' && reader.token() === 'endobj');
      } else check(next === 'endobj');
    }
    const target = objects.get(`${root.object}:${root.generation}`); check(target !== undefined);
    const catalog = new Reader(bytes, target); catalog.number(); catalog.number(); check(catalog.token() === 'obj');
    const attributes = dictionary(catalog.value()); check(attributes.get('/Type') === '/Catalog' && reference(attributes.get('/Pages')));
  }
}
