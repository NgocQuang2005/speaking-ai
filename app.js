/* API key đọc từ config.local.js (không đưa lên GitHub). Hoặc nhập trong Cài đặt trên web. */
const API_KEY = window.LOCAL_API_KEY || '';
const DEFAULT_MODEL = 'gemini-3.6-flash';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const HISTORY_KEY = 'speaking-ai-pro-history-v1';

const $ = (id) => document.getElementById(id);
const criteria = [
  ['pronunciation', 'Phát âm'],
  ['fluency', 'Trôi chảy'],
  ['grammar', 'Ngữ pháp'],
  ['vocabulary', 'Từ vựng']
];
const state = { file: null, url: null, analysis: null, key: '', model: DEFAULT_MODEL, editing: false, busy: false, historyId: null, gradedAt: null, reportStudentLabel: 'con', reportTeacher: 'thầy', history: [] };
let toastTimer;

function showToast(message, kind = 'success') {
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 4500);
}
function setProgress(step, message) {
  $('gradingProgress').classList.remove('hidden');
  $('gradingProgress').dataset.step = String(step);
  $('progressStep').textContent = `Bước ${step}/3`;
  $('progressText').textContent = message;
}
function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function readableText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(readableText).filter(Boolean).join('; ');
  if (typeof value !== 'object') return String(value);
  const labels = { original: 'Gốc', incorrect: 'Sai', corrected: 'Sửa thành', correction: 'Sửa thành', suggestion: 'Gợi ý', explanation: 'Giải thích', reason: 'Lý do', type: 'Loại lỗi', word: 'Từ', example: 'Ví dụ', error: 'Lỗi' };
  return Object.entries(value).filter(([, item]) => item != null && item !== '').map(([key, item]) => `${labels[key] || key}: ${readableText(item)}`).join(' · ');
}
function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(item => {
      try { normalized(item.analysis); return item.id && item.savedAt && item.studentName?.trim() && item.studentClass?.trim(); } catch { return false; }
    }) : [];
  } catch { return []; }
}
function persistHistory(record) {
  const next = [record, ...state.history.filter(item => item.id !== record.id)];
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    state.history = next;
    renderHistory();
    return true;
  } catch {
    showToast('Không lưu được lịch sử. Hãy kiểm tra dung lượng lưu trữ của trình duyệt.', 'error');
    return false;
  }
}
function deleteHistoryReport(id) {
  const record = state.history.find(item => item.id === id);
  if (!record) return;
  if (!window.confirm(`Xóa toàn bộ bài chấm của ${record.studentName} (${record.studentClass}) khỏi lịch sử? Thao tác này không thể hoàn tác.`)) return;
  const next = state.history.filter(item => item.id !== id);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    showToast('Không xóa được bài chấm. Hãy kiểm tra bộ nhớ của trình duyệt.', 'error');
    return;
  }
  state.history = next;
  if (state.historyId === id) {
    state.analysis = null;
    state.historyId = null;
    state.gradedAt = null;
    state.editing = false;
    $('reportSection').classList.add('hidden');
  }
  renderHistory();
  showToast('Đã xóa bài chấm khỏi lịch sử.');
}
function saveCurrentReport() {
  if (!state.analysis || !state.historyId) return false;
  const studentName = $('studentName').value.trim();
  const studentClass = $('studentClass').value.trim();
  if (!studentName || !studentClass) {
    showToast('Hãy nhập đầy đủ tên học sinh và lớp trước khi lưu.', 'error');
    $(studentName ? 'studentClass' : 'studentName').focus();
    return false;
  }
  const previous = state.history.find(item => item.id === state.historyId);
  const saved = persistHistory({
    id: state.historyId,
    savedAt: previous?.savedAt || state.gradedAt || new Date().toISOString(),
    fileName: previous?.fileName || state.file?.name || '',
    studentName,
    studentClass,
    studentLabel: state.reportStudentLabel,
    teacher: state.reportTeacher,
    reportDate: $('reportDate').value,
    model: state.model,
    analysis: state.analysis
  });
  if (saved) { $('saveHistoryBtn').textContent = 'Cập nhật lịch sử'; renderCompare(); }
  return saved;
}
function averageScore(analysis) {
  return criteria.reduce((sum, [key]) => sum + analysis.scores[key], 0) / criteria.length;
}
function historySearchKey(value) {
  return String(value ?? '').trim().toLowerCase();
}
function renderHistory() {
  const classFilter = $('historyClassFilter');
  const selectedClass = classFilter.value;
  const classes = new Map();
  state.history.forEach(record => {
    const key = historySearchKey(record.studentClass);
    if (key && !classes.has(key)) classes.set(key, record.studentClass.trim());
  });
  classFilter.replaceChildren(new Option('Tất cả lớp', ''));
  [...classes].sort((a, b) => a[1].localeCompare(b[1], 'vi')).forEach(([key, label]) => classFilter.add(new Option(label, key)));
  classFilter.value = classes.has(selectedClass) ? selectedClass : '';
  const searchName = historySearchKey($('historyNameSearch').value);
  const filtered = state.history.filter(record =>
    (!classFilter.value || historySearchKey(record.studentClass) === classFilter.value) &&
    historySearchKey(record.studentName).includes(searchName)
  );
  const sorted = sortHistory(filtered);
  const rows = $('historyRows');
  rows.replaceChildren();
  $('historyEmpty').textContent = state.history.length ? 'Không tìm thấy học sinh phù hợp.' : 'Chưa có bài nào được chấm.';
  $('historyEmpty').classList.toggle('hidden', filtered.length > 0);
  $('historyTableWrap').classList.toggle('hidden', filtered.length === 0);
  sorted.forEach(record => {
    const row = document.createElement('tr');
    const date = document.createElement('td');
    date.textContent = new Date(record.savedAt).toLocaleString('vi-VN');
    const person = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = record.studentName || record.fileName || 'Bài nói';
    const subtitle = document.createElement('small');
    subtitle.textContent = [record.studentClass, record.studentName ? record.fileName : ''].filter(Boolean).join(' · ');
    person.append(name, subtitle);
    const score = document.createElement('td');
    score.append(scoreCell(record));
    const result = document.createElement('td');
    result.className = 'history-comment';
    result.textContent = [record.analysis.overall_feedback?.strengths, record.analysis.overall_feedback?.weaknesses].filter(Boolean).join(' · ') || 'Chưa có nhận xét';
    const action = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-button';
    button.textContent = 'Xem báo cáo';
    button.addEventListener('click', () => openHistoryReport(record.id));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'text-button delete-history-button';
    deleteButton.textContent = 'Xóa bài chấm';
    deleteButton.setAttribute('aria-label', `Xóa bài chấm của ${record.studentName}, lớp ${record.studentClass}`);
    deleteButton.addEventListener('click', () => deleteHistoryReport(record.id));
    action.append(button, deleteButton);
    row.append(date, person, score, result, action);
    rows.append(row);
  });
  renderHistoryExtras(filtered);
}
function openHistoryReport(id) {
  const record = state.history.find(item => item.id === id);
  if (!record) return;
  state.historyId = id;
  state.gradedAt = record.savedAt;
  state.analysis = normalized(record.analysis);
  state.reportStudentLabel = record.studentLabel || 'con';
  state.reportTeacher = record.teacher || 'thầy';
  state.model = record.model || DEFAULT_MODEL;
  state.editing = false;
  $('studentName').value = record.studentName || '';
  $('studentClass').value = record.studentClass || '';
  $('reportDate').value = record.reportDate || '';
  $('reportModel').textContent = `Model: ${state.model}`;
  $('saveHistoryBtn').textContent = 'Cập nhật lịch sử';
  renderReport();
  $('historySection').classList.add('hidden');
  $('reportSection').classList.remove('hidden');
  $('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showAlert(message, kind = 'warning', actions = []) {
  $('alertText').textContent = message;
  $('alert').classList.toggle('error', kind === 'error');
  $('alert').classList.remove('hidden');
  const wrap = $('alertActions');
  wrap.replaceChildren();
  actions.forEach(({ label, onClick }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    wrap.append(button);
  });
}
function hideAlert() { $('alert').classList.add('hidden'); }
function bytesLabel(size) { return `${(size / 1024 / 1024).toFixed(2)} MB`; }

function setFile(file) {
  if (!file) return;
  const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac)$/i.test(file.name);
  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mpeg)$/i.test(file.name);
  if (!isAudio && !isVideo) return showAlert('Vui lòng chọn tệp audio hoặc video.', 'error');
  if (file.size > MAX_FILE_BYTES) return showAlert('Tệp quá lớn. Hãy chọn tệp tối đa 40 MB để gửi trực tiếp tới Gemini.', 'error');
  if (file.size === 0) return showAlert('Tệp này trống. Hãy chọn tệp khác.', 'error');
  if (state.url) URL.revokeObjectURL(state.url);
  state.file = file;
  state.url = URL.createObjectURL(file);
  $('fileName').textContent = file.name;
  $('fileSize').textContent = bytesLabel(file.size);
  $('fileIcon').textContent = isVideo ? '▶' : '♪';
  const media = document.createElement(isVideo ? 'video' : 'audio');
  media.controls = true;
  media.preload = 'metadata';
  media.src = state.url;
  media.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(media.duration) || media.duration <= 0) return;
    const total = Math.round(media.duration);
    $('fileSize').textContent = `${bytesLabel(file.size)} · ${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }, { once: true });
  $('mediaWrap').replaceChildren(media);
  $('mediaWrap').classList.remove('hidden');
  $('sourcePicker').classList.add('hidden');
  $('fileCard').classList.remove('hidden');
  $('analyzeBtn').disabled = false;
  hideAlert();
}
function removeFile() {
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = null;
  state.file = null;
  $('fileInput').value = '';
  $('mediaWrap').replaceChildren();
  $('mediaWrap').classList.add('hidden');
  $('fileCard').classList.add('hidden');
  $('sourcePicker').classList.remove('hidden');
  $('analyzeBtn').disabled = true;
  hideAlert();
}

function promptFor(detail, teacher, student) {
  const length = {
    short: 'Mỗi nhận xét 1 câu; chọn tối đa 1–2 lỗi quan trọng mỗi tiêu chí nếu có bằng chứng.',
    medium: 'Mỗi nhận xét 1–2 câu; chọn tối đa 2–3 lỗi quan trọng mỗi tiêu chí nếu có bằng chứng.',
    detailed: 'Mỗi nhận xét 2–3 câu; chọn tối đa 3–4 lỗi quan trọng mỗi tiêu chí nếu có bằng chứng. Giải thích và bài luyện phải cụ thể.'
  }[detail] || 'Mỗi nhận xét 1–2 câu; chọn tối đa 2–3 lỗi quan trọng mỗi tiêu chí nếu có bằng chứng.';
  return `Bạn là giáo viên đánh giá bài NÓI tiếng Anh của trẻ, dựa trên âm thanh trong tệp. Xưng là "${teacher}", gọi học sinh là "${student}". Trả lời bằng tiếng Việt; giữ nguyên từ/câu tiếng Anh được trích. Hình ảnh chỉ giúp hiểu ngữ cảnh, không phải bằng chứng về năng lực nói.

QUY TRÌNH BẮT BUỘC (tự thực hiện trước khi trả lời):
1. Nghe toàn bộ bài, chép đúng lời bé thực sự nói. Giữ cả lỗi ngữ pháp và từ dùng sai; không tự sửa trong transcription. Ghi [không rõ] ở chỗ không nghe chắc. Phân biệt lời học sinh với lời người khác, nhạc và tiếng nền. Nếu không có đủ lời nói tiếng Anh của học sinh để đánh giá, trả evaluation_status="insufficient_audio", status_reason giải thích ngắn, không tự tạo điểm hoặc lời chép.
2. Với từng tiêu chí, xác định điểm mạnh, các lỗi nghe/đọc được, mức ảnh hưởng tới người nghe và tần suất so với số cơ hội trong bài. Một lỗi lặp lại nhiều lần là một dạng lỗi có tần suất cao; đừng liệt kê thành nhiều lỗi khác nhau. Không suy diễn lỗi từ câu [không rõ]. Không lấy độ dài bài làm lỗi tự động; bài ngắn chỉ làm giới hạn độ chắc chắn của nhận định.
3. Chấm ĐỘC LẬP từng tiêu chí theo thang dưới đây rồi đối chiếu lại điểm với score_reason. Hai điểm bằng nhau vẫn hợp lệ nếu bằng chứng thực sự tương đương; tuyệt đối không ép điểm khác nhau cho đẹp báo cáo. Không mặc định 9/10, không thưởng điểm chỉ vì ít lỗi trong một bài quá ngắn.

THANG ĐIỂM CHUNG (chỉ dùng số nguyên hoặc .5):
9–10: Rất tốt xuyên suốt; 9 chỉ có sai sót nhỏ, hiếm và ít ảnh hưởng; 10 cần bằng chứng đủ rộng và gần như không có lỗi đáng kể.
7–8.5: Người nghe hiểu dễ; có vài lỗi hoặc hạn chế rõ nhưng nhìn chung kiểm soát tốt. 8.5 gần mức rất tốt; 7 có ảnh hưởng đáng nhận thấy.
5–6.5: Truyền đạt được ý chính nhưng lỗi/lần ngập ngừng xuất hiện thường xuyên hoặc buộc người nghe phải đoán đôi chỗ.
3–4.5: Khó theo dõi nhiều đoạn; lỗi lặp lại cản trở truyền đạt đáng kể.
0–2.5: Hầu như không truyền đạt được bằng tiếng Anh dù có đủ tiếng nói để đánh giá.
Chọn mức bằng mức ảnh hưởng thực tế, rồi chọn .0 hoặc .5 theo tần suất và độ nhất quán. Không dùng một mốc điểm cố định cho mọi tiêu chí.

RANH GIỚI CÁC TIÊU CHÍ:
- pronunciation: âm, âm cuối, trọng âm từ/câu, ngữ điệu và mức dễ hiểu do cách phát âm. Không phạt giọng vùng miền nếu vẫn dễ hiểu; không chấm ngữ pháp ở đây. Chỉ nêu âm/từ phát âm sai khi thực sự nghe phân biệt được.
- fluency: nhịp nói, quãng dừng, tự sửa/lặp và khả năng nối ý khi nói. Dựa vào âm thanh, không suy từ văn bản chép lời; nghỉ để lấy hơi hoặc ngắt câu tự nhiên không phải lỗi. Không trừ điểm hai lần vì một chỗ ngập ngừng.
- grammar: cấu trúc câu, thì, hòa hợp chủ vị, giới từ/mạo từ nếu có cơ hội dùng. Dựa vào câu thực sự nói; chấp nhận cách nói khác vẫn đúng. Nếu không nghe rõ từ quyết định cấu trúc, không kết luận lỗi.
- vocabulary: chọn từ đúng nghĩa/ngữ cảnh, kết hợp từ và độ linh hoạt phù hợp chủ đề, lứa tuổi và nội dung bé định nói. Không trừ điểm chỉ vì bé dùng từ đơn giản hoặc không dùng từ nâng cao. Không gán một lỗi ngữ pháp thành lỗi từ vựng.

YÊU CẦU BẰNG CHỨNG VÀ NHẬN XÉT:
- Mỗi score_reason phải nói rõ vì sao con đạt đúng mức điểm đó, gồm ít nhất một dẫn chứng cụ thể từ bài (từ/cụm bé nói hoặc sự kiện nghe được như khoảng dừng/lặp từ) và mức ảnh hưởng/tần suất. Không dùng nhận xét chung kiểu "rất tốt, chính xác" cho cả bốn tiêu chí. Nếu tiêu chí không có lỗi chắc chắn, nêu dấu hiệu tích cực cụ thể và giới hạn do bài ngắn nếu có.
- feedback khác score_reason: một lời khuyên ngắn, dễ hiểu và gắn với tiêu chí. Không khẳng định "chuẩn xác" hoặc "đa dạng" khi chưa đủ bằng chứng. ${length}
- Chỉ đưa lỗi có căn cứ vào errors. Mỗi lỗi có summary, evidence (trích đúng lời hoặc mô tả vị trí nghe được; mốc thời gian chỉ khi chắc), correction, explanation và practice. Không bịa lời, âm IPA, thời điểm hoặc lỗi để đủ số lượng. Nếu không có lỗi chắc chắn, errors=[]; không tạo lỗi giả.
- Không lặp cùng một lỗi ở nhiều tiêu chí. overall_feedback tóm tắt thế mạnh và một ưu tiên cải thiện thật sự. action_plan gồm 2–3 bài luyện nhỏ, có từ/câu trong bài hoặc thao tác luyện cụ thể cùng số lần/thời lượng; không tạo bài luyện cho lỗi chưa xác nhận.
- Trước khi xuất JSON, tự kiểm tra: mọi ví dụ từ vựng/ngữ pháp đều có trong transcription; dẫn chứng phát âm/trôi chảy nghe được từ audio; lý do điểm riêng cho từng tiêu chí; mức điểm khớp với mô tả lỗi; không suy đoán từ phần [không rõ].

Chỉ trả JSON hợp lệ, không Markdown. Cấu trúc: {"evaluation_status":"ok","status_reason":"","transcription":"...","scores":{"pronunciation":0,"fluency":0,"grammar":0,"vocabulary":0},"pronunciation_details":{"score_reason":"...","feedback":"...","errors":[{"summary":"...","evidence":"...","correction":"...","explanation":"...","practice":"..."}]},"fluency_details":{"score_reason":"...","feedback":"...","errors":[]},"grammar_details":{"score_reason":"...","feedback":"...","errors":[]},"vocabulary_details":{"score_reason":"...","feedback":"...","errors":[]},"overall_feedback":{"strengths":"...","weaknesses":"..."},"action_plan":["...","..."]}. Khi evaluation_status="insufficient_audio", trả status_reason và transcription nếu nghe được, các trường còn lại có thể bỏ qua.`;
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Không đọc được tệp.'));
    reader.readAsDataURL(file);
  });
}
function normalized(data, strict = false) {
  if (data?.evaluation_status === 'insufficient_audio') throw new Error(readableText(data.status_reason) || 'Không đủ lời nói tiếng Anh rõ để chấm điểm. Hãy chọn tệp khác.');
  if (!data || typeof data !== 'object' || !data.scores) throw new Error('AI trả về dữ liệu không đúng định dạng. Hãy thử chấm lại.');
  const output = {
    transcription: readableText(data.transcription), scores: {}, overall_feedback: {
      strengths: readableText(data.overall_feedback?.strengths),
      weaknesses: readableText(data.overall_feedback?.weaknesses)
    }, action_plan: Array.isArray(data.action_plan) ? data.action_plan.map(readableText) : []
  };
  for (const [key] of criteria) {
    const score = Number(data.scores[key]);
    if (!Number.isFinite(score) || (strict && (score < 0 || score > 10 || !Number.isInteger(score * 2)))) throw new Error('AI trả về điểm số không hợp lệ. Hãy thử chấm lại.');
    output.scores[key] = strict ? score : Math.min(10, Math.max(0, score));
    const details = data[`${key}_details`] ?? {};
    if (strict && !readableText(details.score_reason).trim()) throw new Error('AI chưa giải thích đủ điểm số của từng tiêu chí. Hãy thử chấm lại.');
    output[`${key}_details`] = {
      score_reason: readableText(details.score_reason),
      feedback: readableText(details.feedback),
      errors: Array.isArray(details.errors) ? details.errors.map(item => {
        if (typeof item !== 'object' || item === null) return { summary: readableText(item), evidence: '', correction: '', explanation: '', practice: '' };
        return {
          summary: readableText(item.summary),
          evidence: readableText(item.evidence ?? item.original ?? item.incorrect ?? item.word),
          correction: readableText(item.correction ?? item.corrected ?? item.suggestion),
          explanation: readableText(item.explanation ?? item.reason),
          practice: readableText(item.practice ?? item.exercise)
        };
      }).filter(item => Object.values(item).some(Boolean)) : []
    };
  }
  return output;
}
function friendlyApiError(status, error = {}) {
  const detail = String(error.message || '').replace(/\s+/g, ' ').slice(0, 220);
  const suffix = detail ? ` Chi tiết: ${detail}` : '';
  if (status === 401) return `HTTP 401: API key thiếu, sai hoặc đã hết hiệu lực.${suffix}`;
  if (status === 403) return `HTTP 403: API key hoặc dự án không có quyền truy cập.${suffix}`;
  if (status === 404) return `HTTP 404: Không tìm thấy model này. Hãy kiểm tra tên model trong Cài đặt AI.${suffix}`;
  if (status === 429) return `HTTP 429: Đã chạm giới hạn lượt gọi hoặc hạn mức của dự án. Kiểm tra quota trong AI Studio rồi thử lại khi hạn mức cho phép.${suffix}`;
  if (status === 503) return `HTTP 503: Máy chủ Gemini đang quá tải. Tệp vẫn còn ở đây; hãy thử lại sau.${suffix}`;
  if (status === 500 || status === 408) return `HTTP ${status}: Gemini tạm thời không xử lý được yêu cầu. Hãy thử lại sau.${suffix}`;
  if (status === 400) return `HTTP 400: Yêu cầu chưa hợp lệ; kiểm tra model và định dạng tệp.${suffix}`;
  return `HTTP ${status}: Gemini không xử lý được yêu cầu.${suffix}`;
}
function setKeyTestStatus(message, kind) {
  const status = $('keyTestStatus');
  status.textContent = message;
  status.className = `key-test-status ${kind}`;
}
async function testApiKey() {
  const key = $('apiKeyInput').value.trim() || API_KEY.trim();
  const model = $('modelInput').value.trim();
  if (!key) return setKeyTestStatus('Hãy dán API key trước khi kiểm tra.', 'error');
  if (!model) return setKeyTestStatus('Hãy nhập tên model trước khi kiểm tra.', 'error');
  const button = $('testKeyBtn');
  button.disabled = true;
  button.textContent = 'Đang kiểm tra…';
  setKeyTestStatus('Đang gửi yêu cầu thử tới Gemini…', 'pending');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Trả lời đúng một từ: OK' }] }] }),
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(friendlyApiError(response.status, payload.error));
    if (!payload.candidates?.[0]?.content?.parts?.some(part => part.text)) throw new Error('Gemini đã nhận yêu cầu nhưng không trả lời. Hãy thử lại hoặc đổi model.');
    state.key = $('apiKeyInput').value.trim();
    state.model = model;
    setKeyTestStatus(`Kết nối thành công. API key dùng được với model ${model}. Bạn có thể chấm bài.`, 'success');
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Hết thời gian chờ 30 giây. Kiểm tra Internet hoặc thử lại.' : error instanceof TypeError ? 'Không kết nối được tới Gemini. Kiểm tra Internet và mở web qua http://127.0.0.1:4173.' : error.message;
    setKeyTestStatus(message, 'error');
  } finally {
    clearTimeout(timer);
    button.disabled = false;
    button.textContent = 'Kiểm tra API key';
  }
}
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function generateAnalysis(body, key) {
  const alternative = state.model === FALLBACK_MODEL ? DEFAULT_MODEL : FALLBACK_MODEL;
  const models = [state.model, alternative];
  let lastError;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      $('analyzeLabel').textContent = attempt ? `Đang thử lại ${model}…` : `Đang chấm bằng ${model}…`;
      setProgress(2, attempt ? `Gemini đang thử lại với ${model}…` : `Gemini đang chấm bằng ${model}…`);
      let response;
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body
        });
      } catch (error) {
        throw new Error('Không kết nối được tới Gemini. Hãy kiểm tra Internet rồi thử lại.');
      }
      const payload = await response.json();
      if (response.ok) return { payload, model };
      lastError = new Error(friendlyApiError(response.status, payload.error));
      if (response.status !== 503) throw lastError;
      if (!attempt) await wait(1500 + Math.round(Math.random() * 500));
    }
  }
  throw lastError;
}
async function analyze() {
  if (!state.file || state.busy) return;
  const key = state.key.trim() || API_KEY.trim();
  if (!key) {
    showAlert('Hãy nhập Gemini API key trong Cài đặt AI hoặc điền API_KEY ở đầu app.js.', 'warning', [{ label: 'Cài đặt AI', onClick: openSettings }]);
    return;
  }
  hideAlert();
  state.busy = true;
  $('analyzeBtn').disabled = true;
  $('analyzeLabel').textContent = 'Đang phân tích bài nói…';
  setProgress(1, 'Đang đọc và chuẩn bị tệp…');
  try {
    const data = await fileToBase64(state.file);
    const detail = document.querySelector('input[name="detail"]:checked').value;
    const mimeType = state.file.type || ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' }[state.file.name.split('.').pop().toLowerCase()]);
    if (!mimeType) throw new Error('Không xác định được định dạng tệp. Hãy dùng MP3, WAV, M4A, MP4 hoặc WEBM.');
    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Hãy phân tích bài nói trong tệp này.' }, { inline_data: { mime_type: mimeType, data } }] }],
      systemInstruction: { parts: [{ text: promptFor(detail, $('teacherSelect').value, $('studentLabelSelect').value) }] },
      generationConfig: { responseMimeType: 'application/json' }
    });
    const { payload, model } = await generateAnalysis(requestBody, key);
    setProgress(3, 'Đang hoàn thiện báo cáo…');
    state.model = model;
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
    if (!text) throw new Error('AI không trả về nội dung phân tích. Hãy thử lại với tệp rõ tiếng hơn.');
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('AI trả về dữ liệu không đọc được. Hãy thử chấm lại.'); }
    state.analysis = normalized(parsed, true);
    state.reportStudentLabel = $('studentLabelSelect').value;
    state.reportTeacher = $('teacherSelect').value;
    state.historyId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    state.gradedAt = new Date().toISOString();
    state.editing = false;
    $('reportModel').textContent = `Model: ${model}`;
    $('studentName').value = '';
    $('studentClass').value = '';
    $('reportDate').value = localDate();
    $('saveHistoryBtn').textContent = 'Lưu vào lịch sử';
    renderReport();
    $('reportSection').classList.remove('hidden');
    $('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast('Chấm bài hoàn tất. Nhập tên, lớp rồi bấm Lưu vào lịch sử.');
    if (averageScore(state.analysis) >= 8) celebrate();
  } catch (error) {
    showAlert(error instanceof TypeError ? 'Không kết nối được tới Gemini. Hãy kiểm tra Internet hoặc mở trang qua máy chủ local.' : error.message, 'error', [
      { label: 'Thử lại ngay', onClick: analyze }, { label: 'Đổi API key', onClick: openSettings }
    ]);
  } finally {
    state.busy = false;
    $('analyzeBtn').disabled = !state.file;
    $('analyzeLabel').textContent = 'Bắt đầu chấm điểm';
    $('gradingProgress').classList.add('hidden');
  }
}

function appendEditable(element, value, setter) {
  element.textContent = value;
  element.contentEditable = state.editing ? 'true' : 'false';
  element.classList.toggle('editable', state.editing);
  if (state.editing) {
    element.oninput = () => setter(element.textContent);
  } else {
    element.oninput = null;
  }
}
function appendErrorField(container, label, value, setter) {
  if (!value) return;
  const row = document.createElement('div');
  row.className = 'error-field';
  const heading = document.createElement('strong');
  heading.textContent = label;
  const text = document.createElement('span');
  appendEditable(text, value, setter);
  row.append(heading, text);
  container.append(row);
}
function renderReport() {
  const a = state.analysis;
  if (!a) return;
  const average = averageScore(a);
  $('averageScore').textContent = average.toFixed(1);
  renderTranscript(a);
  appendEditable($('strengths'), a.overall_feedback.strengths, value => a.overall_feedback.strengths = value);
  appendEditable($('weaknesses'), a.overall_feedback.weaknesses, value => a.overall_feedback.weaknesses = value);
  const grid = $('criteriaGrid');
  grid.replaceChildren();
  for (const [key, label] of criteria) {
    const detail = a[`${key}_details`];
    const card = document.createElement('section'); card.className = 'criterion';
    const head = document.createElement('div'); head.className = 'criterion-head';
    const title = document.createElement('h3'); title.textContent = label;
    const score = document.createElement('span'); score.className = 'criterion-score'; score.textContent = `${a.scores[key].toFixed(1)} / 10`;
    head.append(title, score); card.append(head);
    if (detail.score_reason) {
      const reason = document.createElement('div'); reason.className = 'score-reason';
      const reasonLabel = document.createElement('strong'); reasonLabel.textContent = 'Vì sao được điểm này';
      const reasonText = document.createElement('span');
      appendEditable(reasonText, detail.score_reason, value => detail.score_reason = value);
      reason.append(reasonLabel, reasonText); card.append(reason);
    }
    const feedback = document.createElement('p');
    appendEditable(feedback, detail.feedback, value => detail.feedback = value);
    card.append(feedback);
    if (detail.errors.length) {
      const listLabel = document.createElement('h4');
      listLabel.className = 'errors-heading';
      listLabel.textContent = `Lỗi của ${state.reportStudentLabel}`;
      card.append(listLabel);
      const list = document.createElement('div'); list.className = 'error-list';
      detail.errors.forEach((error, index) => {
        const item = document.createElement('div'); item.className = 'error-item';
        if (error.summary) {
          const summary = document.createElement('div'); summary.className = 'error-summary';
          const mark = document.createElement('span'); mark.textContent = '✖'; mark.setAttribute('aria-hidden', 'true');
          const summaryText = document.createElement('span');
          appendEditable(summaryText, error.summary, value => detail.errors[index].summary = value);
          summary.append(mark, summaryText); item.append(summary);
        }
        appendErrorField(item, 'Bé đã nói / nghe thấy', error.evidence, value => detail.errors[index].evidence = value);
        appendErrorField(item, 'Nên nói', error.correction, value => detail.errors[index].correction = value);
        appendErrorField(item, 'Vì sao', error.explanation, value => detail.errors[index].explanation = value);
        appendErrorField(item, 'Cách luyện', error.practice, value => detail.errors[index].practice = value);
        list.append(item);
      });
      card.append(list);
    }
    grid.append(card);
  }
  const plan = $('actionPlan'); plan.replaceChildren();
  a.action_plan.forEach((step, index) => {
    const item = document.createElement('li');
    const value = document.createElement('span');
    appendEditable(value, step, text => a.action_plan[index] = text);
    item.append(value); plan.append(item);
  });
  $('editBtn').textContent = state.editing ? 'Xong chỉnh sửa' : 'Chỉnh sửa';
  renderScoreVisuals(a);
}
function copyReport() {
  const a = state.analysis;
  if (!a) return;
  const average = averageScore(a);
  const lines = ['BÁO CÁO PHÂN TÍCH TIẾNG ANH', `Học sinh: ${$('studentName').value || '—'} | Lớp: ${$('studentClass').value || '—'}`, `Ngày: ${$('reportDate').value}`, `Điểm trung bình: ${average.toFixed(1)}/10`, '', `Bản chép lời: ${a.transcription}`, ''];
  for (const [key, label] of criteria) {
    const d = a[`${key}_details`];
    lines.push(`${label}: ${a.scores[key].toFixed(1)}/10`, `Nhận xét: ${d.feedback}`);
    if (d.score_reason) lines.push(`Lý do chấm điểm: ${d.score_reason}`);
    if (d.errors.length) lines.push(`Lỗi của ${state.reportStudentLabel}:`);
    d.errors.forEach((error, index) => {
      lines.push(`✖ ${error.summary || error.evidence || `Lỗi ${index + 1}`}`);
      if (error.summary && error.evidence) lines.push(`  Dẫn chứng: ${error.evidence}`);
      if (error.correction) lines.push(`  Nên nói: ${error.correction}`);
      if (error.explanation) lines.push(`  Vì sao: ${error.explanation}`);
      if (error.practice) lines.push(`  Cách luyện: ${error.practice}`);
    });
    lines.push('');
  }
  lines.push(`Điểm mạnh: ${a.overall_feedback.strengths}`, `Cần cải thiện: ${a.overall_feedback.weaknesses}`, '', `Lộ trình: ${a.action_plan.join('; ')}`);
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const button = $('copyBtn'); button.textContent = 'Đã sao chép';
    setTimeout(() => button.textContent = 'Sao chép', 1800);
  }).catch(() => showAlert('Trình duyệt không cho sao chép tự động. Hãy mở trang bằng http://localhost.', 'error'));
}
function openSettings() {
  $('apiKeyInput').value = state.key;
  $('rememberKey').checked = Boolean(storedKey());
  $('modelInput').value = state.model;
  $('keyTestStatus').className = 'key-test-status hidden';
  $('keyTestStatus').textContent = '';
  $('settingsDialog').showModal();
}

$('dropzone').addEventListener('click', () => $('fileInput').click());
$('dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('fileInput').click(); } });
$('dropzone').addEventListener('dragover', event => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragging'));
$('dropzone').addEventListener('drop', event => { event.preventDefault(); $('dropzone').classList.remove('dragging'); setFile(event.dataTransfer.files[0]); });
$('fileInput').addEventListener('change', event => setFile(event.target.files[0]));
$('removeFileBtn').addEventListener('click', removeFile);
$('analyzeBtn').addEventListener('click', analyze);
$('settingsBtn').addEventListener('click', openSettings);
$('clearKeyBtn').addEventListener('click', () => $('apiKeyInput').value = '');
$('testKeyBtn').addEventListener('click', testApiKey);
$('settingsDialog').addEventListener('close', () => {
  if ($('settingsDialog').returnValue === 'save') {
    state.key = $('apiKeyInput').value.trim();
    state.model = $('modelInput').value.trim() || DEFAULT_MODEL;
    persistKeyChoice();
    hideAlert();
  }
});
$('editBtn').addEventListener('click', () => { state.editing = !state.editing; renderReport(); });
$('saveHistoryBtn').addEventListener('click', () => { if (saveCurrentReport()) showToast('Đã lưu báo cáo vào lịch sử chấm.'); });
$('copyBtn').addEventListener('click', copyReport);
$('pdfBtn').addEventListener('click', () => window.print());
$('newBtn').addEventListener('click', () => { state.analysis = null; state.historyId = null; state.gradedAt = null; state.editing = false; $('reportSection').classList.add('hidden'); removeFile(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('historyBtn').addEventListener('click', () => { renderHistory(); $('historySection').classList.remove('hidden'); $('historySection').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('closeHistoryBtn').addEventListener('click', () => $('historySection').classList.add('hidden'));
$('historyClassFilter').addEventListener('change', renderHistory);
$('historyNameSearch').addEventListener('input', renderHistory);
state.history = loadHistory();
initFeatures();
renderHistory();
