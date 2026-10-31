/**
 * Melody —— 从任意歌曲音频里抓主旋律，切成音符，再把歌词对齐到音符上。
 *
 * 为什么要它：原作 Celeste 根本没有「歌唱系统」（wow_so_secret 就是一条 Amadeus Pro
 * 导出的 192k 单声道 MP3 成品干声，直接挂在 event:/char/dialogue/secret_character 上），
 * 所以"让 Madeline 唱任何歌"这套系统必须自己造。造出来分两段：
 *   1) 歌 → 旋律音符（本文件 extract / segment）
 *   2) 音符 + 歌词 → 逐音字位（本文件 align）
 * 合成交给 js/sing-v5.js（TD-PSOLA / LPC），页面接线交给 js/sing-studio.js。
 *
 * 提取思路（不引 wasm/ONNX，纯 JS 可读可审，详见 extract 函数头）：
 *   - 分析前 2 节 100Hz 高通，先把贝斯/底鼓基频剥掉；
 *   - 候选分 = log 域谐波加权和 × 奇次支撑因子（破低八度）× 谐波根数因子（破正弦干扰）；
 *   - 全局 Viterbi（L1 距离变换，每帧 O(候选数)）同时做轨迹、八度一致性与 V/UV；
 *   - 分段：无声持续几帧断句，音高漂移要连续几帧才切（不被颤音误切），
 *     长音撞上起音点且能量下沉才再切一刀（同音高重复唱两个字只能靠这个分开）。
 * 精度（验收脚本 .screenshots/.tmp/melo_test.js）：wow 干声 39/44 配对、11 多余，
 * 配对音高中位误差 0.00 半音、零八度错；浏览器端 22.05k 降采样下 37/44（同一真值）；
 * 合成旋律掺纯音贝斯/噪鼓仍 10~11/11。align 的回归（含“乐句多于音节”这个曾死循环的坑）
 * 在 .screenshots/.tmp/align_test.js，整条链的浏览器端到端在 .screenshots/.tmp/e2e_run.js。
 * 全部阈值集中在 DEFAULTS，页面上可调，方便对着一首难歌现场抠。
 */
(function (global) {
  'use strict';

  const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
  const f2m = f => 69 + 12 * Math.log2(f / 440);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

  const DEFAULTS = {
    fLo: 65,             // Hz，候选下限（含低八度搜索空间）
    fHi: 1150,           // Hz，候选上限
    hopMs: 11.6,         // 帧移，约 44.1k/2048 下的一格
    winMs: 46,           // 窗长
    gridStep: 1 / 3,     // 候选音高网格（半音）
    harmonics: 8,        // 谐波求和累加到第几根
    highPass: 100,       // Hz，测频前先削掉贝斯/底鼓的基频
    lamPerSemis: 0.2,    // Viterbi 连续性代价：每偏一个半音交多少
    switchCost: 1.2,     // 有声↔无声每切换一次交多少
    unvoiceCost: 6,      // 帧内音高越清晰，强行判无声越贵（乘上 prom）
    gainFloor: 0.8,      // 帧内音高越含糊，连最优候选也要交的押金
    silRmsFrac: 0.02,    // rms 低于全局峰值 rms 的这个比例视为静音
    minProminence: 0.2,  // 帧内对比度参考下限（报表用，硬判定交给 Viterbi）
    minNoteSec: 0.085,   // 短于此的音符并进前一音符或丢掉
    splitCents: 150,     // 音高持续漂移超这个数（音分）切新音符
    splitHold: 4,        // 漂移要连续几帧才算"换音"，防颤音误切
    silSplitFrames: 2,   // 连续无声达几帧就断句（1 帧闪烁当滑音吞掉）
    onsetRatio: 1.6,     // spectral flux 超滑动中位 × 该倍数视作起音
    longNoteMs: 300,     // 长音内部才允许被起音点再切一刀
    onsetDip: 0.75,      // 起音点处 rms 要低于本音符中位 rms 的这个比例才切
    tailPad: 0.06        // 音符时长补偿（PSOLA 头音需要一点余量）
  };

  // ---------------------------------------------------------------- FFT（radix-2，就地）
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; const u = im[i]; im[i] = im[j]; im[j] = u; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ur = re[i + k], ui = im[i + k], q = i + k + len / 2;
          const vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
          re[i + k] = ur + vr; im[i + k] = ui + vi;
          re[q] = ur - vr; im[q] = ui - vi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  /** 单声道化 + 按需降采样（44.1k 足够抓旋律，48k 素材先降下来能省一半算力） */
  function toMono(buf, targetSr) {
    const src = buf.numberOfChannels > 1
      ? (() => { const a = buf.getChannelData(0), b = buf.getChannelData(1), o = new Float32Array(a.length);
                 for (let i = 0; i < a.length; i++) o[i] = (a[i] + b[i]) * 0.5; return o; })()
      : buf.getChannelData(0);
    const sr = buf.sampleRate;
    if (!targetSr || targetSr >= sr) return { d: src.slice(), sr };
    const ratio = sr / targetSr, n = Math.floor(src.length / ratio), o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * ratio, i0 = Math.floor(p), fr = p - i0;
      o[i] = i0 + 1 < src.length ? src[i0] * (1 - fr) + src[i0 + 1] * fr : src[i0];
    }
    return { d: o, sr: targetSr };
  }

  // ---------------------------------------------------------------- 帧级测频
  /** RBJ 二阶高通（级联 order 节）：测频前先把贝斯/底鼓的基频削掉 */
  function highpass(src, sr, f0, q, order) {
    const out = Float32Array.from(src);
    const w0 = 2 * Math.PI * clamp(f0, 20, sr / 6) / sr, cw = Math.cos(w0), sw = Math.sin(w0), al = sw / (2 * q);
    const b0 = (1 + cw) / 2, b1 = -(1 + cw), b2 = b0, a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
    for (let s = 0; s < order; s++) {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < out.length; i++) {
        const x0 = out[i];
        const y = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x0; y2 = y1; y1 = y;
        out[i] = y;
      }
    }
    return out;
  }

  /**
   * 主提取：逐帧 { t, midi, conf, rms, voiced }。
   * 三道防线（朴素谐波求和会被贝斯和低八度抢走旋律，这里逐条堵死）：
   *   1) 分析前 2 节 highPass Hz 高通；
   *   2) 候选分 = log 域谐波加权和 × 奇次支撑因子 × 谐波根数因子：
   *      真 f0 的谐波栈奇次偶次都有；被当成低八度时能量几乎只落在偶次上（奇次空）；
   *      正弦型干扰（贝斯）只有 1~2 根"谐波"，靠根数因子压掉；
   *   3) Viterbi 全局轨迹（用 L1 距离变换实现，每帧 O(候选数)，4 分钟歌也是秒级）：
   *      逐半音连续性代价 + 帧内清晰度同时决定"判无声贵不贵"和"候选要不要交押金"，
   *      八度跳变、孤立毛刺、辅音处的短暂无声一次处理干净。
   * 阈值是在两块真值上扫出来的：wow_so_secret.wav 对 WOW_NOTES（人声干声），
   * 以及合成旋律对已知序列（分别加纯音贝斯 / 加噪鼓 检验抗干扰）。
   */
  function extract(d, sr, opt) {
    const O = Object.assign({}, DEFAULTS, opt || {});
    const N = nextPow2(Math.round(sr * O.winMs / 1000));
    const H = Math.max(32, Math.round(sr * O.hopMs / 1000));
    const half = N >> 1, binHz = sr / N;
    const x = O.highPass > 0 ? highpass(d, sr, O.highPass, 0.71, 2) : d;
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));

    const mLo = f2m(O.fLo), step = O.gridStep;
    const nc = Math.max(8, Math.floor((f2m(O.fHi) - mLo) / step) + 1);
    const lamStep = O.lamPerSemis * step, minSep = Math.max(1, Math.round(1.2 / step));
    const K = O.harmonics, wts = new Float64Array(K + 1);
    for (let k = 1; k <= K; k++) wts[k] = 1 / k;
    const bLo = Math.max(1, Math.round(100 / binHz)), bHi = Math.min(half, Math.round(4000 / binHz));

    const nF = Math.max(0, Math.floor((x.length - N) / H) + 1);
    const rmsArr = new Float32Array(nF);
    let maxRms = 1e-9;
    for (let i = 0; i < nF; i++) {
      const c = i * H; let e = 0;
      for (let j = 0; j < N; j++) { const v = x[c + j]; e += v * v; }
      const r = Math.sqrt(e / N);
      rmsArr[i] = r; if (r > maxRms) maxRms = r;
    }

    const re = new Float64Array(N), im = new Float64Array(N);
    const mag = new Float64Array(half + 1), lg = new Float64Array(half + 1);
    const fq = new Float32Array(half + 1);
    const scores = new Float64Array(nc), emit = new Float64Array(nc);
    const dpPrev = new Float64Array(nc), dpCur = new Float64Array(nc);
    const trL = new Float64Array(nc), argL = new Int16Array(nc);
    const bpBuf = new Int16Array(nc), srcs = new Int16Array(nc * nF);
    const promArr = new Float32Array(nF), euArr = new Float32Array(nF);
    const uFromV = new Uint8Array(nF), bestVIdx = new Int16Array(nF);
    const flux = new Float32Array(nF);
    let dpU = 0, hasPrev = false;

    for (let i = 0; i < nF; i++) {
      const c0 = i * H;
      for (let j = 0; j < N; j++) { re[j] = x[c0 + j] * win[j]; im[j] = 0; }
      fft(re, im);
      let mMax = 1e-9, band = 0;
      for (let k = 0; k <= half; k++) mag[k] = Math.hypot(re[k], im[k]);
      for (let k = bLo; k <= bHi; k++) { if (mag[k] > mMax) mMax = mag[k]; band += mag[k]; }
      band = band / (bHi - bLo + 1) + 1e-9;
      const invMax = 1 / (0.05 * mMax);
      for (let k = 0; k <= half; k++) lg[k] = Math.log(1 + mag[k] / band);

      // ---- 候选打分
      let mx = -1e18, argMax = 0, comp = -1e18;
      for (let ci = 0; ci < nc; ci++) {
        const f = m2f(mLo + ci * step);
        let s = 0, wacc = 0, oddE = 0, evenE = 0, cnt = 0;
        for (let k = 1; k <= K; k++) {
          const b = Math.round(f * k / binHz);
          if (b > bHi) break;
          const w = wts[k], a = lg[b];
          s += w * a; wacc += w;
          if (k & 1) oddE += w * a; else evenE += w * a;
          if (mag[b] * invMax >= 1) cnt++;
        }
        // 除"实际参与求和的权"而不是总权：高音只数得到 2~3 根谐波，不能被系统性压低
        s /= Math.max(wacc, wts[1]);
        // 奇次支撑：判成低八度时奇次位置全空
        const share = oddE / (oddE + evenE + 1e-12);
        s *= 0.25 + 0.75 * clamp((share - 0.20) / 0.22, 0, 1);
        // 谐波根数：正弦型干扰只有 1~2 根
        s *= 0.20 + 0.80 * clamp((cnt - 2) / 2, 0, 1);
        scores[ci] = s;
        if (s > mx) { mx = s; argMax = ci; }
      }
      for (let ci = 0; ci < nc; ci++) {
        if (Math.abs(ci - argMax) < minSep) continue;
        if (scores[ci] > comp) comp = scores[ci];
      }
      const prom = mx > 0 ? clamp((mx - comp) / mx, 0, 1) : 0;
      promArr[i] = prom;
      const silence = rmsArr[i] < maxRms * O.silRmsFrac;
      const eu = silence ? 0.02 : O.unvoiceCost * prom + 0.1;
      euArr[i] = eu;
      const anchor = silence ? 8 : O.gainFloor * (1 - prom);
      const logMx = Math.log(Math.max(mx, 1e-9));
      for (let ci = 0; ci < nc; ci++) emit[ci] = logMx - Math.log(Math.max(scores[ci], 1e-9)) + anchor;

      // ---- spectral flux（正增量和）留给分段找起音
      if (i > 0) {
        let fx = 0;
        for (let k = 1; k <= half; k++) { const dd = mag[k] - fq[k]; if (dd > 0) fx += dd; }
        flux[i] = fx;
      }
      for (let k = 1; k <= half; k++) fq[k] = mag[k];   // fq = 上一帧幅度谱

      // ---- DP 一步：V 态之间是 L1 距离变换（O(nc)），外加从 U 态自由切入
      const base = i * nc;
      if (!hasPrev) {
        for (let ci = 0; ci < nc; ci++) { dpCur[ci] = emit[ci]; bpBuf[ci] = -2; }
        dpU = eu;
        hasPrev = true;
      } else {
        let bestL = 1e18, aL = 0;
        for (let ci = 0; ci < nc; ci++) {
          const v = dpPrev[ci] - lamStep * ci;
          if (v < bestL) { bestL = v; aL = ci; }
          trL[ci] = bestL + lamStep * ci; argL[ci] = aL;
        }
        let bestR = 1e18, aR = 0;
        for (let ci = nc - 1; ci >= 0; ci--) {
          const v = dpPrev[ci] + lamStep * ci;
          if (v < bestR) { bestR = v; aR = ci; }
          const rc = bestR - lamStep * ci;
          if (rc < trL[ci]) { trL[ci] = rc; argL[ci] = aR; }
        }
        const fromU = dpU + O.switchCost;
        let minV = 1e18, argV = 0;
        for (let ci = 0; ci < nc; ci++) {
          let val, arg;
          if (fromU < trL[ci]) { val = fromU; arg = -1; } else { val = trL[ci]; arg = argL[ci]; }
          val += emit[ci];
          dpCur[ci] = val; bpBuf[ci] = arg;
          if (val < minV) { minV = val; argV = ci; }
        }
        // 归一防浮点漂移（dpV 与 dpU 减同一个数，不影响末帧判定）
        const norm = minV < dpU ? minV : dpU;
        for (let ci = 0; ci < nc; ci++) dpCur[ci] -= norm;
        const stayU = dpU, leaveV = minV + O.switchCost;
        dpU = Math.min(stayU, leaveV) + eu - norm;
        uFromV[i] = leaveV < stayU ? 1 : 0;
        bestVIdx[i] = argV;
      }
      srcs.set(bpBuf, base);
      dpPrev.set(dpCur);
    }

    // ---- 回溯
    const pathIdx = new Int32Array(nF), pathU = new Uint8Array(nF);
    if (nF) {
      let bestC = 0, bestV = 1e18;
      for (let ci = 0; ci < nc; ci++) if (dpPrev[ci] < bestV) { bestV = dpPrev[ci]; bestC = ci; }
      let st = bestV <= dpU ? 0 : 1, idx = bestC;
      for (let i = nF - 1; i >= 0; i--) {
        pathU[i] = st; pathIdx[i] = st ? -1 : idx;
        if (i === 0) break;
        if (st) {
          // U 态前驱：按 DP 里实际赢的那一支回退（从 V 退出时回到上一帧最优 V 音高）
          if (uFromV[i]) { st = 0; idx = bestVIdx[i - 1]; } else { st = 1; }
        } else {
          const a = srcs[i * nc + idx];
          if (a === -1) st = 1;
          else if (a === -2) st = 0;
          else { idx = a; st = 0; }
        }
      }
    }

    const frames = new Array(nF);
    for (let i = 0; i < nF; i++) {
      const midi = pathU[i] ? 69 : mLo + pathIdx[i] * step;
      frames[i] = { t: i * H / sr, midi, conf: promArr[i], rms: rmsArr[i], voiced: !pathU[i], raw: midi };
    }
    return { frames, flux, hop: H, sr, N, opts: O, prom: promArr, eu: euArr };
  }

  // ---------------------------------------------------------------- 音符分段
  /** spectral flux 的自适应起音检测：局部窗中位 × ratio，且要是局部峰 */
  function onsetFlags(frames, flux, O) {
    const n = frames.length;
    const out = new Array(n).fill(false);
    if (!n) return out;
    const W = Math.max(4, Math.round(0.29 / (O.hopMs / 1000)));
    const f = flux.length === n ? flux : new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const lo = Math.max(0, k - W), hi = Math.min(n, k + W + 1);
      const win = Array.prototype.slice.call(f.slice(lo, hi)).sort((a, b) => a - b);
      const med = win[win.length >> 1] || 0;
      const peak = f[k] > (f[k - 1] || 0) && f[k] >= (f[k + 1] || 0);
      if (peak && f[k] > med * O.onsetRatio && f[k] > 1e-6) out[k] = true;
    }
    return out;
  }

  /**
   * 帧序列 → 音符 [[t, dur, midi, conf]]。
   * 三条切分规则，按"宁可少切、事后在钢琴卷帘上补"的取向排：
   *   A) 连续无声达 silSplitFrames 帧 → 断句（辅音塞音/换气天然是分界）；
   *   B) 漂移要连续 splitHold 帧超 splitCents 才切 → 颤音（±25 音分）不会误切；
   *   C) 长音内部撞上起音点、且起音前有幅度下沉 → 切（同音高重复唱两个字只能靠这个分开）。
   */
  function segment(ex, opt) {
    const O = Object.assign({}, ex.opts || DEFAULTS, opt || {});
    const { frames, flux, hop, sr } = ex;
    if (!frames.length) return [];
    const onsets = onsetFlags(frames, flux, O);
    const notes = [];
    let cur = null, silRun = 0;
    const medOf = (arr) => { const s = arr.slice().sort((a, b) => a - b); return s[s.length >> 1]; };
    const finish = (endK) => {
      if (!cur) return;
      const t0 = frames[cur.a].t;
      const t1 = frames[Math.min(frames.length - 1, endK)].t + hop / sr;
      const dur = t1 - t0;
      if (dur >= O.minNoteSec && cur.ms.length) {
        notes.push([+t0.toFixed(3), +(dur + O.tailPad).toFixed(3),
                   Math.round(medOf(cur.ms)), +(cur.conf.reduce((s, x) => s + x, 0) / cur.conf.length).toFixed(2)]);
      } else if (notes.length && cur.ms.length) {
        notes[notes.length - 1][1] = +(t1 - notes[notes.length - 1][0]).toFixed(3);   // 碎片并回前一个音
      }
      cur = null;
    };
    const start = (k) => { cur = { a: k, ms: [frames[k].midi], conf: [frames[k].conf], hold: 0, rmsMed: frames[k].rms }; silRun = 0; };

    for (let k = 0; k < frames.length; k++) {
      const fr = frames[k];
      if (!fr.voiced) {
        silRun++;
        if (cur && silRun >= O.silSplitFrames) finish(k - 1);
        continue;
      }
      if (!cur) { start(k); continue; }
      silRun = 0;
      const elapsed = (k - cur.a) * hop / sr;
      const med = medOf(cur.ms.length > 24 ? cur.ms.slice(-24) : cur.ms);
      const dev = Math.abs(1200 * (fr.midi - med));
      let cut = false;
      if (dev > O.splitCents) { cur.hold++; if (cur.hold >= O.splitHold) cut = true; }
      else cur.hold = 0;
      if (!cut && onsets[k] && elapsed * 1000 > O.longNoteMs) {
        // 起音点处要有能量下沉才是"又唱了一个字"，否则只是同一个音的抖动
        let dip = fr.rms, n2 = 0;
        for (let j = Math.max(cur.a, k - 3); j <= Math.min(frames.length - 1, k + 1); j++) {
          dip = Math.min(dip, frames[j].rms); n2++;
        }
        if (n2 && dip < cur.rmsMed * O.onsetDip && elapsed > O.minNoteSec) cut = true;
      }
      if (cut) { finish(k - 1); start(k); }
      else {
        cur.ms.push(fr.midi); cur.conf.push(fr.conf);
        cur.rmsMed = cur.rmsMed * 0.8 + fr.rms * 0.2;
      }
    }
    finish(frames.length - 1);
    return notes;
  }
  // ---------------------------------------------------------------- 歌词切音节
  const ZH = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  const KANA = /[\u3040-\u30ff\uff66-\uff9f]/;
  const PUNCT = /[。！？!?…，,、；;：:（）()《》\-\s\r\n\t／|·—~～"'‘’“”]/;

  /** 英文单词按元音组粗略切音节（够用：不引词典），缩写尾部的 'e 不单独成节 */
  function splitEnglish(word) {
    const w = word.toLowerCase().replace(/[^a-z']/g, '');
    if (!w) return [];
    const syl = [];
    let cur = '';
    const vow = 'aeiouy';
    let prevV = false;
    for (let i = 0; i < w.length; i++) {
      const ch = w[i], isV = vow.includes(ch);
      cur += ch;
      if (isV && !prevV) { /* 音节核开始 */ }
      if (isV) {
        // 向后看：若下一个是辅音且再后面还有元音，则此处收尾（V-CV → V|CV）
        const nextC = /[bcdfghjklmnpqrstvwxz]/.test(w[i + 1] || '');
        const after = /[aeiouy]/.test(w[i + 2] || '');
        if (nextC && after && i + 1 < w.length) { syl.push(cur); cur = ''; }
        else if (!nextC) { syl.push(cur); cur = ''; }
      }
      prevV = isV;
    }
    if (cur) {
      if (syl.length) syl[syl.length - 1] += cur; else syl.push(cur);
    }
    // 末尾静音 e 合并（"give" → giv|e 不该两节）
    if (syl.length > 1 && /^e$/.test(syl[syl.length - 1])) syl[syl.length - 2] += 'e', syl.pop();
    return syl.length ? syl : [word];
  }

  /** 歌词 → 音节数组，附带短语边界标记（换行/句号 = 呼吸位） */
  function syllables(text) {
    const out = [];
    let phrase = 0;
    for (const ch of text) {
      if (PUNCT.test(ch)) {
        if (/[。！？…\n]/.test(ch) && out.length) phrase++;
        continue;
      }
      if (ch === ' ' || ch === '\t') continue;
      if (ZH.test(ch) || KANA.test(ch)) { out.push({ ch, phrase }); continue; }
      if (/[a-zA-Z']/.test(ch)) { out.push({ ch, phrase, wordTail: true }); continue; }
      if (/[0-9]/.test(ch)) out.push({ ch, phrase });
    }
    // 把连续 wordTail 合成词再切音节
    const merged = [];
    for (let i = 0; i < out.length; i++) {
      if (!out[i].wordTail) { merged.push(out[i]); continue; }
      let w = '';
      while (i < out.length && out[i].wordTail) { w += out[i].ch; i++; }
      i--;
      const ph = out[i].phrase;
      for (const s of splitEnglish(w)) merged.push({ ch: s, phrase: ph });
    }
    return merged;
  }

  // ---------------------------------------------------------------- 音符 ↔ 音节对齐
  /**
   * notes: [[t,dur,midi,conf]]，text: 歌词。
   * 返回 { notes: [[t,dur,midi]], chars: [音节|null] }，两数组等长——
   * 直接喂给 sing-v5 的 plan(notes, chars, strategy)。
   *
   * 三种情况：
   *   音节数 == 音符数      → 一字一音
   *   音符多于音节（转音）   → 多出来的音挂在"前一个音节"上做 melisma
   *   音节多于音符（快嘴）   → 把长音按音节数等分，字头落在子音上
   * 音符置信度低的（conf 很小）优先当 melisma 尾巴吃掉，不当字头。
   */
  function align(notes, text, opt) {
    const O = Object.assign({}, DEFAULTS, opt || {});
    const syl = syllables(text).filter(s => s.ch);
    const ns = notes.map(n => ({ t: n[0], dur: n[1], midi: n[2], conf: n[3] == null ? 0.5 : n[3], phrase: n[4] || 0 }));
    if (!ns.length) return { notes: [], chars: [] };
    if (!syl.length) {
      // 没歌词就全唱“啊”：只在乐句头（onset 间隔 >0.32s，等同一次换气）排字，
      // 其余音留 null 当转音尾巴——一律排字会让引擎每个字重起一次音，听感就是一顿一顿
      let prevT2 = null;
      return {
        notes: ns.map(n => [n.t, n.dur, n.midi]),
        chars: ns.map(n => { const head = prevT2 === null || n.t - prevT2 > 0.32; prevT2 = n.t; return head ? '啊' : null; })
      };
    }

    // 短语编号：音符按 onset 间隔 >0.32s 断句，跟歌词的句号呼吸位对齐用
    let ph = 0, prevT = null;
    for (const n of ns) { if (prevT !== null && n.t - prevT > 0.32) ph++; prevT = n.t; n.phrase = ph; }
    const nPh = ph + 1, sPh = syl[syl.length - 1].phrase + 1;
    // 歌词呼吸位按短语比例映射到音符短语（词少句多/句少词多都能摊平）
    if (sPh > 1 && nPh > 1) for (const n of ns) n.phrase = Math.min(nPh - 1, Math.round(n.phrase / (nPh - 1) * (sPh - 1)));

    const slots = [];   // { note, syl|null }
    if (syl.length === ns.length) {
      ns.forEach((n, k) => slots.push({ n, s: syl[k] }));
    } else if (ns.length > syl.length) {
      // 先给每个音节占一个"字头"音，剩下多出的音摊给前一个音节当转音尾巴
      // 按短语把音节数分配下去（每个短语至少 1 个音节，若短语数 > 音节数则退化顺序分）
      const perPhrase = {};
      ns.forEach((n, k) => { (perPhrase[n.phrase] = perPhrase[n.phrase] || []).push(k); });
      const phrases = Object.keys(perPhrase).map(Number).sort((a, b) => a - b);
      // 每短语份额 ∝ 该短语总时长，且不得超该短语的音符数（下标 1 —— 没字的短语也得占一个字头）
      const totLen = ns.reduce((s, n) => s + n.dur, 0) || 1;
      const cap = phrases.map(p => perPhrase[p].length);
      const shares = phrases.map((p, j) => clamp(Math.round(syl.length * perPhrase[p].reduce((s, k) => s + ns[k].dur, 0) / totLen), 1, cap[j]));
      let sdiff = syl.length - shares.reduce((a, b) => a + b, 0);
      // 只能在有得动的短语上调；全饱和就收手（原来这里会死循环）
      for (let guard = 0; sdiff !== 0 && guard < 4096; guard++) {
        let moved = false;
        for (let j = 0; j < shares.length && sdiff !== 0; j++) {
          if (sdiff > 0 && shares[j] < cap[j]) { shares[j]++; sdiff--; moved = true; }
          else if (sdiff < 0 && shares[j] > 1) { shares[j]--; sdiff++; moved = true; }
        }
        if (!moved) break;
      }
      let sp = 0;
      phrases.forEach((p, pi) => {
        const idx = perPhrase[p];
        const q = Math.max(1, shares[pi]);
        // 短语内挑字头：优先"音高发生变化的第一个音"和长音，数量 = q（不足则有音就占）
        const take = Math.min(q, idx.length);
        const scored = idx.map((k, ii) => {
          const prev = ii > 0 ? ns[idx[ii - 1]].midi : null;
          const changeBonus = prev !== null && ns[k].midi !== prev ? 1.4 : 1;
          const headBonus = ii === 0 ? 1.8 : 1;
          return { k, v: ns[k].dur * changeBonus * headBonus * (0.6 + 0.8 * clamp(ns[k].conf, 0, 1)) };
        }).sort((a, b) => b.v - a.v).slice(0, take).map(o => o.k).sort((a, b) => a - b);
        const headSet = new Set(scored);
        const list = [...headSet].sort((a, b) => a - b);
        list.forEach(k => { if (sp < syl.length) slots.push({ n: ns[k], s: syl[sp++] }); });
      });
      // 剩下的音按顺序挂到最近的前一个字（melisma），开头就剩的多出来则并到第一个字
      const ordered = [];
      let last = slots.length ? slots[0].s : syl[0];
      for (const n of ns) {
        const hit = slots.find(o => o.n === n);
        if (hit) { ordered.push(hit); last = hit.s; }
        else { ordered.push({ n, s: last, melisma: true }); }
      }
      // 短语音太少装不下全部字头时，剩下的字拆到最后一个音里，保证歌词不丢字
      if (sp < syl.length && ordered.length) {
        const rest = syl.slice(sp);
        const base = ordered[ordered.length - 1].n, sub = base.dur / (rest.length + 1);
        ordered[ordered.length - 1].n = { ...base, dur: sub };
        rest.forEach((s, k) => ordered.push({ n: { ...base, t: base.t + sub * (k + 1), dur: sub }, s }));
        sp = syl.length;
      }
      slots.length = 0; slots.push(...ordered);
    } else {
      // 音节多于音符：按音符时长把音节塞进去，长音等分成多个子音槽
      let si = 0;
      const totalDur = ns.reduce((s, n) => s + n.dur, 0) || 1;
      ns.forEach(n => {
        const want = clamp(Math.round(syl.length * n.dur / totalDur), 1, syl.length - si);
        for (let j = 0; j < want && si < syl.length; j++) {
          const sub = n.dur / want;
          slots.push({ n: { ...n, t: n.t + j * sub, dur: sub }, s: syl[si++] });
        }
      });
      while (si < syl.length && slots.length) {   // 兜底：剩余音节挂在最后一个音后面
        const base = ns[ns.length - 1];
        slots.push({ n: { ...base, t: base.t + base.dur * 0.5, dur: base.dur * 0.5 }, s: syl[si++] });
      }
    }
    slots.sort((a, b) => a.n.t - b.n.t);
    // 去叠：后一个字头不得早于前一个的起点
    for (let k = 1; k < slots.length; k++) {
      if (slots[k].n.t <= slots[k - 1].n.t) { slots[k].n.t = slots[k - 1].n.t + Math.min(0.05, slots[k].n.dur * 0.5); }
    }
    return { notes: slots.map(o => [o.n.t, o.n.dur, o.n.midi]), chars: slots.map(o => (o.melisma ? null : o.s.ch)), sylCount: syl.length, noteCount: ns.length };
  }

  // ---------------------------------------------------------------- 整体移调
  /**
   * 找到最佳移调（半音），让旋律落进 blip 库存能唱的音域。
   * safeLo/safeHi = 引擎覆盖表里 inSafe 的 MIDI 边界（由调用方算好传进来）。
   * 目标：越界音数最少，其次总偏移代价最小（不为了几个音把整首歌挪到极端音区）。
   */
  function bestTranspose(notes, safeLo, safeHi, allow) {
    const mid = (safeLo + safeHi) / 2, A = allow == null ? 12 : allow;
    let best = 0, bestCost = Infinity;
    for (let k = -A; k <= A; k++) {
      let out = 0, dist = 0;
      for (const n of notes) {
        const m = (n[2] != null ? n[2] : n[0]) + k;   // 兼容 [t,dur,midi] 与裸 midi 数组
        if (m < safeLo || m > safeHi) { out++; dist += m < safeLo ? safeLo - m : m - safeHi; }
        else dist += Math.abs(m - mid) * 0.05;
      }
      const cost = out * 100 + dist;
      if (cost < bestCost - 1e-9) { bestCost = cost; best = k; }
    }
    return best;
  }

  const api = { DEFAULTS, extract, segment, syllables, align, bestTranspose, toMono, m2f, f2m };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Melody = api;
})(typeof window !== 'undefined' ? window : globalThis);
