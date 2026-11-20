// =====================================================================
// Đọc / ghi file Excel (.xlsx) ngay trên trình duyệt – giữ nguyên hàm
// .xlsx là tệp nén gồm các tệp XML; dùng JSZip (js/vendor) để nén / giải nén.
// =====================================================================
import { colLetter, letterIdx } from './formula.js';

let zipLib = null;
export function loadZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return zipLib ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL('./vendor/jszip.min.js', import.meta.url).href;
    s.onload = () => res(window.JSZip); s.onerror = () => rej(new Error('Không tải được thư viện đọc Excel'));
    document.head.append(s);
  });
}

const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
const kid = (el, name) => kids(el, name)[0] || null;
const all = (el, name) => el ? [...el.getElementsByTagNameNS('*', name)] : [];
const parseRef = (r) => { const m = /^([A-Z]+)(\d+)$/.exec(r); return m ? { c: letterIdx(m[1]), r: Number(m[2]) - 1 } : null; };

// Định dạng số Excel → định dạng hiển thị của web
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
function fmtOf(id, code) {
  if (DATE_IDS.has(id)) return 'date';
  if ([9, 10].includes(id)) return 'pctx';
  if ([3, 37, 38].includes(id)) return 'int';
  if ([2, 4, 39, 40].includes(id)) return 'dec2';
  if (!code) return null;
  const c = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, (m) => /đ|₫|VND/i.test(m) ? 'Đ' : '');
  if (/Đ/.test(c) || /đ|₫/.test(code)) return 'vnd';
  if (/%/.test(c)) return 'pctx';
  if (/[dy]/i.test(c) || (/m/i.test(c) && !/[0#]/.test(c))) return 'date';
  if (/0\.0/.test(c)) return 'dec2';
  if (/[#0],[#0]/.test(c) || /^0$/.test(c)) return 'int';
  return null;
}

// Dịch công thức chia sẻ (shared formula) sang ô khác: dời tham chiếu tương đối (không có $)
export function shiftA1(f, dr, dc) {
  return f.split(/("(?:[^"]|"")*")/).map((seg, i) => i % 2 ? seg : seg.replace(/(^|[^A-Za-z0-9_.!'])((?:'(?:[^']|'')+'|[A-Za-z_À-￿][\w.À-￿]*)!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])/g,
    (m, pre, sh, dc$, col, dr$, row) => `${pre}${sh || ''}${dc$}${dc$ ? col : colLetter(letterIdx(col) + dc)}${dr$}${dr$ ? row : Number(row) + dr}`)).join('');
}

// ---------- ĐỌC ----------
// Trả về [{ name, cells: Map("r,c" → {v, f, fmt}), maxRow, maxCol, widths: {c: px} }]
export async function readXlsx(buf) {
  const JSZip = await loadZip();
  const zip = await JSZip.loadAsync(buf);
  const read = async (p) => { const f = zip.file(p.replace(/^\//, '')); return f ? xml(await f.async('string')) : null; };
  const wb = await read('xl/workbook.xml');
  if (!wb) throw new Error('Không phải file Excel (.xlsx) hợp lệ');
  const rels = await read('xl/_rels/workbook.xml.rels');
  const target = {}; all(rels, 'Relationship').forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const sst = await read('xl/sharedStrings.xml');
  const strings = all(sst, 'si').map(si => all(si, 't').filter(t => t.parentNode.localName !== 'rPh').map(t => t.textContent).join(''));
  const styles = await read('xl/styles.xml');
  const codes = {}; all(styles, 'numFmt').forEach(n => { codes[Number(n.getAttribute('numFmtId'))] = n.getAttribute('formatCode'); });
  const xfFmt = kids(kid(styles?.documentElement, 'cellXfs'), 'xf').map(x => { const id = Number(x.getAttribute('numFmtId') || 0); return fmtOf(id, codes[id]); });
  const sheets = [];
  for (const s of all(wb, 'sheet')) {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    let path = target[rid] || ''; path = path.startsWith('/') ? path.slice(1) : 'xl/' + path.replace(/^\.\//, '');
    const doc = await read(path); if (!doc) continue;
    const cells = new Map(); const shared = {};
    let maxRow = 0, maxCol = 0;
    for (const c of all(doc, 'c')) {
      const pos = parseRef(c.getAttribute('r') || ''); if (!pos) continue;
      const t = c.getAttribute('t'), fEl = kid(c, 'f'), vEl = kid(c, 'v');
      let v = vEl ? vEl.textContent : '';
      if (t === 's') v = strings[Number(v)] ?? '';
      else if (t === 'inlineStr') v = all(c, 't').map(x => x.textContent).join('');
      else if (t === 'b') v = v === '1';
      else if (t === 'str' || t === 'e') { /* chuỗi / lỗi */ }
      else if (t === 'd') v = v.slice(0, 10);
      else if (v !== '') v = Number(v);
      let f = null;
      if (fEl) {
        const txt = fEl.textContent, si = fEl.getAttribute('si');
        if (fEl.getAttribute('t') === 'shared' && si != null) {
          if (txt) shared[si] = { f: txt, ...pos };
          else if (shared[si]) f = shiftA1(shared[si].f, pos.r - shared[si].r, pos.c - shared[si].c);
        }
        if (!f && txt) f = txt;
      }
      if (v === '' && !f) continue;
      cells.set(pos.r + ',' + pos.c, { v, f: f ? '=' + f : null, fmt: xfFmt[Number(c.getAttribute('s') || 0)] || null });
      maxRow = Math.max(maxRow, pos.r + 1); maxCol = Math.max(maxCol, pos.c + 1);
    }
    const widths = {};
    all(doc, 'col').forEach(col => { const w = Number(col.getAttribute('width')); if (!w) return; for (let i = Number(col.getAttribute('min')) - 1; i < Math.min(Number(col.getAttribute('max')), 200); i++) widths[i] = Math.round(w * 7 + 5); });
    sheets.push({ name: s.getAttribute('name'), cells, maxRow, maxCol, widths });
  }
  return sheets;
}

// ---------- GHI ----------
// sheets: [{ name, rows: [[cell]], widths: [px], bold: Set(rowIdx), freeze: rows }]
// cell: { v, f (không có dấu =), fmt } hoặc null
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STYLE = { int: 2, dec2: 3, date: 4, vnd: 5, pctx: 6 };
export function safeSheetNames(names) {
  const used = new Set();
  return names.map(n => {
    let s = String(n || 'Sheet').replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet', base = s, i = 2;
    while (used.has(s.toLowerCase())) { const suf = ` (${i++})`; s = base.slice(0, 31 - suf.length) + suf; }
    used.add(s.toLowerCase()); return s;
  });
}
export async function writeXlsx(sheets) {
  const JSZip = await loadZip();
  const zip = new JSZip();
  const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${MAIN}"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="#,##0 &quot;đ&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCCBAB"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((s, si) => {
    const rowsXml = s.rows.map((row, r) => {
      const cs = row.map((c, ci) => {
        if (!c || (c.v === '' && !c.f) || c.v == null && !c.f) return '';
        const ref = colLetter(ci) + (r + 1);
        const st = s.bold?.has(r) ? 1 : STYLE[c.fmt] || 0;
        const sAttr = st ? ` s="${st}"` : '';
        const v = c.v;
        if (c.f) {
          const f = `<f>${esc(c.f)}</f>`;
          if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${sAttr}>${f}<v>${v}</v></c>`;
          if (typeof v === 'boolean') return `<c r="${ref}"${sAttr} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
          if (v && typeof v === 'object' && v.code) return `<c r="${ref}"${sAttr} t="e">${f}<v>${esc(v.code)}</v></c>`;
          return `<c r="${ref}"${sAttr} t="str">${f}<v>${esc(v ?? '')}</v></c>`;
        }
        if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${sAttr}><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${ref}"${sAttr} t="b"><v>${v ? 1 : 0}</v></c>`;
        return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      }).join('');
      return cs ? `<row r="${r + 1}">${cs}</row>` : '';
    }).join('');
    const cols = (s.widths || []).map((w, i) => w ? `<col min="${i + 1}" max="${i + 1}" width="${Math.max(6, Math.round((w - 5) / 7))}" customWidth="1"/>` : '').join('');
    const pane = s.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${s.freeze}" topLeftCell="A${s.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
    zip.file(`xl/worksheets/sheet${si + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${MAIN}" xmlns:r="${REL}">${pane}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml}</sheetData>${s.merges?.length ? `<mergeCells count="${s.merges.length}">${s.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}</worksheet>`);
  });
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
