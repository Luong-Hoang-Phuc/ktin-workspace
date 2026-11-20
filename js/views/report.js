// =====================================================================
// 📄 XUẤT BÁO CÁO THUYẾT MINH: bìa · mục lục · 8 chương (bảng lấy thẳng từ CSDL + ghi chú từng mục)
// - Tải Word (.docx): Times New Roman 13, A4, lề trái 3 cm, có mục lục tự cập nhật & số trang
// - In / Lưu PDF: dùng hộp thoại in của trình duyệt (chọn “Lưu dưới dạng PDF”)
// =====================================================================
import db from '../db.js';
import { store, productOf, folderFor, nameOf } from '../store.js';
import { h, fill, toast, toastErr, miniMarkdown, downloadNote } from '../ui.js';
import { SECTIONS, MACHINE_COLUMNS } from './templates.js';
import { bookOf, sortRows } from './book.js';
import { mergeMap } from './sheet.js';
import { fmtValue, FErr } from '../formula.js';
import { loadZip } from '../xlsx.js';
import { jsonSetting } from '../store.js';

const LS = (pid) => 'ktin-report-' + pid;
const loadOpts = (pid) => { try { return JSON.parse(localStorage.getItem(LS(pid))) || {}; } catch { return {}; } };
const saveOpts = (pid, o) => { try { localStorage.setItem(LS(pid), JSON.stringify(o)); } catch {} };
const textOf = (c, v) => v instanceof FErr ? v.code : c.type === 'person' ? (v ? nameOf(v) : '') : c.type === 'check' ? (v ? '✓' : '') : fmtValue(v, c);

// ---------- gom dữ liệu thành “mô hình báo cáo” (dùng chung cho xem trước, Word, PDF) ----------
async function buildModel(pid, opt) {
  const p = productOf(pid);
  const chapters = [];
  let tableNo = 0;
  for (const sec of SECTIONS.filter(s => s.n)) {
    const f = folderFor(pid, sec.key);
    const ch = { n: sec.n, title: sec.label, blocks: [] };
    if (f) {
      const [tables, notes] = await Promise.all([db.select('data_tables', { eq: { folder_id: f.id }, order: ['created_at', true] }), db.select('notes', { eq: { folder_id: f.id }, order: ['created_at', true] }).catch(() => [])]);
      if (opt.notes) for (const n of notes) if ((n.content || '').trim()) ch.blocks.push({ type: 'note', title: n.title, md: n.content });
      if (opt.tables) {
        const data = await Promise.all(tables.map(async t => ({ table: t, rows: sortRows(await db.select('data_rows', { eq: { table_id: t.id } })) })));
        const B = bookOf(data);
        for (const { table, rows } of data) {
          if (!rows.length || /tiến độ đồ án/i.test(table.name)) continue;
          const S = B.sheet(table.id), cols = table.columns || [];
          const M = mergeMap(cols, rows);
          ch.blocks.push({ type: 'table', caption: `Bảng ${sec.n}.${++tableNo}. ${table.name}`, head: cols.map(c => c.label), num: cols.map(c => c.type === 'number' || !!c.formula),
            rows: rows.map((r, ri) => cols.map((c, ci) => textOf(r.cells?._f?.[c.key] ? { ...c, fmt: r.cells._f[c.key] } : c, S.get(ri, c.key)))), merges: [...M.anchors.values()].map(a => ({ r: a.ri, c: a.ci, rs: a.rs, cs: a.cs })) });
        }
        if (sec.key === 'factory') {
          const ms = await db.select('machines', { order: ['position', true] }).catch(() => []);
          const cols = jsonSetting('machine_columns', MACHINE_COLUMNS).filter(c => !c.key?.startsWith('_'));
          if (ms.length) ch.blocks.push({ type: 'table', caption: `Bảng ${sec.n}.${++tableNo}. Bảng thiết bị`, head: ['Máy', ...cols.map(c => c.label)], num: [false, ...cols.map(c => c.type === 'number')],
            rows: ms.map(m => [m.name, ...cols.map(c => textOf(c, m.cells?.[c.key] ?? ''))]), merges: [] });
        }
      }
    }
    tableNo = 0;
    if (ch.blocks.length || !opt.skipEmpty) chapters.push(ch);
  }
  return { product: p, opt, chapters };
}

// ---------- xem trước (HTML, cũng là bản in PDF) ----------
function renderHtml(m) {
  const o = m.opt;
  const table = (b) => {
    const cover = new Set(); const span = new Map();
    b.merges.forEach(x => { span.set(`${x.r}:${x.c}`, x); for (let i = x.r; i < x.r + x.rs; i++) for (let j = x.c; j < x.c + x.cs; j++) if (i !== x.r || j !== x.c) cover.add(`${i}:${j}`); });
    return h('figure', { class: 'rp-fig' }, h('figcaption', {}, b.caption), h('table', { class: 'rp-t' },
      h('thead', {}, h('tr', {}, b.head.map(x => h('th', {}, x)))),
      h('tbody', {}, b.rows.map((row, ri) => h('tr', {}, row.map((v, ci) => {
        if (cover.has(`${ri}:${ci}`)) return null;
        const s = span.get(`${ri}:${ci}`), td = h('td', { class: b.num[ci] ? 'num' : '' }, v);
        if (s) { td.rowSpan = s.rs; td.colSpan = s.cs; td.className = 'mg'; }
        return td;
      }))))));
  };
  return h('div', { class: 'rp-doc' },
    h('section', { class: 'rp-cover' },
      h('div', { class: 'rp-school' }, o.school || 'TRƯỜNG ……………………', h('br'), o.faculty || 'KHOA ……………………'),
      h('div', { class: 'rp-kind' }, 'ĐỒ ÁN MÔN HỌC'),
      h('h1', {}, o.title || 'KINH TẾ & TỔ CHỨC SẢN XUẤT IN'),
      h('div', { class: 'rp-sub' }, `Sản phẩm: ${m.product?.name || ''}`),
      h('div', { class: 'rp-meta' }, o.teacher ? h('div', {}, 'Giảng viên hướng dẫn: ', h('b', {}, o.teacher)) : null,
        h('div', {}, 'Nhóm thực hiện: ', h('b', {}, o.team || [...store.profiles.values()].map(x => x.display_name || x.email).join(', '))),
        o.klass ? h('div', {}, 'Lớp: ', h('b', {}, o.klass)) : null),
      h('div', { class: 'rp-date' }, o.place || '', o.place ? ', ' : '', 'ngày ', new Date().toLocaleDateString('vi-VN'))),
    h('section', { class: 'rp-toc' }, h('h2', {}, 'MỤC LỤC'), h('ol', {}, m.chapters.map(c => h('li', {}, `Chương ${c.n}. ${c.title}`)))),
    m.chapters.map(c => h('section', { class: 'rp-ch' }, h('h2', {}, `CHƯƠNG ${c.n}. ${c.title.toUpperCase()}`),
      c.blocks.length ? c.blocks.map(b => b.type === 'table' ? table(b) : h('div', { class: 'rp-note' }, b.title ? h('h3', {}, b.title) : null, h('div', { html: miniMarkdown(b.md) })))
        : h('p', { class: 'rp-empty' }, '(Chưa có nội dung – nhập bảng ở Cơ sở dữ liệu hoặc viết ở tab Ghi chú của mục này.)'))));
}

// ---------- Word (.docx) ----------
const X = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (t, { b, i, sz } = {}) => `<w:r><w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${sz ? `<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
const para = (inner, { style, align, keep, pageBreak } = {}) => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${keep ? '<w:keepNext/>' : ''}${pageBreak ? '<w:pageBreakBefore/>' : ''}${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${inner}</w:p>`;
// **đậm** *nghiêng* trong ghi chú → các đoạn chữ
function mdRuns(s) {
  const out = []; const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g; let last = 0, m;
  while ((m = re.exec(s))) { if (m.index > last) out.push(run(s.slice(last, m.index))); out.push(m[1] ? run(m[1], { b: true }) : run(m[2], { i: true })); last = re.lastIndex; }
  if (last < s.length) out.push(run(s.slice(last)));
  return out.join('');
}
function mdParas(md) {
  return String(md || '').split('\n').map(line => {
    const t = line.trimEnd();
    if (!t.trim()) return '';
    if (/^```/.test(t)) return '';
    const hm = /^(#{1,3})\s+(.*)$/.exec(t); if (hm) return para(run(hm[2], { b: true }), { style: 'Heading3', keep: true });
    const li = /^\s*[-*•]\s+(.*)$/.exec(t); if (li) return para(mdRuns(li[1]), { style: 'ListBullet' });
    const ol = /^\s*(\d+)[.)]\s+(.*)$/.exec(t); if (ol) return para(run(ol[1] + '. ') + mdRuns(ol[2]), { style: 'ListNum' });
    return para(mdRuns(t));
  }).join('');
}
function tableXml(b) {
  const n = b.head.length, W = 9071;   // bề rộng vùng in (A4, lề trái 3 cm, phải 2 cm) – twip
  const cw = Math.floor(W / Math.max(1, n));
  const anchor = new Map(), cover = new Map();
  b.merges.forEach(x => { anchor.set(`${x.r}:${x.c}`, x); for (let i = x.r; i < x.r + x.rs; i++) for (let j = x.c; j < x.c + x.cs; j++) if (i !== x.r || j !== x.c) cover.set(`${i}:${j}`, x); });
  const sz = n > 10 ? 15 : n > 7 ? 18 : 22;   // bảng nhiều cột → chữ nhỏ lại cho vừa trang
  const cell = (txt, { head, num, span = 1, vm } = {}) => `<w:tc><w:tcPr><w:tcW w:w="${cw * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${vm ? `<w:vMerge${vm === 'restart' ? ' w:val="restart"' : ''}/>` : ''}${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E7DCC6"/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${para(run(txt, { b: head, sz }), { align: head || vm ? 'center' : num ? 'right' : 'left', style: 'TableText' })}</w:tc>`;
  const rows = b.rows.map((row, ri) => {
    let cells = '';
    for (let ci = 0; ci < n; ci++) {
      const a = anchor.get(`${ri}:${ci}`), cv = cover.get(`${ri}:${ci}`);
      if (a) { cells += cell(row[ci], { num: b.num[ci], span: a.cs, vm: a.rs > 1 ? 'restart' : null }); ci += a.cs - 1; continue; }
      if (cv) { if (cv.c === ci && ri > cv.r) { cells += cell('', { span: cv.cs, vm: 'continue' }); ci += cv.cs - 1; } continue; }
      cells += cell(row[ci], { num: b.num[ci] });
    }
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cells}</w:tr>`;
  }).join('');
  return para(run(b.caption, { b: true, i: true }), { style: 'Caption', align: 'center', keep: true }) +
    `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="555555"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array(n).fill(`<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>` +
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>${b.head.map(x => cell(x, { head: true })).join('')}</w:tr>${rows}</w:tbl>` + para('');
}
async function buildDocx(m) {
  const o = m.opt;
  const team = o.team || [...store.profiles.values()].map(x => x.display_name || x.email).join(', ');
  const cover = [
    para(run((o.school || 'TRƯỜNG ……………………').toUpperCase(), { b: true }), { align: 'center' }),
    para(run((o.faculty || 'KHOA ……………………').toUpperCase(), { b: true }), { align: 'center' }),
    ...Array(6).fill(para('')),
    para(run('ĐỒ ÁN MÔN HỌC', { b: true, sz: 30 }), { align: 'center' }),
    para(run(o.title || 'KINH TẾ & TỔ CHỨC SẢN XUẤT IN', { b: true, sz: 40 }), { align: 'center' }),
    para(run(`Sản phẩm: ${m.product?.name || ''}`, { sz: 30 }), { align: 'center' }),
    ...Array(5).fill(para('')),
    o.teacher ? para(run('Giảng viên hướng dẫn: ') + run(o.teacher, { b: true }), { align: 'left' }) : '',
    para(run('Nhóm thực hiện: ') + run(team, { b: true })),
    o.klass ? para(run('Lớp: ') + run(o.klass, { b: true })) : '',
    ...Array(4).fill(para('')),
    para(run(`${o.place ? o.place + ', ' : ''}ngày ${new Date().toLocaleDateString('vi-VN')}`, { i: true }), { align: 'center' }),
  ].join('');
  const toc = para(run('MỤC LỤC', { b: true, sz: 28 }), { align: 'center', pageBreak: true }) +
    `<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('(Mục lục sẽ tự cập nhật khi mở bằng Word – bấm “Có/Yes” nếu Word hỏi cập nhật trường. Nếu chưa hiện: bấm chuột phải vào đây → Update Field.)', { i: true })}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const body = m.chapters.map((c, i) => para(run(`CHƯƠNG ${c.n}. ${c.title.toUpperCase()}`), { style: 'Heading1', pageBreak: true }) +
    (c.blocks.length ? c.blocks.map(b => b.type === 'table' ? tableXml(b) : (b.title ? para(run(b.title), { style: 'Heading2' }) : '') + mdParas(b.md)).join('')
      : para(run('(Chưa có nội dung.)', { i: true })))).join('');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${cover}${toc}${body}<w:sectPr><w:footerReference w:type="default" r:id="rIdF1"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr></w:body></w:document>`;
  const font = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>';
  const st = (id, name, rpr, ppr = '', extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="312" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    st('Heading1', 'heading 1', '<w:b/><w:sz w:val="28"/>', '<w:keepNext/><w:spacing w:before="240" w:after="240"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>') +
    st('Heading2', 'heading 2', '<w:b/><w:sz w:val="26"/>', '<w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="1"/>') +
    st('Heading3', 'heading 3', '<w:b/><w:i/><w:sz w:val="26"/>', '<w:keepNext/><w:spacing w:before="120" w:after="60"/><w:outlineLvl w:val="2"/>') +
    st('Caption', 'caption', '<w:b/><w:i/><w:sz w:val="24"/>', '<w:keepNext/><w:spacing w:before="160" w:after="80"/><w:jc w:val="center"/>') +
    st('TableText', 'Table Text', '<w:sz w:val="22"/>', '<w:spacing w:after="0" w:line="252" w:lineRule="auto"/>') +
    st('ListBullet', 'List Bullet', '', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="567" w:hanging="283"/>') +
    st('ListNum', 'List Num', '', '<w:ind w:left="567" w:hanging="283"/>') +
    st('TOC1', 'toc 1', '<w:b/>', '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9061"/></w:tabs><w:spacing w:after="60"/>') +
    st('TOC2', 'toc 2', '', '<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9061"/></w:tabs><w:spacing w:after="40"/><w:ind w:left="283"/>') + '</w:styles>';
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="–"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const JSZip = await loadZip();
  const zip = new JSZip();
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`, { createFolders: false });
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`, { createFolders: false });
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rId3" Type="${REL}/numbering" Target="numbering.xml"/><Relationship Id="rIdF1" Type="${REL}/footer" Target="footer1.xml"/></Relationships>`, { createFolders: false });
  zip.file('word/document.xml', doc, { createFolders: false });
  zip.file('word/styles.xml', styles, { createFolders: false });
  zip.file('word/numbering.xml', numbering, { createFolders: false });
  zip.file('word/footer1.xml', footer, { createFolders: false });
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings ${W}><w:defaultTabStop w:val="720"/><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`, { createFolders: false });
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- trang Xuất báo cáo ----------
export function mountReport(el, { product }) {
  const opt = { notes: true, tables: true, skipEmpty: false, title: '', school: '', faculty: '', teacher: '', team: '', klass: '', place: '', ...loadOpts(product.id) };
  const preview = h('div', { class: 'rp-preview' });
  let model = null;
  const field = (k, label, ph) => h('label', { class: 'field' }, h('span', {}, label), h('input', { class: 'input', value: opt[k] || '', placeholder: ph, onchange: (e) => { opt[k] = e.target.value.trim(); saveOpts(product.id, opt); refresh(); } }));
  const check = (k, label) => h('label', { class: 'row small', style: { gap: '6px' } }, h('input', { type: 'checkbox', checked: !!opt[k], onchange: (e) => { opt[k] = e.target.checked; saveOpts(product.id, opt); refresh(); } }), label);
  const tools = h('div', { class: 'card card-pad report-tools' },
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px', marginBottom: '10px' } },
      h('b', { class: 'serif', style: { fontSize: '16px' } }, 'Thuyết minh đồ án – ' + product.name), h('div', { class: 'grow' }),
      h('button', { class: 'btn btn-primary', onclick: downloadWord }, '⬇ Tải Word (.docx)'),
      h('button', { class: 'btn', onclick: printPdf, title: 'Mở hộp thoại in → chọn “Lưu dưới dạng PDF”' }, '🖨 In / Lưu PDF')),
    h('div', { class: 'rp-form' },
      field('title', 'Tên đề tài', 'KINH TẾ & TỔ CHỨC SẢN XUẤT IN'), field('school', 'Trường', 'VD: Trường ĐH Sư phạm Kỹ thuật TP.HCM'), field('faculty', 'Khoa', 'VD: Khoa In và Truyền thông'),
      field('teacher', 'Giảng viên hướng dẫn', ''), field('team', 'Nhóm thực hiện', [...store.profiles.values()].map(x => x.display_name || x.email).join(', ')), field('klass', 'Lớp', ''), field('place', 'Nơi viết', 'VD: TP. Hồ Chí Minh')),
    h('div', { class: 'row', style: { gap: '16px', flexWrap: 'wrap', marginTop: '6px' } }, check('tables', 'Kèm các bảng từ Cơ sở dữ liệu'), check('notes', 'Kèm ghi chú của từng mục'), check('skipEmpty', 'Bỏ chương chưa có nội dung')),
    h('p', { class: 'small muted', style: { margin: '8px 0 0' } }, 'Bảng lấy thẳng từ Cơ sở dữ liệu (đã tính công thức), ghi chú lấy từ tab Ghi chú của mỗi mục. Bản Word: Times New Roman 13, khổ A4, lề trái 3 cm – có mục lục và số trang.'));
  el.append(h('div', { class: 'page report-page' }, tools, preview));
  async function refresh() {
    fill(preview, h('p', { class: 'muted' }, '⏳ Đang gom dữ liệu…'));
    try { model = await buildModel(product.id, opt); fill(preview, renderHtml(model)); } catch (e) { toastErr(e); }
  }
  async function downloadWord() {
    try {
      if (!model) await refresh();
      toast('Đang tạo tệp Word…');
      const blob = await buildDocx(model);
      const a = h('a', { href: URL.createObjectURL(blob), download: `Thuyet minh do an - ${product.name}.docx` }); document.body.append(a); a.click(); a.remove();
      downloadNote?.();
    } catch (e) { toastErr(e); }
  }
  function printPdf() { document.body.classList.add('printing-report'); setTimeout(() => { print(); document.body.classList.remove('printing-report'); }, 50); }
  refresh();
  return () => document.body.classList.remove('printing-report');
}
export { buildDocx, buildModel };
