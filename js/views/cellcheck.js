// =====================================================================
// KIỂM TRA SỐ LIỆU: phát hiện ô lỗi / đáng ngờ trong bảng tính
// - Đỏ (lỗi): công thức lỗi (#REF!, #DIV/0!…), cột số nhưng ô chứa chữ
// - Vàng (cảnh báo): số âm ở cột số (đơn giá, số lượng, thời gian thường không âm)
// =====================================================================
import { FErr, isFormula, parseNum } from '../formula.js';

export const ERR_HELP = {
  '#REF!': 'công thức trỏ tới dòng hoặc cột đã bị xoá',
  '#DIV/0!': 'phép chia cho 0 (ô mẫu số đang trống hoặc bằng 0)',
  '#VALUE!': 'phép tính gặp chữ thay vì số',
  '#NAME?': 'tên hàm hoặc tên cột viết sai',
  '#N/A': 'không tìm thấy giá trị cần tra',
  '#NUM!': 'kết quả không hợp lệ (VD căn bậc hai số âm)',
  '#CYCLE!': 'công thức tự tham chiếu vòng tròn',
  '#ERR!': 'công thức viết sai cú pháp',
};

// c = cột, raw = giá trị gõ vào, v = giá trị sau khi tính
export function cellIssue(c, raw, v) {
  if (v instanceof FErr) return { level: 'err', msg: `${v.code}: ${ERR_HELP[v.code] || 'công thức bị lỗi'}` };
  if (c.type === 'number' && !c.formula && typeof raw === 'string' && raw.trim() !== '' && !isFormula(raw) && parseNum(raw) == null)
    return { level: 'err', msg: 'Cột số nhưng ô đang chứa chữ – không dùng được để tính' };
  if (typeof v === 'number' && !Number.isFinite(v)) return { level: 'err', msg: 'Kết quả không phải số hữu hạn' };
  if ((c.type === 'number' || c.formula) && c.fmt !== 'date' && typeof v === 'number' && v < 0)
    return { level: 'warn', msg: 'Số âm – kiểm tra lại (đơn giá, số lượng, thời gian thường không âm)' };
  return null;
}

// Đánh dấu ô trên lưới
export function markIssue(td, issue) {
  td.classList.toggle('v-err', issue?.level === 'err');
  td.classList.toggle('v-warn', issue?.level === 'warn');
  const t = issue ? (issue.level === 'err' ? '⚠ ' : '△ ') + issue.msg : null;
  if (t) { td.setAttribute('data-issue', t); if (!td.classList.contains('busy')) td.title = t; }
  else if (td.hasAttribute('data-issue')) { td.removeAttribute('data-issue'); if (!td.classList.contains('busy')) td.title = ''; }
}
