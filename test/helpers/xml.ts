// Strict XML 1.0 well-formedness check for the SVG output (no DOM needed, so it also runs in the
// Node environment of the SSR tests). Shared by test/svg.test.ts and test/ssr.test.ts.

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

/** Control characters and noncharacters that XML 1.0 forbids (tab, LF and CR are allowed). */
// eslint-disable-next-line no-control-regex
const INVALID_CHAR_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/;

/** Throws on unescaped `&`, characters forbidden by XML 1.0 and lone surrogates. */
function checkChars(text: string, where: string): void {
  const badAmp = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.exec(text);
  if (badAmp) throw new Error(`unescaped & in ${where}: ${text.slice(Math.max(0, badAmp.index - 20), badAmp.index + 20)}`);
  const invalid = INVALID_CHAR_RE.exec(text);
  if (invalid) {
    const code = invalid[0].charCodeAt(0).toString(16).padStart(4, '0');
    throw new Error(`invalid XML character U+${code.toUpperCase()} in ${where}`);
  }
  // Valid pairs removed first: anything left in the surrogate range is a lone surrogate.
  if (/[\ud800-\udfff]/.test(text.replace(/[\ud800-\udbff][\udc00-\udfff]/g, ''))) {
    throw new Error(`lone surrogate in ${where}`);
  }
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/**
 * Throws unless `xml` is a well-formed XML document with a single root element: balanced tags,
 * double-quoted unique attributes, valid entity references and XML 1.0 characters only
 * (in text, in `<style>` content and in attribute values).
 */
export function assertWellFormedXml(xml: string): void {
  const stack: string[] = [];
  let roots = 0;
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const text = lt === -1 ? xml.slice(i) : xml.slice(i, lt);
    checkChars(text, stack.length ? `<${stack[stack.length - 1]}> content` : 'text');
    if (stack.length === 0 && text.trim()) throw new Error(`text outside the root element: ${text.slice(0, 40)}`);
    if (lt === -1) break;
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt);
      if (end < 0) throw new Error('unterminated comment');
      i = end + 3;
      continue;
    }
    if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt);
      const name = xml.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (open !== name) throw new Error(`</${name}> closes <${open}>`);
      i = end + 1;
      continue;
    }
    if (xml.startsWith('<!', lt) || xml.startsWith('<?', lt)) throw new Error('unexpected declaration');
    let j = lt + 1;
    const nameMatch = /^[A-Za-z_][\w.-]*/.exec(xml.slice(j));
    if (!nameMatch) throw new Error(`bad tag at ${xml.slice(lt, lt + 30)}`);
    const name = nameMatch[0];
    j += name.length;
    const seen = new Set<string>();
    let selfClosing = false;
    for (;;) {
      const ws = /^[ \t\r\n]*/.exec(xml.slice(j))?.[0] ?? '';
      j += ws.length;
      if (xml.startsWith('/>', j)) {
        selfClosing = true;
        j += 2;
        break;
      }
      if (xml[j] === '>') {
        j += 1;
        break;
      }
      if (!ws) throw new Error(`missing space before attribute in <${name}>`);
      const attr = /^([A-Za-z_:][\w:.-]*)="([^"<]*)"/.exec(xml.slice(j));
      if (!attr) throw new Error(`bad attribute in <${name}>: ${xml.slice(j, j + 40)}`);
      if (seen.has(attr[1])) throw new Error(`duplicate attribute ${attr[1]} in <${name}>`);
      seen.add(attr[1]);
      checkChars(attr[2], `attribute ${attr[1]}`);
      j += attr[0].length;
    }
    if (stack.length === 0) roots++;
    if (!selfClosing) stack.push(name);
    i = j;
  }
  if (stack.length) throw new Error(`unclosed <${stack.join('>, <')}>`);
  if (roots !== 1) throw new Error(`${roots} root elements`);
}
