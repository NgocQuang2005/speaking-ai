/* Tính năng mở rộng: thống kê, biểu đồ tiến bộ, xuất/sao lưu, tin nhắn phụ huynh, ghi nhớ cài đặt.
   File này nạp trước app.js: chỉ khai báo hàm, mọi truy cập `state`/`$` chỉ xảy ra khi hàm được gọi. */
const PREFS_KEY = 'speaking-ai-pro-prefs-v1';
const KEY_STORAGE_KEY = 'speaking-ai-pro-key-v1';
const LEVELS = [[9, 'Xuất sắc', '🌟'], [8, 'Rất tốt', '✨'], [6.5, 'Tốt', '👍'], [5, 'Đạt', '🙂'], [3.5, 'Cần cố gắng', '💪'], [0, 'Cần hỗ trợ thêm', '🤝']];
const levelFor = (average) => LEVELS.find(([min]) => average >= min);
const studentKey = (record) => `${historySearchKey(record.studentName)}|${historySearchKey(record.studentClass)}`;
const formatDay = (iso) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
const formatScore = (value) => Number(value).toFixed(1);
const signed = (value) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(1)}`;

/* ---------- Cài đặt đã nhớ ---------- */
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return {}; }
}
function applyPrefs() {
  const prefs = loadPrefs();
  const setSelect = (id, value) => { const el = $(id); if (value && [...el.options].some(option => option.value === value)) el.value = value; };
  setSelect('teacherSelect', prefs.teacher);
  setSelect('studentLabelSelect', prefs.label);
  const detail = document.querySelector(`input[name="detail"][value="${prefs.detail}"]`);
  if (detail) detail.checked = true;
}
function savePrefs() {
  const prefs = {
    teacher: $('teacherSelect').value, label: $('studentLabelSelect').value,
    detail: document.querySelector('input[name="detail"]:checked')?.value
  };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* bỏ qua nếu trình duyệt chặn lưu trữ */ }
}
function storedKey() {
  try { return localStorage.getItem(KEY_STORAGE_KEY) || ''; } catch { return ''; }
}
function persistKeyChoice() {
  try {
    if ($('rememberKey').checked && state.key) localStorage.setItem(KEY_STORAGE_KEY, state.key);
    else localStorage.removeItem(KEY_STORAGE_KEY);
  } catch { showToast('Trình duyệt không cho ghi nhớ API key.', 'error'); }
}

/* ---------- Thống kê tổng quan ---------- */
function renderStats() {
  const history = state.history;
  const averages = history.map(record => averageScore(record.analysis));
  $('statCount').textContent = history.length;
  $('statStudents').textContent = new Set(history.map(studentKey)).size;
  $('statAverage').textContent = history.length ? formatScore(averages.reduce((a, b) => a + b, 0) / history.length) : '—';
  $('statBest').textContent = history.length ? formatScore(Math.max(...averages)) : '—';
  const insight = $('statInsight');
  if (history.length < 2) {
    insight.textContent = history.length ? 'Chấm thêm vài bài để xem tiêu chí nào cần luyện nhiều nhất.' : 'Chưa có dữ liệu. Chấm bài đầu tiên để bắt đầu theo dõi tiến bộ.';
    return;
  }
  const means = criteria.map(([key, label]) => [label, history.reduce((sum, record) => sum + record.analysis.scores[key], 0) / history.length]);
  const weakest = means.reduce((a, b) => (b[1] < a[1] ? b : a));
  const strongest = means.reduce((a, b) => (b[1] > a[1] ? b : a));
  insight.textContent = weakest[0] === strongest[0]
    ? `Các tiêu chí đang khá đều nhau, trung bình ${formatScore(weakest[1])}/10.`
    : `Mạnh nhất: ${strongest[0]} (${formatScore(strongest[1])}) · Cần luyện nhiều nhất: ${weakest[0]} (${formatScore(weakest[1])}).`;
}

/* ---------- So sánh với lần chấm trước ---------- */
function previousRecord(probe) {
  const key = studentKey(probe);
  const time = new Date(probe.savedAt).getTime();
  return state.history
    .filter(record => record.id !== probe.id && studentKey(record) === key && new Date(record.savedAt).getTime() < time)
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))[0] || null;
}
function deltaBadge(delta) {
  const badge = document.createElement('span');
  const direction = Math.abs(delta) < 0.05 ? 'same' : delta > 0 ? 'up' : 'down';
  badge.className = `delta ${direction}`;
  badge.textContent = `${direction === 'up' ? '▲' : direction === 'down' ? '▼' : '='} ${signed(delta)}`;
  badge.title = 'So với lần chấm trước của học sinh này';
  return badge;
}
function renderCompare() {
  const note = $('compareNote');
  const analysis = state.analysis;
  const name = $('studentName').value.trim(), className = $('studentClass').value.trim();
  note.replaceChildren();
  if (!analysis || !state.historyId || !name || !className) { note.classList.add('hidden'); return; }
  const previous = previousRecord({ id: state.historyId, studentName: name, studentClass: className, savedAt: state.gradedAt || new Date().toISOString() });
  note.classList.remove('hidden');
  if (!previous) { note.textContent = 'Đây là bài đầu tiên của học sinh này trong lịch sử.'; return; }
  const delta = averageScore(analysis) - averageScore(previous.analysis);
  const title = document.createElement('strong');
  title.textContent = `So với lần trước (${formatDay(previous.savedAt)}): `;
  const detail = document.createElement('span');
  detail.textContent = ` ${criteria.map(([key, label]) => `${label} ${signed(analysis.scores[key] - previous.analysis.scores[key])}`).join(' · ')}`;
  note.append(title, deltaBadge(delta), detail);
}

/* ---------- Điểm trực quan trong báo cáo ---------- */
function renderScoreVisuals(analysis) {
  const average = averageScore(analysis);
  const [, label, emoji] = levelFor(average);
  $('levelBadge').textContent = `${emoji} ${label}`;
  $('starFill').style.width = `${Math.round(average * 10)}%`;
  $('starRating').setAttribute('aria-label', `${(average / 2).toFixed(1)} trên 5 sao`);
  $('radarWrap').replaceChildren(radarChart(criteria.map(([key, name]) => ({ label: name, value: analysis.scores[key] }))));
  const bars = $('scoreBars');
  bars.replaceChildren();
  criteria.forEach(([key, name]) => {
    const row = document.createElement('div');
    row.className = 'score-bar';
    const head = document.createElement('div');
    const title = document.createElement('span'); title.textContent = name;
    const value = document.createElement('strong'); value.textContent = `${formatScore(analysis.scores[key])}`;
    head.append(title, value);
    const track = document.createElement('div'); track.className = 'bar-track';
    const fill = document.createElement('i'); fill.style.width = `${analysis.scores[key] * 10}%`; fill.style.background = CRITERIA_COLORS[key];
    track.append(fill);
    row.append(head, track);
    bars.append(row);
  });
  renderCompare();
}

/* Làm nổi bật các cụm lỗi (evidence) có xuất hiện trong bản chép lời. */
function renderTranscript(analysis) {
  const element = $('transcription');
  const text = analysis.transcription || '';
  if (state.editing) {
    appendEditable(element, text, value => analysis.transcription = value);
    $('transcriptLegend').classList.add('hidden');
    return;
  }
  element.contentEditable = 'false';
  element.classList.remove('editable');
  element.oninput = null;
  const phrases = new Set();
  criteria.forEach(([key]) => analysis[`${key}_details`].errors.forEach(error => {
    const phrase = (error.evidence || '').replace(/^["'“‘]+|["'”’.,!?]+$/g, '').trim();
    if (phrase.length >= 2 && phrase.length <= 60 && !phrase.includes('[')) phrases.add(phrase);
  }));
  const lower = text.toLowerCase();
  const ranges = [];
  phrases.forEach(phrase => {
    let from = 0, at;
    while ((at = lower.indexOf(phrase.toLowerCase(), from)) !== -1) { ranges.push([at, at + phrase.length]); from = at + phrase.length; }
  });
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach(range => {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push([...range]);
  });
  const nodes = [];
  let cursor = 0;
  merged.forEach(([start, end]) => {
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(start, end);
    nodes.push(mark);
    cursor = end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  element.replaceChildren(...nodes);
  $('transcriptLegend').classList.toggle('hidden', merged.length === 0);
}

/* ---------- Mở rộng bảng lịch sử ---------- */
function sortHistory(list) {
  const sort = $('historySort').value;
  const byDate = (a, b) => new Date(b.savedAt) - new Date(a.savedAt);
  const scoreOf = record => averageScore(record.analysis);
  const sorters = {
    newest: byDate, oldest: (a, b) => -byDate(a, b),
    high: (a, b) => scoreOf(b) - scoreOf(a) || byDate(a, b), low: (a, b) => scoreOf(a) - scoreOf(b) || byDate(a, b),
    name: (a, b) => a.studentName.localeCompare(b.studentName, 'vi') || byDate(a, b)
  };
  return [...list].sort(sorters[sort] || byDate);
}
function scoreCell(record) {
  const wrap = document.createDocumentFragment();
  const average = averageScore(record.analysis);
  const chip = document.createElement('span');
  chip.className = `score-chip tone-${average >= 8 ? 'high' : average >= 6 ? 'mid' : 'low'}`;
  chip.textContent = `${formatScore(average)}/10`;
  wrap.append(chip);
  const previous = previousRecord(record);
  if (previous) wrap.append(deltaBadge(average - averageScore(previous.analysis)));
  return wrap;
}
function renderHistoryExtras(filtered) {
  renderStats();
  const wrap = $('trendWrap');
  const students = new Set(filtered.map(studentKey));
  if (students.size !== 1 || filtered.length < 2) { wrap.classList.add('hidden'); return; }
  const ordered = [...filtered].sort((a, b) => new Date(a.savedAt) - new Date(b.savedAt));
  const series = [
    { key: 'average', label: 'Điểm trung bình', color: CRITERIA_COLORS.average, width: 3.4, values: ordered.map(record => averageScore(record.analysis)) },
    ...criteria.map(([key, label]) => ({ key, label, color: CRITERIA_COLORS[key], width: 1.8, values: ordered.map(record => record.analysis.scores[key]) }))
  ];
  $('trendTitle').textContent = `Tiến bộ của ${ordered[ordered.length - 1].studentName} (${ordered[ordered.length - 1].studentClass})`;
  $('trendChart').replaceChildren(lineChart(ordered.map(record => formatDay(record.savedAt)), series));
  $('trendLegend').replaceChildren(...series.map(item => {
    const entry = document.createElement('span');
    const swatch = document.createElement('i'); swatch.style.background = item.color;
    entry.append(swatch, item.label);
    return entry;
  }));
  const first = series[0].values[0], last = series[0].values[series[0].values.length - 1];
  $('trendSummary').textContent = `${ordered.length} lần chấm · ${formatScore(first)} → ${formatScore(last)} (${signed(last - first)})`;
  wrap.classList.remove('hidden');
}

/* ---------- Xuất / sao lưu / khôi phục ---------- */
function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const fileStamp = () => new Date().toISOString().slice(0, 10);
function csvCell(value) {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (/^[=+\-@]/.test(text)) text = `'${text}`; // tránh công thức Excel từ dữ liệu nhập tay
  return `"${text.replace(/"/g, '""')}"`;
}
function exportCsv() {
  if (!state.history.length) return showToast('Chưa có bài chấm nào để xuất.', 'error');
  const header = ['Thời gian chấm', 'Học sinh', 'Lớp', 'Tệp', 'Ngày báo cáo', 'Điểm TB', ...criteria.map(([, label]) => label), 'Điểm mạnh', 'Cần cải thiện', 'Model'];
  const rows = sortHistory(state.history).map(record => [
    new Date(record.savedAt).toLocaleString('vi-VN'), record.studentName, record.studentClass, record.fileName || '', record.reportDate || '',
    formatScore(averageScore(record.analysis)), ...criteria.map(([key]) => formatScore(record.analysis.scores[key])),
    record.analysis.overall_feedback.strengths, record.analysis.overall_feedback.weaknesses, record.model || ''
  ]);
  downloadFile(`speaking-ai-pro-${fileStamp()}.csv`, `﻿${[header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
  showToast(`Đã xuất ${rows.length} bài chấm ra CSV (mở được bằng Excel).`);
}
function backupHistory() {
  if (!state.history.length) return showToast('Chưa có bài chấm nào để sao lưu.', 'error');
  downloadFile(`speaking-ai-pro-backup-${fileStamp()}.json`, JSON.stringify({ app: 'speaking-ai-pro', version: 1, exportedAt: new Date().toISOString(), history: state.history }, null, 2), 'application/json');
  showToast('Đã tải bản sao lưu lịch sử. Hãy cất file ở nơi an toàn.');
}
function cleanRecord(item) {
  if (!item || typeof item !== 'object') return null;
  const text = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const id = text(item.id, 80), name = text(item.studentName, 120), className = text(item.studentClass, 60);
  const savedAt = new Date(item.savedAt);
  if (!id || !name || !className || Number.isNaN(savedAt.getTime())) return null;
  let analysis;
  try { analysis = normalized(item.analysis); } catch { return null; }
  return {
    id, savedAt: savedAt.toISOString(), fileName: text(item.fileName), studentName: name, studentClass: className,
    studentLabel: text(item.studentLabel, 20) || 'con', teacher: text(item.teacher, 20) || 'thầy',
    reportDate: /^\d{4}-\d{2}-\d{2}$/.test(item.reportDate || '') ? item.reportDate : '', model: text(item.model, 80), analysis
  };
}
async function restoreHistory(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return showToast('File sao lưu quá lớn.', 'error');
  try {
    const data = JSON.parse(await file.text());
    const source = Array.isArray(data) ? data : data?.history;
    if (!Array.isArray(source)) throw new Error('format');
    const known = new Set(state.history.map(record => record.id));
    const added = [];
    let skipped = 0;
    source.forEach(item => {
      const record = cleanRecord(item);
      if (record && !known.has(record.id)) { known.add(record.id); added.push(record); } else skipped++;
    });
    if (!added.length) return showToast(`Không có bài mới để khôi phục (bỏ qua ${skipped}).`, 'error');
    const next = [...state.history, ...added].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { return showToast('Không đủ dung lượng trình duyệt để khôi phục.', 'error'); }
    state.history = next;
    renderHistory();
    showToast(`Đã khôi phục ${added.length} bài chấm${skipped ? ` (bỏ qua ${skipped} bài trùng hoặc không hợp lệ)` : ''}.`);
  } catch {
    showToast('File không đúng định dạng sao lưu của Speaking AI Pro.', 'error');
  } finally {
    $('restoreInput').value = '';
  }
}

/* ---------- Tin nhắn gửi phụ huynh ---------- */
function buildParentMessage() {
  const a = state.analysis;
  const name = $('studentName').value.trim() || 'bé';
  const className = $('studentClass').value.trim();
  const average = averageScore(a);
  const [, level] = levelFor(average);
  const lines = [
    `Chào anh/chị, ${state.reportTeacher} gửi kết quả bài nói tiếng Anh của ${name}${className ? ` (lớp ${className})` : ''}${$('reportDate').value ? ` ngày ${new Date($('reportDate').value).toLocaleDateString('vi-VN')}` : ''}:`,
    '',
    `⭐ Điểm trung bình: ${formatScore(average)}/10 – ${level}`,
    ...criteria.map(([key, label]) => `• ${label}: ${formatScore(a.scores[key])}/10`)
  ];
  if (a.overall_feedback.strengths) lines.push('', `💪 Điểm mạnh: ${a.overall_feedback.strengths}`);
  if (a.overall_feedback.weaknesses) lines.push('', `🎯 Cần cải thiện: ${a.overall_feedback.weaknesses}`);
  if (a.action_plan.length) lines.push('', '📝 Bài luyện ở nhà:', ...a.action_plan.map((step, index) => `${index + 1}. ${step}`));
  lines.push('', `Cảm ơn anh/chị đã đồng hành cùng ${name}! 🌸`);
  return lines.join('\n');
}
function copyWithFeedback(text, button, doneLabel) {
  const original = button.textContent;
  navigator.clipboard.writeText(text).then(() => {
    button.textContent = doneLabel;
    setTimeout(() => button.textContent = original, 1800);
  }).catch(() => showAlert('Trình duyệt không cho sao chép tự động. Hãy mở trang bằng http://localhost.', 'error'));
}

/* ---------- Hiệu ứng chúc mừng ---------- */
function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = $('confetti');
  const icons = ['💖', '⭐', '🎀', '✨', '🌸'];
  layer.replaceChildren(...Array.from({ length: 22 }, (_, index) => {
    const piece = document.createElement('span');
    piece.textContent = icons[index % icons.length];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 0.9}s`;
    piece.style.fontSize = `${18 + Math.random() * 18}px`;
    return piece;
  }));
  setTimeout(() => layer.replaceChildren(), 4200);
}

/* ---------- Gắn sự kiện (gọi từ cuối app.js) ---------- */
function initFeatures() {
  applyPrefs();
  const saved = storedKey();
  if (saved) state.key = saved;
  ['teacherSelect', 'studentLabelSelect'].forEach(id => $(id).addEventListener('change', savePrefs));
  document.querySelectorAll('input[name="detail"]').forEach(input => input.addEventListener('change', savePrefs));
  ['studentName', 'studentClass'].forEach(id => $(id).addEventListener('input', renderCompare));
  $('historySort').addEventListener('change', renderHistory);
  $('exportCsvBtn').addEventListener('click', exportCsv);
  $('backupBtn').addEventListener('click', backupHistory);
  $('restoreBtn').addEventListener('click', () => $('restoreInput').click());
  $('restoreInput').addEventListener('change', event => restoreHistory(event.target.files[0]));
  $('parentMsgBtn').addEventListener('click', () => state.analysis && copyWithFeedback(buildParentMessage(), $('parentMsgBtn'), 'Đã sao chép'));
  $('rubricBtn').addEventListener('click', () => $('rubricDialog').showModal());
  $('statsHistoryBtn').addEventListener('click', () => $('historyBtn').click());
}
