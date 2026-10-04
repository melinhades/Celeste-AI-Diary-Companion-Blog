/* ============================================================
 * felt-piano.js · Celeste 毛毡钢琴打字音效（原版采样）
 * 用法：
 *   FeltPiano.bind(document.getElementById('xxx'));        // 聚焦/失焦/打字
 *   FeltPiano.bind(input, { enterSend: true });           // Enter 直接播发送音
 *   FeltPiano.send();                                     // 手动播发送音
 * ============================================================ */
(function () {
  const DIR = 'feltpianotyping/';
  const CHAR_NOTES = ['A6_01', 'A7_01', 'A7_02', 'B6_02', 'C6_01', 'D6_01', 'D6_02', 'E6_01', 'E6_02', 'Fs6_01', 'G6_01'];
  const SEND_NOTES = ['accept', 'space_01', 'space_02', 'space_03', 'space_04', 'space_05'];

  const POOLS = {
    start: ['ui_main_rename_entry_backspace.wav'],
    stop:  ['ui_main_rename_entry_roll.wav'],
    type:  CHAR_NOTES.map(n => 'ui_main_rename_entry_char_' + n + '.wav'),
    send:  SEND_NOTES.map(n => 'send/ui_main_rename_entry_' + n + '.wav')
  };
  const TYPING_RE = /^(Key[A-Z]|Digit\d|Numpad\d|Space|Backspace)$/;
  const ENTER_RE = /^(Enter|NumpadEnter)$/;

  const SFX = {
    ctx: null, master: null, buffers: new Map(), htmlPool: {},
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      let ac;
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return; }
      this.ctx = ac;
      this.master = ac.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(ac.destination);
      this.preload();
    },
    preload() {
      for (const cat in POOLS)
        for (const f of POOLS[cat]) this._load(DIR + f);
    },
    async _load(url) {
      if (this.buffers.has(url)) return this.buffers.get(url);
      try {
        const r = await fetch(url);
        const buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
        this.buffers.set(url, buf);
        return buf;
      } catch (e) {           // file:// 直开：fetch 不可用，退回 HTMLAudio 池
        this.buffers.set(url, null);
        return null;
      }
    },
    play(cat) {
      this.init();
      if (!this.ctx) return;
      const list = POOLS[cat];
      const file = list[Math.floor(Math.random() * list.length)];
      const url = DIR + file;
      const p = this.buffers.has(url)
        ? Promise.resolve(this.buffers.get(url))
        : this._load(url);
      p.then(buf => {
        if (buf) {
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          src.connect(this.master);
          src.start();
        } else {
          this._playHtml(url);
        }
      });
    },
    _playHtml(url) {
      let pool = this.htmlPool[url];
      if (!pool) { pool = []; this.htmlPool[url] = pool; }
      let a = pool.find(x => x.paused || x.ended);
      if (!a) {
        if (pool.length >= 4) a = pool[0];
        else { a = new Audio(url); pool.push(a); }
      }
      a.volume = 0.5;
      try { a.currentTime = 0; } catch (e) {}
      a.play();
    }
  };

  window.FeltPiano = {
    /* 绑定输入框：聚焦=开始音，失焦=暂停音，按键=随机打字音 */
    bind(el, opts) {
      if (!el) return;
      opts = opts || {};
      el.addEventListener('focus', () => SFX.play('start'));
      el.addEventListener('blur',  () => SFX.play('stop'));
      el.addEventListener('keydown', e => {
        const code = e.code || '';
        if (ENTER_RE.test(code)) { SFX.play(opts.enterSend ? 'send' : 'type'); return; }
        if (TYPING_RE.test(code)) SFX.play('type');
      });
    },
    send() { SFX.play('send'); }
  };
})();
