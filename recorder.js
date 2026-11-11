/* Ghi âm trực tiếp bằng micro, rồi đổi sang WAV mono 16 kHz để gửi tới Gemini. */
(() => {
  const MAX_SECONDS = 600;
  const $r = (id) => document.getElementById(id);
  let recorder = null, stream = null, chunks = [], timer = null, startedAt = 0, audioCtx = null, analyser = null, frame = 0, levels = [];

  function setMode(mode) {
    const record = mode === 'record';
    $r('tabUpload').classList.toggle('active', !record);
    $r('tabRecord').classList.toggle('active', record);
    $r('tabUpload').setAttribute('aria-selected', String(!record));
    $r('tabRecord').setAttribute('aria-selected', String(record));
    $r('uploadMode').classList.toggle('hidden', record);
    $r('recordMode').classList.toggle('hidden', !record);
  }
  const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const status = (message) => { $r('recordStatus').textContent = message; };

  function drawLevels() {
    const canvas = $r('levelMeter');
    const ctx = canvas.getContext('2d');
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) sum += ((value - 128) / 128) ** 2;
    levels.push(Math.min(1, Math.sqrt(sum / data.length) * 4));
    const bars = 48;
    if (levels.length > bars) levels.shift();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gap = 4, width = (canvas.width - gap * (bars - 1)) / bars;
    levels.forEach((level, index) => {
      const height = Math.max(5, level * canvas.height);
      ctx.fillStyle = index === levels.length - 1 ? '#d03a84' : '#f08ab8';
      ctx.beginPath();
      ctx.roundRect(index * (width + gap) + (bars - levels.length) * (width + gap), (canvas.height - height) / 2, width, height, width / 2);
      ctx.fill();
    });
    frame = requestAnimationFrame(drawLevels);
  }

  function encodeWav(samples, rate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples.length * 2, true);
    samples.forEach((sample, i) => {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    });
    return new Blob([buffer], { type: 'audio/wav' });
  }
  async function toWav(blob) {
    const Context = window.AudioContext || window.webkitAudioContext;
    const ctx = new Context();
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const rate = 16000;
      const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      return encodeWav((await offline.startRendering()).getChannelData(0), rate);
    } finally { ctx.close(); }
  }

  function cleanup() {
    clearInterval(timer);
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach(track => track.stop());
    audioCtx?.close().catch(() => {});
    recorder = stream = audioCtx = analyser = null;
    $r('recordBtn').classList.remove('recording');
    $r('recordLabel').textContent = 'Bắt đầu ghi âm';
    $r('tabUpload').disabled = false;
  }

  async function start() {
    if (state.busy) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return showAlert('Trình duyệt này không hỗ trợ ghi âm. Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới, mở qua http://127.0.0.1:4173.', 'error');
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      return showAlert(error.name === 'NotAllowedError' ? 'Bạn chưa cho phép dùng micro. Hãy bấm biểu tượng ổ khóa cạnh địa chỉ trang và cho phép Micro.' : 'Không tìm thấy micro. Hãy kiểm tra thiết bị rồi thử lại.', 'error');
    }
    hideAlert();
    chunks = [];
    levels = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
    recorder.onstop = finish;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    recorder.start(1000);
    startedAt = Date.now();
    $r('recordBtn').classList.add('recording');
    $r('recordLabel').textContent = 'Dừng và chấm bài này';
    $r('tabUpload').disabled = true;
    status('Đang ghi âm… hãy nói rõ và gần micro.');
    timer = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      $r('recordTimer').textContent = clock(seconds);
      if (seconds >= MAX_SECONDS) stop();
    }, 250);
    drawLevels();
  }
  function stop() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }
  async function finish() {
    const seconds = (Date.now() - startedAt) / 1000;
    const mime = recorder?.mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mime });
    cleanup();
    if (seconds < 1 || !blob.size) { status('Bản ghi quá ngắn. Hãy ghi lại.'); return; }
    status('Đang xử lý bản ghi…');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    try {
      const wav = await toWav(blob);
      setFile(new File([wav], `ghi-am-${stamp}.wav`, { type: 'audio/wav' }));
    } catch {
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      setFile(new File([blob], `ghi-am-${stamp}.${ext}`, { type: mime.split(';')[0] }));
    }
    $r('recordTimer').textContent = '00:00';
    status('Cho phép micro khi trình duyệt hỏi. Ghi tối đa 10 phút.');
  }

  $r('tabUpload').addEventListener('click', () => setMode('upload'));
  $r('tabRecord').addEventListener('click', () => setMode('record'));
  $r('recordBtn').addEventListener('click', () => (recorder ? stop() : start()));
  window.addEventListener('pagehide', () => { if (recorder) recorder.onstop = null; cleanup(); });
})();
