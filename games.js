/* Trò chơi tiếng Anh cho bé: đố từ vựng, nghe & chọn, sắp xếp chữ cái, lật thẻ ghép cặp. */
(() => {
  const GAMES_KEY = 'speaking-ai-pro-games-v1';
  const $g = (id) => document.getElementById(id);
  const WORD_BANK = [
    ['cat', 'con mèo', '🐱', 'animals'], ['dog', 'con chó', '🐶', 'animals'], ['bird', 'con chim', '🐦', 'animals'], ['fish', 'con cá', '🐟', 'animals'],
    ['rabbit', 'con thỏ', '🐰', 'animals'], ['elephant', 'con voi', '🐘', 'animals'], ['monkey', 'con khỉ', '🐵', 'animals'], ['lion', 'sư tử', '🦁', 'animals'],
    ['duck', 'con vịt', '🦆', 'animals'], ['horse', 'con ngựa', '🐴', 'animals'],
    ['apple', 'quả táo', '🍎', 'fruits'], ['banana', 'quả chuối', '🍌', 'fruits'], ['orange', 'quả cam', '🍊', 'fruits'], ['grape', 'quả nho', '🍇', 'fruits'],
    ['strawberry', 'dâu tây', '🍓', 'fruits'], ['watermelon', 'dưa hấu', '🍉', 'fruits'], ['pineapple', 'quả dứa', '🍍', 'fruits'], ['lemon', 'quả chanh', '🍋', 'fruits'],
    ['milk', 'sữa', '🥛', 'food'], ['bread', 'bánh mì', '🍞', 'food'], ['egg', 'quả trứng', '🥚', 'food'], ['rice', 'cơm', '🍚', 'food'],
    ['cake', 'bánh kem', '🎂', 'food'], ['pizza', 'bánh pizza', '🍕', 'food'], ['cheese', 'phô mai', '🧀', 'food'], ['juice', 'nước ép', '🧃', 'food'],
    ['book', 'quyển sách', '📚', 'things'], ['bag', 'cặp sách', '🎒', 'things'], ['ball', 'quả bóng', '⚽', 'things'], ['car', 'ô tô', '🚗', 'things'],
    ['bike', 'xe đạp', '🚲', 'things'], ['house', 'ngôi nhà', '🏠', 'things'], ['clock', 'đồng hồ', '⏰', 'things'], ['phone', 'điện thoại', '📱', 'things'],
    ['shoes', 'đôi giày', '👟', 'things'], ['pencil', 'bút chì', '✏️', 'things'],
    ['sun', 'mặt trời', '☀️', 'nature'], ['moon', 'mặt trăng', '🌙', 'nature'], ['star', 'ngôi sao', '⭐', 'nature'], ['tree', 'cái cây', '🌳', 'nature'],
    ['flower', 'bông hoa', '🌸', 'nature'], ['rain', 'cơn mưa', '🌧️', 'nature'], ['cloud', 'đám mây', '☁️', 'nature'], ['rainbow', 'cầu vồng', '🌈', 'nature']
  ].map(([en, vi, emoji, cat]) => ({ en, vi, emoji, cat }));
  const DEFS = {
    quiz: { title: 'Đố từ vựng', hint: 'Nhìn hình, chọn từ tiếng Anh đúng.' },
    listen: { title: 'Nghe và chọn', hint: 'Nghe từ tiếng Anh rồi chọn hình đúng.' },
    scramble: { title: 'Sắp xếp chữ cái', hint: 'Ghép các chữ cái thành từ đúng.' },
    memory: { title: 'Lật thẻ ghép cặp', hint: 'Tìm hình và từ tiếng Anh giống nhau.' }
  };
  const ROUNDS = 8, POINTS = 10;
  const game = { type: null, words: [], round: 0, score: 0, locked: false, timers: [] };

  const shuffle = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (list, n) => shuffle(list).slice(0, n);
  const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text != null) el.textContent = text; return el; };
  const pool = () => { const cat = $g('gameCategory').value; return WORD_BANK.filter(word => cat === 'all' || word.cat === cat); };
  const later = (fn, ms) => { const id = setTimeout(fn, ms); game.timers.push(id); };
  const clearTimers = () => { game.timers.forEach(clearTimeout); game.timers = []; };

  function speak(text) {
    if (!('speechSynthesis' in window)) return false;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.8;
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find(v => /^en[-_]US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
    speechSynthesis.speak(utterance);
    return true;
  }

  /* ---------- Kỷ lục ---------- */
  function bests() {
    try { return JSON.parse(localStorage.getItem(GAMES_KEY) || '{}').best || {}; } catch { return {}; }
  }
  function saveBest(type, score) {
    const best = bests();
    if (score <= (best[type] || 0)) return false;
    best[type] = score;
    try { localStorage.setItem(GAMES_KEY, JSON.stringify({ best })); } catch { /* bỏ qua */ }
    return true;
  }
  function renderBests() {
    const best = bests();
    document.querySelectorAll('.game-card').forEach(card => {
      card.querySelector('small').textContent = best[card.dataset.game] ? `Kỷ lục: ${best[card.dataset.game]} điểm` : 'Chưa chơi';
    });
  }

  /* ---------- Khung chung ---------- */
  const body = () => $g('gameBody');
  function feedback(message, kind = '') {
    const el = $g('gameFeedback');
    el.textContent = message;
    el.className = `game-feedback ${kind}`;
  }
  function header(progress) {
    $g('gameScore').textContent = `⭐ ${game.score} điểm`;
    $g('gameProgress').textContent = progress;
  }
  function stop() {
    clearTimers();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    game.type = null;
    $g('gameStage').classList.add('hidden');
    $g('gameMenuWrap').classList.remove('hidden');
    renderBests();
  }
  function start(type) {
    clearTimers();
    const words = pool();
    game.type = type; game.round = 0; game.score = 0; game.locked = false;
    game.words = type === 'memory' ? [] : sample(words, Math.min(ROUNDS, words.length));
    $g('gameMenuWrap').classList.add('hidden');
    $g('gameStage').classList.remove('hidden');
    $g('gameTitle').textContent = DEFS[type].title;
    feedback(DEFS[type].hint);
    if (type === 'memory') return startMemory(words);
    nextRound();
  }
  function advance() { game.round++; game.locked = false; nextRound(); }
  function nextRound() {
    if (game.round >= game.words.length) return finish(game.score, game.words.length * POINTS);
    header(`Câu ${game.round + 1}/${game.words.length}`);
    ({ quiz: roundQuiz, listen: roundListen, scramble: roundScramble }[game.type])(game.words[game.round]);
  }
  function finish(score, max) {
    clearTimers();
    const ratio = max ? score / max : 0;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.3 ? 1 : 0;
    const record = saveBest(game.type, score);
    header('Hoàn thành!');
    const box = make('div', 'game-result');
    box.append(
      make('div', 'game-result-stars', stars ? '⭐'.repeat(stars) + '☆'.repeat(3 - stars) : '☆☆☆'),
      make('h3', '', stars === 3 ? 'Tuyệt vời!' : stars === 2 ? 'Giỏi lắm!' : stars === 1 ? 'Khá tốt, thử lại nhé!' : 'Cố lên nào!'),
      make('p', '', `Bé được ${score}/${max} điểm${record ? ' · 🎉 Kỷ lục mới!' : ''}`)
    );
    const again = make('button', 'primary-button small', 'Chơi lại');
    again.type = 'button';
    again.addEventListener('click', () => start(game.type));
    const menu = make('button', 'secondary-button', 'Chọn trò khác');
    menu.type = 'button';
    menu.addEventListener('click', stop);
    const actions = make('div', 'game-result-actions');
    actions.append(again, menu);
    box.append(actions);
    body().replaceChildren(box);
    feedback('');
    if (ratio >= 0.7 && typeof celebrate === 'function') celebrate();
  }
  function optionButton(content, className = 'game-option') {
    const button = make('button', className, content);
    button.type = 'button';
    return button;
  }
  /* Xử lý chọn đáp án cho trò dạng trắc nghiệm. */
  function choose(word, picked, buttons, clicked) {
    if (game.locked) return;
    game.locked = true;
    const correct = picked === word;
    buttons.forEach(([btn, w]) => { btn.disabled = true; if (w === word) btn.classList.add('correct'); });
    if (correct) { game.score += POINTS; feedback(`Chính xác! ${word.en} = ${word.vi} 🎉`, 'good'); }
    else { clicked.classList.add('wrong'); feedback(`Chưa đúng. Đáp án là "${word.en}" (${word.vi}).`, 'bad'); }
    header(`Câu ${game.round + 1}/${game.words.length}`);
    speak(word.en);
    later(advance, 1500);
  }
  const optionsFor = (word) => shuffle([word, ...sample(pool().filter(w => w !== word), 3)]);

  /* ---------- Trò 1: Đố từ vựng ---------- */
  function roundQuiz(word) {
    const emoji = make('div', 'game-emoji', word.emoji);
    emoji.setAttribute('role', 'img');
    emoji.setAttribute('aria-label', word.vi);
    const grid = make('div', 'game-options');
    const buttons = optionsFor(word).map(option => {
      const btn = optionButton(option.en);
      btn.addEventListener('click', () => choose(word, option, buttons, btn));
      grid.append(btn);
      return [btn, option];
    });
    body().replaceChildren(emoji, make('p', 'game-hint', `Tiếng Việt: ${word.vi}`), grid);
    feedback('Từ tiếng Anh của hình này là gì?');
  }

  /* ---------- Trò 2: Nghe và chọn ---------- */
  function roundListen(word) {
    const canSpeak = 'speechSynthesis' in window;
    const play = optionButton(canSpeak ? '🔊 Nghe lại' : `🔊 ${word.en}`, 'game-play');
    play.addEventListener('click', () => speak(word.en));
    const grid = make('div', 'game-options emoji-options');
    const buttons = optionsFor(word).map(option => {
      const btn = optionButton(option.emoji, 'game-option big-emoji');
      btn.setAttribute('aria-label', option.vi);
      btn.addEventListener('click', () => choose(word, option, buttons, btn));
      grid.append(btn);
      return [btn, option];
    });
    body().replaceChildren(play, grid);
    feedback(canSpeak ? 'Nghe và chọn hình đúng nhé!' : 'Trình duyệt chưa đọc được tiếng Anh nên từ được hiển thị sẵn.');
    if (canSpeak) later(() => speak(word.en), 350);
  }

  /* ---------- Trò 3: Sắp xếp chữ cái ---------- */
  function roundScramble(word) {
    let letters = word.en.split('');
    for (let i = 0; i < 10 && letters.join('') === word.en; i++) letters = shuffle(word.en.split(''));
    const tiles = letters.map(ch => ({ ch, used: false }));
    const placed = [];
    let tries = 0;
    const slots = make('div', 'scramble-slots');
    const pile = make('div', 'scramble-tiles');
    const emoji = make('div', 'game-emoji small', word.emoji);
    emoji.setAttribute('role', 'img');
    emoji.setAttribute('aria-label', word.vi);
    const skip = make('button', 'secondary-button', 'Bỏ qua');
    const clear = make('button', 'secondary-button', 'Xóa hết');
    skip.type = clear.type = 'button';
    const draw = () => {
      slots.replaceChildren(...Array.from({ length: tiles.length }, (_, k) => {
        const slot = make('button', `scramble-slot${placed[k] != null ? ' filled' : ''}`, placed[k] != null ? tiles[placed[k]].ch : '');
        slot.type = 'button';
        slot.disabled = placed[k] == null || game.locked;
        slot.setAttribute('aria-label', placed[k] != null ? `Bỏ chữ ${tiles[placed[k]].ch}` : `Ô trống ${k + 1}`);
        slot.addEventListener('click', () => { tiles[placed[k]].used = false; placed.splice(k, 1); draw(); });
        return slot;
      }));
      pile.replaceChildren(...tiles.map((tile, index) => {
        const btn = make('button', 'scramble-tile', tile.ch);
        btn.type = 'button';
        btn.disabled = tile.used || game.locked;
        btn.addEventListener('click', () => {
          if (game.locked || tile.used) return;
          tile.used = true; placed.push(index); draw();
          if (placed.length === tiles.length) check();
        });
        return btn;
      }));
    };
    const reveal = (message, kind, points) => {
      game.locked = true;
      game.score += points;
      placed.splice(0, placed.length, ...tiles.map((_, i) => i));
      slots.replaceChildren(...word.en.split('').map(ch => make('span', 'scramble-slot filled revealed', ch)));
      feedback(message, kind);
      header(`Câu ${game.round + 1}/${game.words.length}`);
      speak(word.en);
      later(advance, 1600);
    };
    const check = () => {
      const guess = placed.map(i => tiles[i].ch).join('');
      if (guess === word.en) return reveal(`Chính xác! ${word.en} = ${word.vi} 🎉`, 'good', tries === 0 ? POINTS : POINTS / 2);
      tries++;
      slots.classList.add('shake');
      if (tries >= 2) return reveal(`Chưa đúng. Đáp án là "${word.en}".`, 'bad', 0);
      feedback('Chưa đúng, thử lại lần nữa nhé!', 'bad');
      game.locked = true;
      later(() => { slots.classList.remove('shake'); tiles.forEach(t => t.used = false); placed.length = 0; game.locked = false; draw(); }, 700);
    };
    clear.addEventListener('click', () => { if (game.locked) return; tiles.forEach(t => t.used = false); placed.length = 0; draw(); });
    skip.addEventListener('click', () => { if (!game.locked) reveal(`Đáp án là "${word.en}".`, 'bad', 0); });
    const actions = make('div', 'game-result-actions');
    actions.append(clear, skip);
    body().replaceChildren(emoji, make('p', 'game-hint', `Tiếng Việt: ${word.vi}`), slots, pile, actions);
    feedback('Bấm các chữ cái theo đúng thứ tự.');
    draw();
  }

  /* ---------- Trò 4: Lật thẻ ghép cặp ---------- */
  function startMemory(words) {
    const picks = sample(words, Math.min(6, words.length));
    const cards = shuffle(picks.flatMap(word => [{ word, kind: 'emoji' }, { word, kind: 'word' }]));
    let open = [], matched = 0, moves = 0;
    const grid = make('div', 'memory-grid');
    header(`Lượt: 0 · Cặp: 0/${picks.length}`);
    cards.forEach(card => {
      const btn = make('button', 'memory-card');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Thẻ úp');
      const face = make('span', `memory-face ${card.kind}`, card.kind === 'emoji' ? card.word.emoji : card.word.en);
      btn.append(make('span', 'memory-back', '🎀'), face);
      btn.addEventListener('click', () => {
        if (game.locked || btn.classList.contains('open') || btn.classList.contains('matched')) return;
        btn.classList.add('open');
        btn.setAttribute('aria-label', card.kind === 'emoji' ? card.word.vi : card.word.en);
        open.push({ btn, card });
        if (open.length < 2) return;
        moves++;
        const [a, b] = open;
        open = [];
        if (a.card.word === b.card.word && a.card.kind !== b.card.kind) {
          matched++;
          a.btn.classList.add('matched'); b.btn.classList.add('matched');
          feedback(`Đúng rồi! ${a.card.word.en} = ${a.card.word.vi} 🎉`, 'good');
          speak(a.card.word.en);
          header(`Lượt: ${moves} · Cặp: ${matched}/${picks.length}`);
          if (matched === picks.length) {
            game.score = Math.max(20, 100 - (moves - picks.length) * 8);
            later(() => finish(game.score, 100), 1100);
          }
        } else {
          game.locked = true;
          feedback('Chưa khớp, nhớ vị trí rồi thử lại nhé.', 'bad');
          header(`Lượt: ${moves} · Cặp: ${matched}/${picks.length}`);
          later(() => { [a, b].forEach(({ btn: x }) => { x.classList.remove('open'); x.setAttribute('aria-label', 'Thẻ úp'); }); game.locked = false; }, 900);
        }
      });
      grid.append(btn);
    });
    body().replaceChildren(grid);
    feedback('Lật hai thẻ: một hình và một từ tiếng Anh giống nhau.');
  }

  /* ---------- Điều hướng ---------- */
  function openGames() {
    $g('historySection').classList.add('hidden');
    $g('gamesSection').classList.remove('hidden');
    renderBests();
    $g('gamesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closeGames() { stop(); $g('gamesSection').classList.add('hidden'); }

  $g('gamesBtn').addEventListener('click', openGames);
  $g('closeGamesBtn').addEventListener('click', closeGames);
  $g('gameBackBtn').addEventListener('click', stop);
  $g('gameCategory').addEventListener('change', () => stop());
  $g('historyBtn').addEventListener('click', () => { if (!$g('gamesSection').classList.contains('hidden')) closeGames(); });
  document.querySelectorAll('.game-card').forEach(card => card.addEventListener('click', () => start(card.dataset.game)));
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  renderBests();
})();
