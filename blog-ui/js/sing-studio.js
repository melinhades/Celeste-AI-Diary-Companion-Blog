/* ===== Sing Studio —— 把"一首歌的音频"变成"Madeline 唱这首歌" =====
 *
 * 串起三段已经各自验收过的轮子，页面只负责接线：
 *   歌曲音频 ──Melody.extract/segment──► 音符 [[t,dur,midi,conf]]
 *            ──Melody.align(歌词)──────► 逐音字位 chars（null = 转音尾巴）
 *            ──SingV5.plan/renderTrack─► TD-PSOLA 或 LPC 干声
 *            ──busRender(混响/压缩)────► 成品（可叠原曲）──encodeWav──► 下载
 *
 * 为什么必须有钢琴卷帘：全混音流行歌的自动提取必然出错（干声才 39/44 命中），
 * 原作根本没有歌唱系统可对照（wow_so_secret 是外部 Amadeus Pro 导出的成品干声），
 * 所以"提取 + 人工修"是唯一诚实的路线，卷帘就是那个"人工修"。
 *
 * 总线链照官方 FMOD 源工程：speech→dialogue→char→gameplay_sfx→Master。
 * 其中 char 的 MultibandEq(22000) 与 gameplay_sfx 的 Lowpass(22000) 都是旁通值 → 省略；
 * 保留可听的两件：dialogue 上的压缩、以及混响 send
 * （sfx_in_space decayTime 6000/highCut 1350，prologue_verb earlyDelay 15/lateDelay 22/earlyLateMix 59）。
 */
(function (global) {
'use strict';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const nameOf = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const db2lin = db => Math.pow(10, db / 20);

function create() {
  let ctx = null, eng = null, curSrc = null, curSong = null, raf = 0;

  // ---------------------------------------------------------------- 状态
  const S = {
    song: null, songName: '',            // 上传的歌曲
    ex: null, notes: [], chars: [], lyric: '', spokeBuf: null, markCount: 0,
    prof: null, plan: null, voiceBuf: null, mixBuf: null,
    sel: -1, drag: null, playing: false, t0: 0
  };
  const view = { pps: 120, lo: 46, hi: 90, cv: null, x0: 46, y0: 18, padR: 10, padB: 20 };
  const opt = {                        // 提取阈值（只放页面上要抠的几项，其余走 Melody.DEFAULTS）
    gainFloor: Melody.DEFAULTS.gainFloor, lamPerSemis: Melody.DEFAULTS.lamPerSemis,
    splitCents: Melody.DEFAULTS.splitCents, minNoteSec: Melody.DEFAULTS.minNoteSec,
    silSplitFrames: Melody.DEFAULTS.silSplitFrames, fromSec: 0, toSec: 0, downsample: 22050,
    vol: 0.9                                          // 试听音量（只影响播放，不影响渲染/导出）
  };

  // ---------------------------------------------------------------- 音频/引擎
  /**
   * 页面加载时建的 AudioContext 在浏览器自动播放策略下是 suspended， resume() 只有在
   * 真的用户手势里才起作用；拿不到手势就抹异常，让调用方自己查 audioState()。
   */
  async function ensureAudio() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) throw new Error('这个浏览器没有 Web Audio API');
      ctx = new AC({ latencyHint: 'interactive' });
    }
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch (e) { /* 被自动播放策略挡住，不是错误 */ }
    }
    return ctx;
  }
  /** 声音上下文当前状态：无声先看这个（running / suspended / closed / none） */
  function audioState() { return ctx ? ctx.state : 'none'; }
  /** 在用户手势里唤一声，把被挂起的声音上下文弄成 running */
  async function unlock() { await ensureAudio(); return audioState(); }
  async function ensureEngine(pools) {
    await ensureAudio();
    if (!eng) eng = SingV5.create(ctx, { pools: pools || ['angry', 'determined'], perGroup: 10 });
    return eng;
  }
  const auditReady = () => !!(eng && eng.getAudit());

  // 只审计"用得上的池"，省时间：策略选了某个池就保证它在清单里
  function poolListFor(strategy, base) {
    const list = (base || []).slice();
    if (strategy && SingV5.ALL_POOLS.indexOf(strategy) >= 0 && list.indexOf(strategy) < 0) list.push(strategy);
    return list;
  }

  async function audit(pools, onProgress) {
    const e = await ensureEngine(pools);
    return e.runAudit(onProgress, pools);
  }

  // ---------------------------------------------------------------- 载入歌曲
  async function loadFile(file) {
    await ensureAudio();
    const ab = await file.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    stop();
    S.song = buf; S.songName = file.name || 'song';
    S.ex = null; S.notes = []; S.chars = []; S.sel = -1;
    return buf;
  }

  /** 载入仓库自带素材（验收用例：celeste-sounds/wow_so_secret.wav 是干声真值） */
  async function loadUrl(url, name) {
    await ensureAudio();
    const r = await fetch(url);
    if (!r.ok) throw new Error(`拿不到 ${url}（${r.status}）`);
    const buf = await ctx.decodeAudioData(await r.arrayBuffer());
    stop();
    S.song = buf; S.songName = name || url.split('/').pop();
    S.ex = null; S.notes = []; S.chars = []; S.sel = -1;
    return buf;
  }

  // ---------------------------------------------------------------- 提取
  /** 同步重计算（4 分钟歌在 22.05k 下约 1~5s），调用方先一帧让 log 刷出来 */
  function detect(extra) {
    if (!S.song) throw new Error('先载入歌曲音频');
    const O = Object.assign({}, opt, extra || {});
    const sr0 = S.song.sampleRate;
    let srcBuf = S.song;
    if (O.fromSec > 0 || (O.toSec > O.fromSec)) {                     // 只分析选中时间段
      const a = Math.max(0, Math.floor(O.fromSec * sr0));
      const b = O.toSec > O.fromSec ? Math.min(S.song.length, Math.floor(O.toSec * sr0)) : S.song.length;
      const cut = ctx.createBuffer(S.song.numberOfChannels, b - a, sr0);
      for (let c = 0; c < S.song.numberOfChannels; c++) cut.getChannelData(c).set(S.song.getChannelData(c).subarray(a, b));
      srcBuf = cut;
    }
    const mono = Melody.toMono(srcBuf, O.downsample || srcBuf.sampleRate);
    const ex = Melody.extract(mono.d, mono.sr, O);
    const notes = Melody.segment(ex, O);
    S.mono = mono; S.ex = ex;
    S.notes = notes; S.sel = -1;
    realign();
    fitView();
    return notes;
  }

  /** 歌词 → 逐音字位（音符被手动改过后要重跑） */
  function realign() {
    const before = S.notes;
    const a = Melody.align(before, S.lyric || '');
    // 对齐会把长音拆成子槽，置信度按"落在哪个原音里"回溯，而不是按下标（下标会错位）
    S.notes = a.notes.map(n => {
      let conf = 0.7;
      for (const o of before) { if (o[3] != null && n[0] >= o[0] - 0.02 && n[0] < o[0] + o[1] + 0.02) { conf = o[3]; break; } }
      return [n[0], n[1], n[2], conf];
    });
    S.chars = a.chars;
    if (S.sel >= S.notes.length) S.sel = -1;
    return a;
  }

  function setLyric(text) { S.lyric = text || ''; return realign(); }

  // 整体移调（不破坏相对音高），配 Melody.bestTranspose 一键落到准入音域
  function transpose(semis) { S.notes = S.notes.map(n => [n[0], n[1], n[2] + semis, n[3]]); return S.notes; }
  function autoTranspose() {
    if (!auditReady()) return null;
    const r = eng.safeRange();
    const k = Melody.bestTranspose(S.notes, r.lo, r.hi, 24);
    if (k) transpose(k);
    return { k, range: r };
  }

  // ---------------------------------------------------------------- 表情参数
  async function fitProf() {
    if (S.prof) return S.prof;
    const wow = await eng.loadWow();
    S.prof = wow ? eng.fitExpression(wow).profile : null;
    return S.prof;
  }

  // ---------------------------------------------------------------- 合成 + 总线
  /** strategy = 池名 / 'auto' / 'cross'；chain = 'psola' | 'lpc'；autoPlay=false 则只渲染不播；legato=false 回到旧的逐音模式；
   *  mode='sentence' 走两段式：先把字摆成一句话（不变调），再对整句变调（S.spokeBuf 是中间产物） */
  async function sing(strategy, chain, bus, autoPlay, legato, mode) {
    if (!auditReady()) throw new Error('先跑库存审计');
    if (!S.notes.length) throw new Error('没有音符');
    const names = Object.keys(eng.getAudit().pools);
    if (strategy !== 'auto' && strategy !== 'cross' && names.indexOf(strategy) < 0)
      throw new Error(`池 ${strategy} 未审计，已审计：${names.join('/')}`);
    const simple = S.notes.map(n => [n[0], n[1], n[2]]);
    const plan = eng.plan(simple, null, strategy, S.chars);
    if (!plan.voices.length) throw new Error('一个音都没排上：多半是音域超出准入库存，试 autoTranspose');
    await fitProf();
    const t0 = performance.now();
    let voice, spoke = null, markCount = 0;
    if (mode === 'sentence') {
      const r = eng.renderTrackSentence(plan, chain, S.prof, { legato: legato !== false });
      voice = r.sung; spoke = r.spoke; markCount = r.marks;
    } else {
      voice = eng.renderTrack(plan, chain, S.prof, { legato: legato !== false });
    }
    S.spokeBuf = spoke; S.markCount = markCount;
    const t1 = performance.now();
    const mix = await busRender(voice, bus || {});
    const t2 = performance.now();
    S.plan = plan; S.voiceBuf = voice; S.mixBuf = mix;
    const met = eng.pitchMetrics(voice, plan.voices, S.prof);
    if (autoPlay !== false) await play(mix, bus && bus.withSong, bus && bus.songGain);
    return {
      plan, voices: plan.voices.length, ms: { render: Math.round(t1 - t0), bus: Math.round(t2 - t1) },
      heads: plan.voices.filter(v => v.attack).length, legato: legato !== false,
      mode: mode === 'sentence' ? 'sentence' : 'note', marks: markCount, hasSpoke: !!spoke,
      metrics: { rmse: +met.rmse.toFixed(1), mae: +met.mae.toFixed(1), spread: +(+met.vibSpread || 0).toFixed(0), grossRate: +met.grossRate.toFixed(3), clicks: eng.clickCount(voice, plan.voices), perVoice: met.perVoice },
      peak: { voice: +peakOf(voice).toFixed(3), mix: +peakOf(mix).toFixed(3) }, audio: audioState(), playing: S.playing
    };
  }

  /** 峰值：“渲出了一条静音”和“有声但听不见”就靠这个分开 */
  function peakOf(b) {
    if (!b) return 0;
    let p = 0;
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i += 7) { const a = Math.abs(d[i]); if (a > p) p = a; }
    }
    return p;
  }

  /** FMOD 那条"能听出来"的链：dialogue 压缩 + 混响 send（EQ/Lowpass 在原工程是旁通值） */
  async function busRender(dry, o) {
    const B = Object.assign({ wet: 0.22, decaySec: 1.0, cutHz: 1350, comp: true, dry: 1, earlyLateMix: 0.59, withSong: false, songGain: 0.3 }, o || {});
    const sr = dry.sampleRate;
    const tail = Math.ceil(sr * (B.wet > 0.001 ? B.decaySec : 0.2));
    const oc = new OfflineAudioContext(2, dry.length + tail, sr);
    const src = oc.createBufferSource(); src.buffer = dry;
    const comp = oc.createDynamicsCompressor();
    if (B.comp) { comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.12; }
    else { comp.threshold.value = 0; comp.ratio.value = 1; }
    const dryG = oc.createGain(); dryG.gain.value = B.dry;
    src.connect(comp); comp.connect(dryG); dryG.connect(oc.destination);
    src.start(0);                                              // 忘了这一句：总线会渲出一块纯静音
    if (B.wet > 0.001) {
      const send = oc.createGain(); send.gain.value = B.wet;
      const cv = oc.createConvolver(); cv.buffer = makeIR(oc, B.decaySec, B.cutHz, B.earlyLateMix);
      src.connect(send); send.connect(cv); cv.connect(oc.destination);
    }
    if (B.withSong && S.song) {
      const s2 = oc.createBufferSource(); s2.buffer = S.song;
      const g2 = oc.createGain(); g2.gain.value = B.songGain;
      s2.connect(g2); g2.connect(oc.destination); s2.start(0);
    }
    const out = await oc.startRendering();
    normalize(out, -1);
    return out;
  }

  /** 程序化 IR：指数衰减噪声 + 一阶低通（= FMOD highCut）+ 两个早期反射抽头（15/22ms） */
  function makeIR(oc, decaySec, cutHz, earlyLateMix) {
    const sr = oc.sampleRate, n = Math.max(256, Math.round(sr * clamp(decaySec, 0.15, 6)));
    const ir = oc.createBuffer(2, n, sr);
    const al = 1 - Math.exp(-2 * Math.PI * clamp(cutHz, 600, 12000) / sr);
    const early = Math.round(0.015 * sr), late = Math.round(0.022 * sr);
    const eL = clamp(earlyLateMix == null ? 0.59 : earlyLateMix, 0, 1);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const u = Math.sin((i + 1 + c * 7919) * (c ? 12.9898 : 78.233)) * 43758.5453;
        const noise = (u - Math.floor(u)) * 2 - 1;
        lp += al * (noise - lp);
        d[i] = lp * Math.exp(-6.908 * i / n) * (1 - i / n * 0.35);
      }
      const amp = 0.7 * eL;
      if (early < n) d[early] += amp;                       // 早期反射：决定"空间"的硬度
      if (late < n) d[late] += amp * 0.75;
      let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
      if (pk > 0) for (let i = 0; i < n; i++) d[i] /= pk;
    }
    return ir;
  }

  function normalize(buf, targetDb) {
    const g = db2lin(targetDb);
    let pk = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
    }
    if (pk > 1e-6) { const k = g / pk; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
    return buf;
  }

  // ---------------------------------------------------------------- 播放
  function stop() {
    if (curSrc) { try { curSrc.stop(); } catch (e) { /* 已经放完 */ } curSrc = null; }
    if (curSong) { try { curSong.stop(); } catch (e) { /* same */ } curSong = null; }
    S.playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0; draw();
  }
  /** buf = 要放的音频（缺省放刚唱出来的那条）；withSong = 同时放原曲垫背（对拍/挑错用） */
  async function play(buf, withSong, songGain, offset) {
    buf = buf || S.mixBuf || S.voiceBuf;
    if (!buf) return false;
    await ensureAudio(); stop();
    const out = ctx.createGain(); out.gain.value = clamp(opt.vol == null ? 0.9 : opt.vol, 0, 1);
    out.connect(ctx.destination);
    curSrc = ctx.createBufferSource(); curSrc.buffer = buf; curSrc.connect(out);
    if (withSong && S.song) {
      curSong = ctx.createBufferSource(); curSong.buffer = S.song;
      const g = ctx.createGain(); g.gain.value = songGain == null ? 0.3 : songGain;
      curSong.connect(g); g.connect(out);
      curSong.start(0, clamp(offset || 0, 0, Math.max(0, S.song.duration - 0.01)));
    }
    curSrc.start(0, clamp(offset || 0, 0, Math.max(0, buf.duration - 0.01)));
    S.playing = true; S.t0 = ctx.currentTime - (offset || 0);
    const tick = () => {
      if (!S.playing) return;
      S.cursor = ctx.currentTime - S.t0;
      if (curSrc && curSrc.duration != null && S.cursor > buf.duration) { stop(); return; }
      draw(); raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = () => { if (S.playing) stop(); };
    curSrc.onended = done;
    if (curSong) curSong.onended = () => { curSong = null; };
    return audioState() === 'running';
  }

  // ---------------------------------------------------------------- WAV 导出
  function encodeWav(buf) {
    const ch = buf.numberOfChannels, sr = buf.sampleRate, n = buf.length;
    const ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const chans = []; for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
      const s = clamp(chans[c][i], -1, 1);
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
  }
  function saveWav(buf, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(encodeWav(buf || S.mixBuf));
    a.download = (name || (S.songName.replace(/\.[^.]+$/, '') + '_madeline')) + '.wav';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------------------------------------------------------- 卷帘：坐标
  // 没接 canvas 也要能跑（Node/验收 harness 只做数据流水线时不应该掉）
  const cw = () => view.cv ? view.cv.width : 1000;
  const chh = () => view.cv ? view.cv.height : 360;
  const plotW = () => cw() - view.x0 - view.padR;
  const plotH = () => chh() - view.y0 - view.padB;
  const rowH = () => plotH() / (view.hi - view.lo + 1);
  const tToX = t => view.x0 + t * view.pps;
  const xToT = x => (x - view.x0) / view.pps;
  const mToY = m => view.y0 + (view.hi - m) * rowH() + 1;
  const yToM = y => Math.round(view.hi - (y - view.y0) / rowH() - 0.5);
  const totalSec = () => Math.max(1, S.ex ? (S.ex.frames.length * S.ex.hop / S.ex.sr) : (S.notes.length ? S.notes[S.notes.length - 1][0] + 1 : 1));

  function fitView() {
    if (!S.notes.length) return;
    const ms = S.notes.map(n => n[2]);
    view.lo = Math.max(36, Math.min(...ms) - 4);
    view.hi = Math.min(100, Math.max(...ms) + 4);
    view.pps = clamp(plotW() / totalSec(), 8, 400);
    draw();
  }

  function hitTest(x, y) {
    for (let i = S.notes.length - 1; i >= 0; i--) {          // 后画的音优先（叠音时选到上面那个）
      const n = S.notes[i];
      if (x >= tToX(n[0]) - 2 && x <= tToX(n[0] + n[1]) + 2 && y >= mToY(n[2]) - 1 && y <= mToY(n[2] - 1)) return i;
    }
    return -1;
  }

  // ---------------------------------------------------------------- 卷帘：绘制
  function draw() {
    const cv = view.cv; if (!cv) return;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    drawGrid(g, cv);
    if (S.ex) drawFrames(g, cv);
    drawNotes(g, cv);
    drawCursor(g, cv);
  }

  function drawGrid(g, cv) {
    const rh = rowH();
    g.font = '10px monospace'; g.textBaseline = 'middle';
    for (let m = view.lo; m <= view.hi; m++) {
      const y = mToY(m);
      const black = [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
      g.fillStyle = black ? '#171320' : '#1d1828';
      g.fillRect(view.x0, y, plotW(), rh);
      if (m % 12 === 0) {                                     // C 线加粗，方便数八度
        g.strokeStyle = '#4a3a73'; g.beginPath();
        g.moveTo(view.x0, y + rh); g.lineTo(cv.width - view.padR, y + rh); g.stroke();
        g.fillStyle = '#c3b3e8'; g.fillText(nameOf(m), 8, y + rh / 2);
      } else if (((m % 12) + 12) % 12 === 0) {
        g.fillStyle = '#8a7ab0'; g.fillText('C' + (Math.floor(m / 12) - 1), 8, y + rh / 2);
      }
    }
    const sec = totalSec();
    const step = sec > 120 ? 10 : sec > 40 ? 5 : sec > 12 ? 2 : 1;
    g.fillStyle = '#6c5e90';
    for (let t = 0; t <= sec; t += step) {
      const x = tToX(t);
      g.strokeStyle = '#2a2140'; g.beginPath(); g.moveTo(x, view.y0); g.lineTo(x, cv.height - view.padB); g.stroke();
      g.fillText(t.toFixed(0) + 's', x + 3, cv.height - view.padB / 2);
    }
  }

  /** 背景画 rms 与逐帧音高轨迹：让人一眼看出"提取信不信得过" */
  function drawFrames(g, cv) {
    const fr = S.ex.frames; if (!fr.length) return;
    const maxRms = fr.reduce((s, f) => Math.max(s, f.rms), 1e-9);
    g.fillStyle = 'rgba(120,100,180,.18)';
    const rh = rowH(), bot = cv.height - view.padB;
    for (let i = 0; i < fr.length; i++) {
      const x = tToX(fr[i].t);
      const h = clamp(fr[i].rms / maxRms, 0, 1) * (bot - view.y0) * 0.5;
      g.fillRect(x, bot - h, Math.max(1, view.pps * (fr[i + 1] ? fr[i + 1].t - fr[i].t : 0.01)), h);
    }
    g.lineWidth = 1;
    for (let pass = 0; pass < 2; pass++) {
      g.strokeStyle = pass ? 'rgba(255,209,102,.55)' : 'rgba(120,220,160,.35)';
      g.beginPath(); let open = false;
      for (let i = 0; i < fr.length; i++) {
        const f = fr[i];
        if (f.voiced !== !!pass) { open = false; continue; }
        const x = tToX(f.t), y = mToY(f.midi) + rh / 2;
        if (open) g.lineTo(x, y); else { g.moveTo(x, y); open = true; }
      }
      g.stroke();
    }
    g.lineWidth = 1;
  }

  function drawNotes(g, cv) {
    const rh = rowH();
    S.notes.forEach((n, i) => {
      const x = tToX(n[0]), w = Math.max(4, n[1] * view.pps), y = mToY(n[2]), h = Math.max(3, rh - 1);
      const sel = i === S.sel;
      g.fillStyle = sel ? '#ffd166' : (n[3] != null && n[3] < 0.25 ? 'rgba(150,120,220,.55)' : '#9a78e6');
      g.fillRect(x, y, w, h);
      g.strokeStyle = '#0d0a16'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      g.fillStyle = '#241a38'; g.font = `${clamp(rh - 2, 8, 12)}px monospace`;
      const ch = S.chars[i];
      if (w > 12 && h > 8) g.fillText(ch == null ? '~' : ch, x + 2, y + h / 2 + 1);
      if (sel) { g.fillStyle = '#e8def7'; g.font = '11px monospace'; g.fillText(`${nameOf(n[2])}  ${n[1].toFixed(2)}s`, x, y - 7); }
    });
  }

  function drawCursor(g, cv) {
    if (!S.playing || S.cursor == null) return;
    const x = tToX(S.cursor);
    g.strokeStyle = '#ff6b6b'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, view.y0); g.lineTo(x, cv.height - view.padB); g.stroke();
    g.lineWidth = 1;
  }

  // ---------------------------------------------------------------- 卷帘：交互
  function attachCanvas(cv) {
    view.cv = cv;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; };

    cv.addEventListener('mousedown', e => {
      if (e.button === 2) return;
      const { x, y } = pos(e), i = hitTest(x, y);
      S.sel = i;
      if (i >= 0) {
        const n = S.notes[i];
        const onEdge = x > tToX(n[0] + n[1]) - Math.max(5, rowH() * 0.6);
        S.drag = { i, mode: onEdge ? 'dur' : 'move', m0: n[2], t0: n[0], d0: n[1], y0: y, x0: x, time: e.shiftKey };
      }
      draw(); e.preventDefault();
    });

    cv.addEventListener('mousemove', e => {
      const { x, y } = pos(e);
      if (!S.drag) { cv.style.cursor = hitTest(x, y) >= 0 ? 'move' : 'crosshair'; return; }
      const n = S.notes[S.drag.i]; if (!n) return;
      if (S.drag.mode === 'dur') {
        n[1] = clamp(xToT(x) - n[0] + 0.5 / view.pps, 0.05, 20);
      } else {
        if (e.altKey) n[2] = clamp(S.drag.m0 + Math.round((y - S.drag.y0) / rowH()), 24, 108);
        else n[2] = yToM(y);
        if (S.drag.time) n[0] = clamp(S.drag.t0 + xToT(x) - xToT(S.drag.x0), 0, totalSec());
      }
      draw();
    });

    const up = () => { S.drag = null; };
    cv.addEventListener('mouseup', up);
    cv.addEventListener('mouseleave', up);

    cv.addEventListener('dblclick', e => {
      const { x, y } = pos(e);
      if (hitTest(x, y) >= 0) return;
      const t = Math.max(0, xToT(x));
      const step = S.notes.length ? clamp(Math.min(...S.notes.map(n => n[1])), 0.12, 0.6) : 0.35;
      S.notes.push([+t.toFixed(3), step, yToM(y), 1]);
      S.notes.sort((a, b) => a[0] - b[0]);
      S.sel = S.notes.findIndex(n => n[0] === +t.toFixed(3));
      realign(); draw();
    });

    cv.addEventListener('contextmenu', e => {
      const { x, y } = pos(e), i = hitTest(x, y);
      if (i >= 0) { S.notes.splice(i, 1); S.sel = -1; realign(); draw(); }
      e.preventDefault();
    });

    cv.addEventListener('wheel', e => {
      view.pps = clamp(view.pps * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 4, 1200);   // 以左端为锚缩放，平移靠音域自适应
      e.preventDefault(); draw();
    }, { passive: false });

    cv.tabIndex = 0;
    cv.addEventListener('keydown', e => {
      const n = S.notes[S.sel];
      const big = e.shiftKey ? 12 : 1;
      if (n && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        n[2] = clamp(n[2] + (e.key === 'ArrowUp' ? big : -big), 24, 108); realign(); draw(); e.preventDefault();
      } else if (n && (e.key === 'Delete' || e.key === 'Backspace')) {
        S.notes.splice(S.sel, 1); S.sel = -1; realign(); draw(); e.preventDefault();
      } else if (n && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        n[0] = clamp(n[0] + (e.key === 'ArrowRight' ? 1 : -1) * (e.altKey ? 0.5 : 0.02), 0, totalSec()); realign(); draw(); e.preventDefault();
      }
    });
  }

  // ---------------------------------------------------------------- 报表辅助
  function coverageHint() {
    if (!auditReady()) return '未审计';
    const a = eng.getAudit(), r = eng.safeRange();
    const ms = S.notes.map(n => n[2]);
    if (!ms.length) return `安全音域 ${nameOf(r.lo)}–${nameOf(r.hi)}，当前无音符`;
    const out = ms.filter(m => m < r.lo || m > r.hi).length;
    return `安全音域 ${nameOf(r.lo)}–${nameOf(r.hi)}（${r.n} 个半音）；当前 ${ms.length} 音越界 ${out} 个` +
           (out ? ` → 建议移调 ${Melody.bestTranspose(S.notes, r.lo, r.hi, 24)}` : '');
  }

  return {
    S, view, opt, Melody, NAMES, nameOf,
    ensureAudio, ensureEngine, audit, auditReady, poolListFor, audioState, unlock, peakOf,
    loadFile, loadUrl, detect, realign, setLyric, transpose, autoTranspose, fitProf,
    sing, play, stop, busRender, encodeWav, saveWav,
    attachCanvas, draw, fitView, coverageHint,
    getEngine: () => eng
  };
}

global.SingStudio = { create, nameOf: (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1) };
})(typeof window !== 'undefined' ? window : globalThis);
