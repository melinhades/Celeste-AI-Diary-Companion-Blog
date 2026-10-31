/* ===== Sing v5 —— Madeline 歌声迭代（深度版，不扩功能面） =====
 *
 * 对应 .trae/specs/madeline-sing/iteration.md v4 之后的五条深入要求：
 *  第零部分 库存审计：angry + determined 双池 SHA-256 去重；逐文件 f0 / V-UV /
 *           HNR / 稳态长度 / pitch-mark 双标一致性；跨池音域覆盖图与选声表；
 *           MFCC 音色距离决定跨池规则（句中混拼禁令）。
 *  第一部分 合成链路：
 *   - psolaV5：在 v4 TD-PSOLA 上加 V/UV 分流（非浊音只做时长 OLA，不移调）、
 *     峰值 mark 与过零 mark 双标校验（mismatch 超阈值单元拉黑）、
 *     8ms 基频同步交叉淡化（替代 15ms 硬截断，拼接 click 自动计数）。
 *   - lpcV5：源-滤波器链路（LPC/Levinson 求谱包络，激励源在目标 f0 重建，
 *     共振峰与 f0 完全解耦），与 PSOLA 在同一测试集头对头对照。
 *  第二部分 表情模型：从 wow_so_secret.wav 真唱逐音拟合 scoop/overshoot/颤音分布，
 *           替换 v4 的 1.5 半音/45ms、5.8~6.5Hz/18~32 音分硬编码。
 *  第三部分 外部裁判：cepstral（倒谱）独立测频（合成用 YIN，验收禁用 YIN），
 *           音分 RMSE ≤ 50、>200 粗错率、V/UV 误判率、rate=1 恒等 null 残差、
 *           拼接 click 数、F1/F2 漂移；wow 真唱为物理真值。
 *
 * 纯浏览器、零外部依赖（不用 wasm WORLD/ONNX，所有算法本文件可读可审）。
 * 暴露 window.SingV5（无 window 时挂 globalThis，Node 侧可 require 做离线验收）。
 *
 * v5.1 为「唱任意歌」加的口子（不改任何既有算法）：
 *   - create(ctx, {pools, perGroup}) 可选情绪池清单，缺省仍是 angry+determined 双池；
 *   - plan(notes, text, strategy, chars) 多一个 chars 形参：Melody.align 产出的逐音字位
 *     数组（null = 转音尾巴不重新起字），绕开 textToUnits 的 44 字上限；
 *   - strategy 可以是任意池名 / 'cross' / 'auto'（按乐句音域自动挑覆盖最好的池）。
 */
(function (global) {
'use strict';

// ---------------------------------------------------------------- 通用工具
const m2f = m => 440 * Math.pow(2, (m - 69) / 12);
const f2m = f => 69 + 12 * Math.log2(f / 440);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const median = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[clamp(Math.round(p * (s.length - 1)), 0, s.length - 1)]; };
function corrCoeff(x, y) {
  const n = Math.min(x.length, y.length), mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return dx * dy > 0 ? num / Math.sqrt(dx * dy) : 0;
}
async function sha256(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function mapLimit(arr, lim, fn) {
  const out = new Array(arr.length); let i = 0;
  const workers = Array.from({ length: Math.min(lim, arr.length) }, async () => {
    while (i < arr.length) { const k = i++; out[k] = await fn(arr[k], k); }
  });
  await Promise.all(workers); return out;
}

// ---------------------------------------------------------------- FFT（radix-2）
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
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
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
function nextPow2(n) { return 1 << Math.ceil(Math.log2(n)); }

// ---------------------------------------------------------------- YIN（合成侧测频，沿用 v4 已验证实现）
function yinFrame(d, i0, frame, lo, hi, sr) {
  const span = frame - hi;
  const cmnd = new Float32Array(hi + 1);
  let run = 0;
  for (let tau = 1; tau <= hi; tau++) {
    let s = 0;
    for (let j = 0; j < span; j += 2) { const x = d[i0 + j] - d[i0 + j + tau]; s += x * x; }
    run += s;
    if (tau >= lo) cmnd[tau] = s * tau / run;
  }
  let tau = lo;
  while (tau < hi && cmnd[tau] >= 0.15) tau++;
  let t = lo, best = 1;
  for (let x = lo; x <= hi; x++) if (cmnd[x] < best) { best = cmnd[x]; t = x; }
  if (tau < hi) { t = tau; while (t < hi && cmnd[t + 1] < cmnd[t]) t++; }
  if (t > lo && t < hi) {
    const a = cmnd[t - 1], b = cmnd[t], c = cmnd[t + 1], den = a - 2 * b + c;
    if (Math.abs(den) > 1e-9) {
      const shift = clamp((a - c) / (2 * den), -0.5, 0.5);
      return { f0: sr / (t + shift), cmnd: b };
    }
  }
  return { f0: sr / t, cmnd: best };
}

// ---------------------------------------------------------------- 倒谱测频（独立验收裁判，禁止与 YIN 同源）
// 实倒谱：IFFT(log|FFT|)；quefrency 峰 = 基频周期。z-score 峰 prominence 判浊音。
function cepsPitch(d, i0, N, sr, expF) {
  const M = nextPow2(N);
  const re = new Float64Array(M), im = new Float64Array(M);
  for (let i = 0; i < N; i++) re[i] = d[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  fft(re, im, false);
  for (let i = 0; i < M; i++) { const mag = Math.hypot(re[i], im[i]) + 1e-8; re[i] = Math.log(mag); im[i] = 0; }
  fft(re, im, true);
  const fLo = expF ? expF * Math.pow(2, -5 / 12) : 120, fHi = expF ? expF * Math.pow(2, 5 / 12) : 700;
  const qLo = Math.max(2, Math.floor(sr / fHi)), qHi = Math.min(M >> 1, Math.ceil(sr / fLo));
  let q = qLo, best = -1e9;
  const vals = [];
  for (let t = qLo; t <= qHi; t++) { vals.push(re[t]); if (re[t] > best) { best = re[t]; q = t; } }
  const mv = mean(vals), sd = Math.sqrt(mean(vals.map(v => (v - mv) ** 2))) + 1e-12;
  const z = (best - mv) / sd;
  let f0 = sr / q;
  if (q > qLo && q < qHi) {
    const a = re[q - 1], b = re[q], c = re[q + 1], den = a - 2 * b + c;
    if (Math.abs(den) > 1e-12) f0 = sr / (q + clamp((a - c) / (2 * den), -0.5, 0.5));
  }
  return { f0, voiced: z > 3.0, z };
}

// ---------------------------------------------------------------- LPC（Levinson-Durbin）
function levinson(r, p) {
  const a = new Float64Array(p + 1); a[0] = 1;
  let e = r[0];
  for (let i = 1; i <= p; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
    const k = -acc / (e + 1e-12);
    const na = a.slice();
    for (let j = 1; j < i; j++) na[j] = a[j] + k * a[i - j];
    na[i] = k;
    e *= 1 - k * k;
    for (let j = 0; j <= i; j++) a[j] = na[j];
  }
  return { a, e: Math.max(0, e) };
}
function frameACF(d, c, win, P, dlen) {
  const n = dlen || d.length;
  const r = new Float64Array(P + 1);
  for (let k = 0; k <= P; k++) {
    let s = 0;
    for (let i = 0; i + k < win; i++) {
      const a = c + i, b = c + i + k;
      if (a < 0 || b >= n) continue;
      s += d[a] * d[b];
    }
    r[k] = s;
  }
  return r;
}
// LPC 谱包络前两个峰（F1/F2 代理，200~3500Hz）
function lpcFormants(a, sr) {
  const M = 512; const re = new Float64Array(M), im = new Float64Array(M);
  for (let i = 0; i < a.length; i++) re[i] = a[i];
  fft(re, im, false);
  const env = [];
  for (let k = 1; k < M / 2; k++) env.push({ f: k * sr / M, v: 1 / (Math.hypot(re[k], im[k]) + 1e-9) });
  const out = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i].v > env[i - 1].v && env[i].v > env[i + 1].v && env[i].f > 200 && env[i].f < 3500) out.push(env[i].f);
  }
  return out.slice(0, 2);
}

// ---------------------------------------------------------------- MFCC（音色距离，20 mel 滤波器 → DCT 12 维）
function melFilters(sr, nfft, nBins) {
  const mel = f => 1127 * Math.log1p(f / 700), imel = m => 700 * (Math.exp(m / 1127) - 1);
  const mLo = mel(80), mHi = mel(Math.min(4000, sr / 2 - 200)), banks = [];
  for (let b = 0; b < nBins; b++) {
    const fL = imel(mLo + (mHi - mLo) * b / (nBins + 1));
    const fC = imel(mLo + (mHi - mLo) * (b + 1) / (nBins + 1));
    const fR = imel(mLo + (mHi - mLo) * (b + 2) / (nBins + 1));
    const w = [];
      for (let k = 0; k <= nfft / 2; k++) {
        const f = k * sr / nfft, v = f <= fL || f >= fR ? 0 : f <= fC ? (f - fL) / (fC - fL + 1e-9) : (fR - f) / (fR - fC + 1e-9);
        if (v > 0) w.push([k, v]);
      }
      banks.push(w);
  }
  return banks;
}
function mfccFrames(d, sr) {
  const N = 1024, H = 256, nBins = 20, nCC = 12, M = nextPow2(N);
  const banks = melFilters(sr, M, nBins);
  const frames = [];
  for (let c = Math.floor(N * 0.2); c + N < d.length - N * 0.2; c += H) {
    const re = new Float64Array(M), im = new Float64Array(M);
    for (let i = 0; i < N; i++) re[i] = d[c + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
    fft(re, im, false);
    const mag = new Float64Array(M / 2 + 1);
    for (let k = 0; k <= M / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    const melE = banks.map(w => { let s = 0; for (const [k, v] of w) s += v * mag[k] * 2 / N; return Math.log(s + 1e-8); });
    const cc = [];
    for (let n = 1; n <= nCC; n++) {
      let s = 0;
      for (let b = 0; b < nBins; b++) s += melE[b] * Math.cos(Math.PI * n * (b + 0.5) / nBins);
      cc.push(s);
    }
    frames.push(cc);
  }
  return frames;
}
function cosine(a, b) { let n = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { n += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return n / (Math.sqrt(x * y) + 1e-12); }

// ---------------------------------------------------------------- wow 真唱旋律先验（v4 NOTES 同源）
const WOW_NOTES = [[0.043,0.128,68],[0.171,0.107,70],[0.32,0.107,73],[0.875,0.363,78],[1.237,0.725,75],[2.005,0.107,69],[2.304,0.149,71],[2.475,0.128,75],[2.816,0.363,76],[3.179,0.405,73],[3.669,0.235,70],[3.904,0.128,69],[4.032,0.107,70],[4.267,0.107,71],[4.395,0.427,73],[4.821,0.256,75],[5.077,0.299,73],[5.376,0.192,71],[5.611,0.277,68],[6.059,0.235,68],[6.336,0.448,75],[6.784,0.469,74],[7.765,0.149,69],[7.915,0.107,70],[8.619,0.384,77],[9.003,0.64,75],[9.984,0.128,71],[10.176,0.192,81],[10.453,0.149,80],[10.667,0.256,73],[10.923,0.256,73],[11.179,0.107,72],[11.285,0.277,70],[11.563,0.149,69],[12.053,0.427,73],[12.48,0.256,75],[12.757,0.171,72],[12.928,0.213,70],[13.141,0.299,69],[13.653,0.192,68],[13.952,0.405,75],[14.357,0.555,73],[15.467,0.107,73],[15.68,0.107,73]];
const WOW_URL = 'celeste-sounds/wow_so_secret.wav';
// sounds/ 下实际存在的 8 个情绪池（源工程 dialogue_portrait 0–11 里 madeline 用到的那些）
const ALL_POOLS = ['angry', 'deadpan', 'determined', 'distracted', 'sad', 'sadder', 'surprised', 'upset'];

// ---------------------------------------------------------------- 文本单元（复刻 v4 规则）
function textToUnits(text, cap) {
  const units = [];
  for (const ch of text) {
    if (/[。！？!?…，,、；;：:（）()*\s]/.test(ch)) { units.push({ ch, speak: false }); continue; }
    if (/[\u4e00-\u9fff\u3040-\u30ff\uff01-\uff5e]/.test(ch)) { units.push({ ch, speak: true }); continue; }
    if (/[a-zA-Z0-9']/.test(ch)) {
      if (units.length && units[units.length - 1].word) units[units.length - 1].ch += ch;
      else units.push({ ch, speak: true, word: true });
    }
  }
  return units.slice(0, cap || 44);
}

// ================================================================= 引擎
function SingV5Engine(ctx, opts) {
  const sr = ctx.sampleRate;
  const OPT = Object.assign({ pools: ['angry', 'determined'], perGroup: 10, unitCap: 44 }, opts || {});
  const POOLS = OPT.pools.slice();
  const GROUPS = ['mid_A', 'mid_B', 'mid_C', 'per'];
  const LIMITS = { rateLo: 0.7, rateHi: 1.4, hnrMinDb: 6, voicedMin: 0.6, steadyMinSec: 0.06, markMismatchMax: 0.3, mfccGate: 0.9 };

  // ---- 解码并统一到 ctx 采样率
  async function decode(url) {
    const r = await fetch(url);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    const raw = await ctx.decodeAudioData(ab.slice(0));
    if (raw.sampleRate === sr) return { buf: raw, ab };
    const off = new OfflineAudioContext(1, Math.ceil(raw.duration * sr), sr);
    const s = off.createBufferSource(); s.buffer = raw; s.connect(off.destination); s.start();
    return { buf: await off.startRendering(), ab };
  }

  // ---- 循环区（沿用 v4：稳态段整数周期正向过零对）
  function findLoopRegion(d, f0) {
    const n = d.length, from = Math.floor(n * 0.25), to = Math.floor(n * 0.92);
    const zeros = [];
    for (let i = from + 1; i < to; i++) if (d[i - 1] <= 0 && d[i] > 0) zeros.push(i);
    if (zeros.length < 2 || !f0) return { ls: Math.floor(n * 0.3), le: Math.floor(n * 0.85) };
    const period = sr / f0, maxLoop = Math.floor(sr * 0.09);
    const idealL = Math.max(3 * period, Math.floor(maxLoop / period) * period);
    const ls = zeros[0], win = Math.floor(sr * 0.0025);
    const ampAt = i => Math.max(Math.abs(d[i]), Math.abs(d[Math.min(n - 1, i + period / 2 | 0)]));
    const a0 = ampAt(ls);
    let best = -1, bd = 1e9;
    for (const z of zeros) {
      if (Math.abs(z - (ls + idealL)) > win) continue;
      const dd = Math.abs(ampAt(z) - a0); if (dd < bd) { bd = dd; best = z; }
    }
    if (best < 0) for (const z of zeros) if (z >= ls + idealL) { best = z; break; }
    if (best < 0 || ls + idealL >= to) return { ls, le: Math.min(n - 1, ls + Math.max(period * 3 | 0, 0.03 * sr)) };
    return { ls, le: best };
  }

  // ---- 帧级 V/UV + f0 序列（YIN），返回 {f0s[], voiced[], rms[]}
  function frameF0(d, fLo, fHi) {
    const N = 1024, H = 256, lo = Math.floor(sr / fHi), hi = Math.min(Math.floor(sr / fLo), N / 2 - 2);
    const f0s = [], voiced = [], rms = [], ts = [], cmnds = [];
    let maxRms = 1e-6;
    for (let c = 0; c + N <= d.length; c += H) {
      let e = 0; for (let i = 0; i < N; i++) e += d[c + i] ** 2;
      rms.push(Math.sqrt(e / N)); ts.push(c / sr); maxRms = Math.max(maxRms, rms[rms.length - 1]);
    }
    let est = null;
    for (let k = 0; k < rms.length; k++) {
      const c = k * H;
      const y = yinFrame(d, c, N, lo, hi, sr);
      let v = y.cmnd < 0.18 && rms[k] > maxRms * 0.06;
      let f = y.f0;
      cmnds.push(y.cmnd);
      if (v) {
        if (est === null) est = f;
        else { while (f > est * 1.6) f /= 2; while (f < est / 1.6) f *= 2; est = est * 0.8 + f * 0.2; }
      }
      f0s.push(f); voiced.push(v);
    }
    return { f0s, voiced, rms, ts, H, cmnds };
  }

  // ---- 双 pitch mark：A=1kHz 低通峰值吸附（v4），B=正向过零网格；mismatch 率
  function dualMarks(d, f0, ls, le) {
    const n = d.length, period = sr / f0;
    const lp = new Float32Array(n);
    { const al = 1 - Math.exp(-2 * Math.PI * 1000 / sr); let y = 0; for (let i = 0; i < n; i++) { y += al * (d[i] - y); lp[i] = y; } }
    const A = [], B = [];
    const halfW = Math.round(period * 0.5);
    for (let p0 = ls + period * 0.5; p0 + halfW < le; p0 += period) {
      const a = Math.max(ls, Math.round(p0 - halfW)), b = Math.min(le - 1, Math.round(p0 + halfW));
      let bi = Math.round(p0), bv = -1;
      for (let i = a; i <= b; i++) if (Math.abs(lp[i]) > bv) { bv = Math.abs(lp[i]); bi = i; }
      A.push(bi);
    }
    for (let p0 = ls + period * 0.5; p0 < le; p0 += period) {
      const z = Math.round(p0);
      let q = z;
      while (q < le && !(d[q - 1] <= 0 && d[q] > 0)) q++;
      if (q < le && Math.abs(q - z) < period * 0.5) B.push(q);
    }
    let mis = 0;
    for (const a of A) {
      let near = 1e9;
      for (const b of B) near = Math.min(near, Math.abs(a - b));
      if (near > period * 0.25) mis++;
    }
    return { A, B, mismatch: A.length ? mis / A.length : 1 };
  }

  // ---- 单个 blip 全面测量
  function measureItem(poolName, group, file, buf, hash) {
    const d = buf.getChannelData(0);
    const { f0s, voiced, rms, ts, H, cmnds } = frameF0(d, 150, 700);
    const vf = f0s.filter((_, k) => voiced[k]);
    const voicedRatio = voiced.filter(Boolean).length / voiced.length;
    const f0med = vf.length ? median(vf) : null;
    const hnrDb = (() => {
      // HNR 代理：浊音帧 CMND → (1-c)/c（复用合成侧同一次 YIN，避免重复计算）
      const cs = cmnds.filter((_, k) => voiced[k]);
      if (!cs.length) return -30;
      const c = clamp(median(cs), 0.02, 0.98);
      return 10 * Math.log10((1 - c) / c);
    })();
    // 最长稳态段：连续浊音且 f0 偏离中位 ≤40 音分
    let steady = 0, run = 0;
    f0s.forEach((f, k) => {
      if (voiced[k] && f0med && Math.abs(1200 * Math.log2(f / f0med)) <= 40) { run += H / sr; steady = Math.max(steady, run); }
      else run = 0;
    });
    const { ls, le } = findLoopRegion(d, f0med || 300);
    const marks = f0med ? dualMarks(d, f0med, ls, le) : { A: [], B: [], mismatch: 1 };
    const cc = mfccFrames(d, sr);
    const mfcc = cc.length ? cc[0].map((_, j) => median(cc.map(r => r[j]))) : new Array(12).fill(0);
    let rmsSum = 0;
    for (let i = 0; i < d.length; i++) rmsSum += d[i] * d[i];
    const rmsAll = Math.sqrt(rmsSum / d.length);
    return {
      pool: poolName, group, file, hash, dur: buf.duration, sr,
      f0: f0med, midi: f0med ? f2m(f0med) : null,
      voicedRatio, hnrDb, steadySec: steady,
      markMismatch: marks.mismatch, mfcc, rms: rmsAll,
      vStart: ls / sr, vEnd: le / sr, marksA: marks.A,
      buf, d,
      admissible: voicedRatio >= LIMITS.voicedMin && hnrDb >= LIMITS.hnrMinDb &&
                  steady >= LIMITS.steadyMinSec && marks.mismatch <= LIMITS.markMismatchMax && !!f0med
    };
  }

  let audit = null;

  // ---- 第零部分：库存审计（多池 + 哈希去重 + celeste-sounds 副本核对）
  // poolList 缺省用 create 时传的 pools；不存在的编号（如 sadder_mid_A_01）自动跳过。
  async function runAudit(onProgress, poolList) {
    const usePools = (poolList && poolList.length ? poolList.slice() : POOLS);
    if (POOLS === OPT.pools) OPT.pools.length = 0, OPT.pools.push(...usePools);
    const spec = [];
    for (const p of usePools) for (const g of GROUPS) for (let i = 1; i <= OPT.perGroup; i++) {
      const nn = String(i).padStart(2, '0');
      spec.push({ pool: p, group: g, file: `${g}/${p}_${g}_${nn}.wav`, url: `sounds/${p}/${g}/${p}_${g}_${nn}.wav`,
                  mirror: `celeste-sounds/madeline/${p}/${g}/${p}_${g}_${nn}.wav` });
    }
    let done = 0;
    const rows = await mapLimit(spec, 4, async sp => {
      const dec = await decode(sp.url);
      if (onProgress) onProgress(++done, spec.length, sp.url);
      if (!dec) return { ...sp, missing: true };
      const hash = await sha256(dec.ab);
      // 镜像副本只做哈希核对（不参与测量）
      let mirrorSame = null;
      try {
        const mr = await fetch(sp.mirror);
        if (mr.ok) mirrorSame = (await sha256(await mr.arrayBuffer())) === hash;
      } catch { mirrorSame = null; }
      const it = measureItem(sp.pool, sp.group, sp.file, dec.buf, hash);
      return { ...it, mirrorSame };
    });
    const present = rows.filter(r => !r.missing);
    // 去重统计（sounds/ 内 + 跨镜像）
    const hashes = new Set(present.map(r => r.hash));
    const mirrors = present.filter(r => r.mirrorSame !== null);
    const dedup = {
      filesListed: spec.length, filesPresent: present.length,
      uniqueHashes: hashes.size,
      intraDuplicates: present.length - hashes.size,
      mirrorChecked: mirrors.length, mirrorSame: mirrors.filter(r => r.mirrorSame).length,
      mirrorDiff: mirrors.filter(r => r.mirrorSame === false).length
    };
    const poolReport = {};
    for (const p of usePools) {
      const its = present.filter(r => r.pool === p);
      poolReport[p] = {
        n: its.length,
        admissible: its.filter(r => r.admissible).length,
        f0MedianHz: median(its.map(r => r.f0).filter(Boolean)),
        f0RangeSemi: its.length ? [pct(its.map(r => r.f0).filter(Boolean), 0.25), pct(its.map(r => r.f0).filter(Boolean), 0.75)] : null,
        voicedRatioMed: median(its.map(r => r.voicedRatio)),
        hnrDbMed: median(its.map(r => r.hnrDb)),
        steadyMed: median(its.map(r => r.steadySec)),
        markMismatchMed: median(its.map(r => r.markMismatch)),
        banned: its.filter(r => !r.admissible).map(r => ({ file: r.file, voicedRatio: r.voicedRatio.toFixed(2), hnrDb: r.hnrDb.toFixed(1), steady: r.steadySec.toFixed(2), markMis: r.markMismatch.toFixed(2) }))
      };
    }
    // 池间音色距离（MFCC 中位向量余弦）；多池时取「最不像的一对」，跨池禁令按最坏情况判
    const poolMfcc = {};
    for (const p of usePools) {
      const its = present.filter(r => r.pool === p);
      if (its.length) poolMfcc[p] = its[0].mfcc.map((_, j) => median(its.map(r => r.mfcc[j])));
    }
    const mfccKeys = Object.keys(poolMfcc);
    let mfccSim = 1;
    for (let i = 0; i < mfccKeys.length; i++)
      for (let j = i + 1; j < mfccKeys.length; j++)
        mfccSim = Math.min(mfccSim, cosine(poolMfcc[mfccKeys[i]], poolMfcc[mfccKeys[j]]));
    // 音域覆盖表：MIDI 55..84 每半音选全局最优准入单元
    const coverage = [];
    for (let midi = 55; midi <= 84; midi++) {
      const cand = present.filter(r => r.admissible).map(r => ({ r, cents: 1200 * Math.log2(m2f(midi) / r.f0) }));
      cand.forEach(c => { c.centsBestOct = c.cents; while (c.centsBestOct > 600) c.centsBestOct -= 1200; while (c.centsBestOct < -600) c.centsBestOct += 1200; });
      cand.sort((a, b) => Math.abs(a.centsBestOct) - Math.abs(b.centsBestOct));
      const best = cand[0];
      coverage.push({ midi, pool: best ? best.r.pool : null, file: best ? best.r.file : null,
        cents: best ? Math.round(best.centsBestOct) : null,
        rate: best ? clamp(m2f(midi) / best.r.f0 * Math.pow(2, -Math.round((best.centsBestOct) / 1200)), LIMITS.rateLo, LIMITS.rateHi) : null,
        inSafe: best ? Math.abs(best.centsBestOct) <= 1200 * Math.log2(LIMITS.rateHi) : false });
    }
    audit = { ts: new Date().toISOString(), sr, dedup, limits: LIMITS, pools: poolReport, mfccSim, crossPoolAllowed: mfccSim >= LIMITS.mfccGate, coverage, items: present, auditedPools: usePools };
    return audit;
  }

  function admissible(poolName) {
    if (!audit) return [];
    return audit.items.filter(r => r.admissible && (!poolName || r.pool === poolName));
  }

  // ---------------------------------------------------------------- 表情拟合（wow 真唱 → 参数分布）
  function fitExpression(buf) {
    const d = buf.getChannelData(0), isr = buf.sampleRate;
    const H = 128, N = 512;
    const notes = WOW_NOTES.map((g, idx) => {
      const [t, dur, midi] = g;
      const expF = m2f(midi);
      const nlo = Math.floor(isr / (expF * Math.pow(2, 4 / 12))), nhi = Math.ceil(isr / (expF * Math.pow(2, -4 / 12)));
      const series = [];
      for (let tt = t + 0.02; tt < t + dur * 0.92; tt += H / isr) {
        const c = Math.floor(tt * isr);
        if (c + N > d.length) break;
        const y = yinFrame(d, c, N, nlo, Math.min(nhi, N / 2 - 2), isr);
        if (y.cmnd < 0.2) series.push({ tt: tt - t, cents: 1200 * Math.log2(y.f0 / expF) });
      }
      if (series.length < 3) return null;
      const cent = median(series.map(s => s.cents));
      const early = series.filter(s => s.tt <= 0.06);
      const scoop = early.length >= 2 ? Math.min(0, ...early.map(s => s.cents - cent)) : 0;
      const overshoot = (() => { const m = series.filter(s => s.tt > dur * 0.08 && s.tt < dur * 0.5); return m.length ? Math.max(0, pct(m.map(s => s.cents), 0.9) - cent) : 0; })();
      // 颤音：去 0.12s 滑动趋势后自相关估频率，p95-p5 估深度
      let vib = null;
      if (dur >= 0.25) {
        const res = series.map(s => s.cents);
        const det = res.map((v, k) => v - mean(res.slice(Math.max(0, k - 3), k + 4)));
        const seg = det.map((v, k) => ({ tt: series[k].tt, v })).filter(s => s.tt > dur * 0.2 && s.tt < dur * 0.75);
        if (seg.length > 6) {
          const depth = (pct(seg.map(s => s.v), 0.95) - pct(seg.map(s => s.v), 0.05)) / 2;
          if (depth > 6) {
            // 过零率估频率
            let zc = 0; for (let k = 1; k < seg.length; k++) if ((seg[k - 1].v < 0) !== (seg[k].v < 0)) zc++;
            const rate = zc / (2 * (seg[seg.length - 1].tt - seg[0].tt));
            const amp = Math.max(...seg.map(s => Math.abs(s.v)));
            let onset = 0.35;
            for (const s of seg) if (Math.abs(s.v) > amp * 0.5) { onset = s.tt / dur; break; }
            vib = { rate, depth, onsetFrac: clamp(onset, 0.1, 0.6) };
          }
        }
      }
      return { idx, midi, dur, cent, scoop, overshoot, vib };
    }).filter(Boolean);
    const vibs = notes.map(n => n.vib).filter(Boolean);
    const prof = {
      n: notes.length,
      pitchCentMed: median(notes.map(n => n.cent)),
      scoopCents: Math.abs(pct(notes.map(n => n.scoop), 0.2)),      // 取较深一侧（负数）
      scoopMs: 55,
      overshootCents: median(notes.map(n => n.overshoot).filter(x => x > 0)) || 0,
      vibRate: vibs.length ? median(vibs.map(v => v.rate)) : 6.1,
      vibDepth: vibs.length ? median(vibs.map(v => v.depth)) : 25,
      vibOnsetFrac: vibs.length ? median(vibs.map(v => v.onsetFrac)) : 0.35,
      source: 'fitted from wow_so_secret.wav'
    };
    return { profile: prof, perNote: notes };
  }
  const DEFAULT_EXPR = { scoopCents: 0, scoopMs: 55, overshootCents: 0, vibRate: 6.1, vibDepth: 25, vibOnsetFrac: 0.35 };

  // 瞬时频率轨迹（替代 v4 硬编码）
  // prev：连唱（legato）时用，上一个音的目标频率——非字头的音从它滑过来
  // 关键：scoop/overshoot 只在 attack（真音节头）发生；颤音按“本字已持续多久”决定，相位走绝对时间跨音不断相
  function makeFFn(v, prof, prev) {
    const fT = m2f(v.midi), fN = v.nextMidi != null ? m2f(v.nextMidi) : null, sp = v.span;
    const fP = prev ? m2f(prev.midi) : null;
    const tt0 = v.tt0 || 0, L = v.runLen || sp;          // 本音在本字内的起点 / 整个字的长度
    return t => {
      const tt = tt0 + t;                              // 单音字就是 t，melisma 则累计前面几个弯的时长
      const at = v.t + t;                              // 全轨绝对时间：颤音相位连续
      let cents = 0;
      // 连唱滑音窗口：密接的转音（span 只有一百毫秒）经不起固定 45ms 的滑音，
      // 否则整音都在过渡里，稳态根本不存在——按音长收缩
      const gl = Math.min(0.045, sp * 0.4);
      if (fP && !v.attack && t < gl) cents += 1200 * Math.log2(fP / fT) * (1 - t / gl) * 0.9;
      if (v.attack) {
        if (t < prof.scoopMs / 1000) { const u = t / (prof.scoopMs / 1000); cents -= prof.scoopCents * (1 - u) * (1 - u); }
        if (prof.overshootCents > 0) cents += prof.overshootCents * Math.exp(-Math.pow((t / sp - 0.25) / 0.12, 2));
      }
      const vibStart = prof.vibOnsetFrac * L, glideStart = sp * 0.7;
      const w = clamp((L - 0.22) / 0.28, 0, 1) * clamp((tt - vibStart) / 0.08, 0, 1) * clamp((L - tt) / 0.06, 0, 1);
      if (w > 0 && t < glideStart) cents += prof.vibDepth * w * Math.sin(2 * Math.PI * prof.vibRate * at);
      if (fN && t >= glideStart) cents += 1200 * Math.log2(fN / fT) * clamp((t - glideStart) / (sp - glideStart), 0, 1);
      return clamp(fT * Math.pow(2, cents / 1200), 110, 800);
    };
  }

  // ---------------------------------------------------------------- 链路 1：TD-PSOLA v5（V/UV 分流 + 双标 + 同步淡化）
  function renderHead(d, ilen, vStart, N, fFn, f0) {
    // 头部（辅音/起音）：逐采样重采样（scoop 在 fFn 里）
    const out = new Float32Array(N);
    let ipf = 0, op = 0;
    while (op < N && ipf < vStart - 1) {
      ipf += fFn(op / sr) / f0;
      if (ipf >= vStart - 1) break;
      const i0 = Math.floor(ipf), fr = ipf - i0;
      out[op] = i0 + 1 < ilen ? d[i0] * (1 - fr) + d[i0 + 1] * fr : d[i0];
      op++;
    }
    const fade = Math.min(0.012 * sr, Math.max(64, op >> 1));
    for (let i = Math.max(0, op - fade); i < op; i++) out[i] *= (op - i) / fade;
    return { out, headEnd: op };
  }

  function psolaV5(it, span, fFn, cont, o) {
    const B = Object.assign({ head: true, tailFade: 0.012 }, o || {});
    const d = it.d, ilen = d.length;
    const f0 = clamp(it.f0, 150, 600);
    const vStart = Math.round(it.vStart * sr), vEnd = Math.round(it.vEnd * sr);
    const N = Math.ceil(span * sr);
    // head=false（连唱的非音节头）：不重放辅音/起音段，直接从稳态元音接着上一次的源位置唱
    const hd = B.head ? renderHead(d, ilen, vStart, N, fFn, f0) : { out: new Float32Array(N), headEnd: 0 };
    const out = hd.out, headEnd = hd.headEnd;
    const rampIn = B.head ? 0.012 * sr : 0;
    // 源 V/UV 掩码（帧级，256 hop）
    const H = 256, vmask = [];
    for (let c = vStart; c < vEnd; c += H) {
      const Nf = 1024;
      if (c + Nf > ilen) { vmask.push(1); continue; }
      const lo = Math.floor(sr / 700), hi = Math.floor(sr / 150);
      vmask.push(yinFrame(d, c, Nf, lo, Math.min(hi, Nf / 2 - 2), sr).cmnd < 0.22 ? 1 : 0);
    }
    const pa = sr / f0, halfW = Math.round(pa * 0.5);
    // 跨音连续的状态：相位与源位置都从上一音接过来（“同一口气”的物理含义）
    let ph = cont && cont.ph != null ? cont.ph : 0;
    let sp = cont && cont.sp != null && cont.sp >= vStart && cont.sp < vEnd - pa ? cont.sp : vStart;
    let uNext = headEnd;
    for (let op = headEnd; op < N; op++) {
      if (sp >= vEnd - pa) sp = vStart + (sp - vStart) % Math.max(256, vEnd - vStart - pa);
      const fk = Math.floor((sp - vStart) / H);
      const voiced = vmask[clamp(fk, 0, vmask.length - 1)];
      if (voiced) {
        ph += 2 * Math.PI * fFn(op / sr) / sr;
        if (ph >= 2 * Math.PI) {
          ph -= 2 * Math.PI;
          if (B.pulse) B.pulse.push(op);                // 记下“这一帧是个浊音脉冲”：整句变调要拿它当分析标记
          // 峰值吸附当前脉冲（用预算 marksA 最近点）；无 mark 的单元退化为 sp 自身，不出 NaN
          let mc = sp | 0, md = 1e9;
          if (it.marksA && it.marksA.length)
            for (const m of it.marksA) { const dd = Math.abs(m - sp); if (dd < md) { md = dd; mc = m; } }
          const ps = sr / fFn(op / sr), wN = Math.max(16, Math.round(pa * 2));
          const amp = clamp(ps / pa, 0.5, 2), halfN = wN >> 1;
          for (let i = 0; i < wN; i++) {
            const oi = op - halfN + i;
            if (oi < headEnd || oi >= N) continue;
            const si = mc - halfN + i;
            if (si < 0 || si >= ilen) continue;
            const wv = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (wN - 1));
            let g = d[si] * wv * amp;
            if (rampIn && oi < headEnd + rampIn) g *= (oi - headEnd) / rampIn;
            out[oi] += g;
          }
        }
        sp += 1;
      } else {
        // 非浊音：窗 OLA 时长对齐，f0 不动（1:1 铺源噪声/辅音）
        if (op >= uNext) {
          const wN = H * 2;
          for (let i = -H; i < H; i++) {
            const oi = op + i, si = Math.round(sp) + i;
            if (oi < headEnd || oi >= N || si < 0 || si >= ilen) continue;
            out[oi] += d[si] * (0.5 + 0.5 * Math.cos(Math.PI * i / H)) * 0.5;
          }
          uNext = op + H;
        }
        sp += 1;
      }
    }
    if (cont) { cont.ph = ph; cont.sp = sp; }               // 下一个音接着唱
    const tail = Math.min(B.tailFade * sr, N);
    // cos 淡出：与下一段的 sin 淡入凑成等功率（sin²+cos²=1），交叠处能量不凹不凸
    if (tail > 0) for (let i = N - tail; i < N; i++) out[i] *= Math.cos(Math.PI / 2 * (i - (N - tail)) / tail);
    // norm=false：两段式的第一段用，保留素材自身的强弱（真说话每个字不一样响），整句再统一归一
    if (B.norm !== false) peakNorm(out, d);
    return out;
  }

  // ---------------------------------------------------------------- 链路 2：LPC 源-滤波器
  function lpcV5(it, span, fFn, cont, o) {
    const B = Object.assign({ head: true, tailFade: 0.012 }, o || {});
    const d = it.d, ilen = d.length;
    const f0 = clamp(it.f0, 150, 600);
    const vStart = Math.round(it.vStart * sr), vEnd = Math.round(it.vEnd * sr);
    const N = Math.ceil(span * sr);
    const hd = B.head ? renderHead(d, ilen, vStart, N, fFn, f0) : { out: new Float32Array(N), headEnd: 0 };
    const out = hd.out, headEnd = hd.headEnd;
    const rampIn = B.head ? 0.012 * sr : 0;
    const F = 1024, H = F >> 1, P = Math.min(26, (sr / 1000 | 0) + 6);
    let ph = cont && cont.ph != null ? cont.ph : 0;
    const hist = new Float64Array(P);
    if (cont && cont.hist) for (let k = 0; k < P; k++) hist[k] = cont.hist[k] || 0;
    for (let opc = headEnd + H / 2; opc < N; opc += H) {
      let sp = vStart + ((opc - headEnd) % Math.max(F, vEnd - vStart - F));
      sp = Math.round(sp);
      const s0 = Math.max(0, sp - F / 2 | 0);
      const r = frameACF(d, s0, F, P);
      const { a, e } = levinson(r, P);
      let xRms = 0;
      for (let i = 0; i < F; i++) xRms += d[s0 + Math.min(F - 1, i)] ** 2;
      xRms = Math.sqrt(xRms / F) + 1e-9;
      const lo = Math.floor(sr / 700), hi = Math.floor(sr / 150);
      const yy = s0 + F <= ilen ? yinFrame(d, s0, F, lo, Math.min(hi, F / 2 - 2), sr) : { cmnd: 1 };
      const v = clamp((0.22 - yy.cmnd) / 0.15, 0, 1);
      // 激励帧：浊音脉冲 + 噪声混合，过 1/A
      const yf = new Float64Array(F);
      for (let n = 0; n < F; n++) {
        const tt = opc - F / 2 + n;
        if (tt < headEnd || tt >= N) continue;
        ph += 2 * Math.PI * fFn(tt / sr) / sr;
        let imp = 0;
        if (ph >= 2 * Math.PI) { ph -= 2 * Math.PI; imp = 1; }
        const exc = v * imp + (1 - v) * (Math.random() * 2 - 1) * 0.7;
        let yn = exc;
        for (let k = 1; k <= P; k++) yn -= (n - k >= 0 ? yf[n - k] : hist[P + n - k]) * a[k];
        yf[n] = yn;
      }
      for (let k = 0; k < P; k++) hist[k] = yf[F - P + k];
      let yRms = 0; for (let n = 0; n < F; n++) yRms += yf[n] ** 2; yRms = Math.sqrt(yRms / F) + 1e-9;
      const g = xRms / yRms * Math.sqrt(Math.max(0.02, e) / (r[0] + 1e-9) + 0.15);
      for (let n = 0; n < F; n++) {
        const oi = opc - F / 2 + n;
        if (oi < headEnd || oi >= N) continue;
        const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (F - 1));
        let gg = yf[n] * w * g;
        if (rampIn && oi < headEnd + rampIn) gg *= (oi - headEnd) / rampIn;
        out[oi] += gg;
      }
    }
    if (cont) { cont.ph = ph; cont.hist = Array.from(hist); }
    const tail = Math.min(B.tailFade * sr, N);
    if (tail > 0) for (let i = N - tail; i < N; i++) out[i] *= Math.cos(Math.PI / 2 * (i - (N - tail)) / tail);
    if (B.norm !== false) peakNorm(out, d);
    return out;
  }
  function peakNorm(out, ref) {
    let pk = 0; for (let i = 0; i < ref.length; i++) pk = Math.max(pk, Math.abs(ref[i]));
    let ok = 0; for (let i = 0; i < out.length; i++) ok = Math.max(ok, Math.abs(out[i]));
    if (ok > 0) { const g = pk / ok; for (let i = 0; i < out.length; i++) out[i] *= g; }
  }

  // ---------------------------------------------------------------- 选声与规划
  // pool=null 表示允许跨池
  // o.cross：允许挑到别的池（音色门过了才行）；o.crossPen：换池费（音分）
  // 思路来自 Celeste 官方的做法：音高尽量由“换素材”承担，而不是让变调算法硬移
  function pickUnit(midi, pool, lastItem, o) {
    const O = o || {};
    const pen = O.crossPen || 0;
    // cents 是“真实移调量”，不折八度：折了会排错序——真差一个八度的素材会被当成 0 音分排到最前
    const list = O.cross && pool != null ? admissible(null) : admissible(pool);
    let cand = list.map(r => {
      const abs = 1200 * Math.log2(m2f(midi) / r.f0);
      let cents = abs;
      while (cents > 600) cents -= 1200; while (cents < -600) cents += 1200;
      const cost = Math.abs(abs) + (pool != null && r.pool !== pool ? pen : 0);
      return { r, cents, abs, cost };
    });
    const inRange = cand.filter(c => {
      const rate = Math.pow(2, c.abs / 1200);
      return rate >= LIMITS.rateLo && rate <= LIMITS.rateHi;
    });
    if (inRange.length) cand = inRange;
    if (!cand.length) return audit.items.length ? { item: audit.items[0], cents: 0 } : null;
    cand.sort((a, b) => a.cost - b.cost);
    // 不再随机抽：随机 = 相邻音换了不同素材 = 共振峰跳（音色抖）；能接上就接着用同一个单元
    if (lastItem) { const near = cand.find(c => c.r === lastItem && Math.abs(c.abs) <= 90); if (near) return { item: near.r, cents: near.cents }; }
    const top = cand.slice(0, 3).filter(c => c.r !== lastItem);
    const pool2 = top.length ? top : cand;
    const pick = pool2[0];
    return { item: pick.r, cents: pick.cents };
  }

  // notes：WOW_NOTES 或自定义 [[t,dur,midi]]
  //   text  → 按发声字映射（v4 行为：一字一音，字比音多就循环）
  //   chars → Melody.align 产出的逐音字位数组，与 notes 等长；null = 转音尾巴（唱前一个字，不重新起字）
  function plan(notes, text, strategy, chars) {
    const hasChars = Array.isArray(chars);
    const src = notes.map((g, k) => ({ g, ch: hasChars ? chars[k] : undefined }));
    if (hasChars) src.sort((a, b) => a.g[0] - b.g[0]);   // 字位跟着音符一起重排，不怕调用方传乱序
    const seq = src.map((o, k) => ({
      t: o.g[0], dur: o.g[1], midi: o.g[2],
      span: k + 1 < src.length ? src[k + 1].g[0] - o.g[0] : Math.min(0.5, o.g[1] + 0.25),
      nextMidi: k + 1 < src.length ? src[k + 1].g[2] : null,
      ch: o.ch,
      // 只有新字才重新起音；转音尾巴（ch=null）连唱
      // 没给 chars 也没给 text（整曲唱「啊」）时不能一律 attack=true，否则连唱会退回逐音、又是一顿一顿
      attack: hasChars ? o.ch != null : !!text
    }));
    // 乐句划分：onset 间隔 >0.25s 断句（wow 真唱同款规则）
    // 但“重新起音”只跟着字走：子槽拆密了会误判成换句，听感就成了每个音一个 word
    let ph = 0, prevT = null;
    for (const v of seq) {
      if (prevT === null) v.attack = true;                       // 全曲第一个音总得起音
      if (prevT !== null && v.t - prevT > 0.25) { ph++; v.phraseStart = true; }
      if (prevT !== null && v.t - prevT > 0.6) v.attack = true;      // 真断句（换气）才额外起音
      v.phraseId = ph; prevT = v.t;
    }
    let mapping;
    if (hasChars) {
      let carry = null;
      mapping = seq.map(v => { if (v.ch == null) v.ch = carry; else carry = v.ch; return { v, phraseId: v.phraseId }; });
    } else if (text) {
      const units = textToUnits(text, OPT.unitCap);
      const speakK = [];
      units.forEach((u, i) => { if (u.speak) speakK.push(i); });
      mapping = speakK.map((ui, k) => {
        const v = seq[k % seq.length];
        let phrase = 0;
        for (let j = 0; j <= ui; j++) if (units[j] && !units[j].speak) phrase++;
        return { v, phraseId: phrase, ch: units[ui].ch };
      }).filter(m => m.v);
    } else {
      mapping = seq.map(v => ({ v, phraseId: v.phraseId }));
    }
    // 音色门：两池 MFCC 相似度不足 → 句内锁池（乐句首音决定池，cross 策略才生效）
    const crossAllowed = strategy === 'cross' && audit && audit.crossPoolAllowed;
    const poolNames = audit ? Object.keys(audit.pools) : POOLS.slice();
    const isPool = s => typeof s === 'string' && s !== 'auto' && s !== 'cross' && poolNames.indexOf(s) >= 0;
    // 锁池时选准入单元最多的池作默认池（不再是硬编码的 angry/determined）
    const majorPool = (() => {
      let best = poolNames[0], bn = -1;
      for (const p of poolNames) { const n = admissible(p).length; if (n > bn) { bn = n; best = p; } }
      return best;
    })();
    // 'auto'：逐乐句挑覆盖最准的池（整首歌音域会变，全程锁一个池容易整句选不到单元）
    const phrasePool = {};
    if (strategy === 'auto') {
      const byP = {};
      mapping.forEach(m => { (byP[m.phraseId] = byP[m.phraseId] || []).push(m); });
      for (const key of Object.keys(byP)) {
        const ms = byP[key];
        let best = null, bc = Infinity;
        for (const p of poolNames) {
          const its = admissible(p);
          if (!its.length) continue;
          let c = 0;
          for (const m of ms) {
            let e = Infinity;
            for (const r of its) {
              let cents = 1200 * Math.log2(m2f(m.v.midi) / r.f0);
              while (cents > 600) cents -= 1200; while (cents < -600) cents += 1200;
              if (Math.abs(cents) < e) e = Math.abs(cents);
            }
            c += e === Infinity ? 1200 : e;
          }
          if (c < bc) { bc = c; best = p; }
        }
        phrasePool[key] = best || majorPool;
      }
    }
    let last = null;
    // 池间音色距离换算成“换池费”：余弦 1.0（完全像）→ 免费；到 0.9 门槛 → 300 音分，
    // 即“换池必须换来至少 3 个半音的音准”才值。音色不像时自动退回原来的锁池行为
    const mayCross = !!(audit && audit.crossPoolAllowed) && !isPool(strategy);
    const crossPen = audit ? Math.round((1 - audit.mfccSim) * 3000) : 600;
    const voices = mapping.map(m => {
      let pool = null;
      if (isPool(strategy)) pool = strategy;
      else if (strategy === 'auto') pool = phrasePool[m.phraseId] || majorPool;
      else if (!crossAllowed) pool = majorPool;      // 'cross' 但音色门不过 → 沿用旧的句内锁主池
      let sel;
      // 同一个字的转音：量不跳太远就沿用上一次的素材，共振峰不断（真唱就是一个元音拐几个弯）
      if (!m.v.attack && last) {
        // 同上：真实移调量，不折八度（折了会把差一个八度的叫“没差别”）
        const cents = 1200 * Math.log2(m2f(m.v.midi) / last.f0);
        sel = Math.abs(cents) <= 250 ? { item: last, cents } : null;
      }
      if (!sel) sel = pickUnit(m.v.midi, pool, last, { cross: mayCross, crossPen });   // pool=null = 允许跨池
      if (!sel) return null;
      last = sel.item;
      return { ...m.v, phraseId: m.phraseId, ch: m.ch || null, item: sel.item, pool: sel.item.pool };
    }).filter(Boolean);
    if (!seq.length) return { voices: [], dur: 0 };
    // 同一个字（一个 attack 到下一个 attack 之前）当一口气：算出每音在字内的起点 tt0 与字总长 runLen
    // 颤音按“这个字已经持续多久”决定，不按单音长度——否则 melisma 每拐一个弯都重新颤一次
    let runStart = -1, runT = 0;
    for (let i = 0; i < voices.length; i++) {
      if (voices[i].attack) {
        for (let j = runStart; j >= 0 && j < i; j++) voices[j].runLen = runT;
        runStart = i; runT = 0;
      }
      voices[i].tt0 = runT;
      runT += Math.max(0.09, voices[i].span);
    }
    for (let j = Math.max(0, runStart); j < voices.length; j++) voices[j].runLen = runT;
    const tail = seq[seq.length - 1];
    const poolUse = {};
    for (const v of voices) poolUse[v.pool] = (poolUse[v.pool] || 0) + 1;
    return { voices, dur: tail.t + tail.dur + 0.3, meta: { mayCross, crossPen, mfccSim: audit ? audit.mfccSim : null, poolUse } };
  }

  // 准入库存能稳唱（|cents 误差| ≤ 1200·log2(rateHi)）的 MIDI 区间，给整曲移调用
  function safeRange() {
    const cs = audit ? audit.coverage.filter(c => c.inSafe) : [];
    return cs.length ? { lo: cs[0].midi, hi: cs[cs.length - 1].midi, n: cs.length } : { lo: 55, hi: 84, n: 0 };
  }

  // ---------------------------------------------------------------- 轨道渲染
  // legato（默认）：音与音之间等功率交叠、相位与源位置跳音连续、只在音节头铺辅音
  //   —— 旧版逐音各渲一块再 8ms 相加，等于每个音重起一次音，听感就是“一顿一顿”
  // legato:false 保留旧的逐音模式，给页面做 A/B 对比
  function renderTrack(planObj, chain, prof, o) {
    const B = Object.assign({ legato: true, xfMs: 45 }, o || {});
    const fn = chain === 'lpc' ? lpcV5 : psolaV5;
    const total = Math.ceil(planObj.dur * sr) + sr;
    const mix = new Float32Array(total);
    const xfMax = Math.round((B.legato ? B.xfMs : 8) / 1000 * sr);
    const voices = planObj.voices;
    // 交叠长度按相邻两音里较短的那个收缩：45ms 交叠放在 90ms 的转音上会吃掉一半音
    const xfAt = k => {
      if (!B.legato) return xfMax;
      return Math.max(64, Math.min(xfMax, Math.round(0.4 * Math.min(voices[k].span, voices[k + 1].span) * sr)));
    };
    const cont = {};                                  // 跨音连续的相位/源位/LPC 滤波状态
    const phCount = {};
    for (const v of planObj.voices) phCount[v.phraseId] = (phCount[v.phraseId] || 0) + 1;
    const phIdx = {};
    let prev = null;
    for (let k = 0; k < planObj.voices.length; k++) {
      const v = planObj.voices[k];
      const next = planObj.voices[k + 1];
      const phraseEnd = !next || next.phraseId !== v.phraseId;
      const overlapNext = B.legato && next && next.phraseId === v.phraseId && !next.attack;
      // 乐句末留气口：只在真有间隙（span > 0.3）时才提前收，否则会把密接的音切短
      const span = B.legato && phraseEnd && v.span > 0.3 ? Math.min(v.span, v.dur + 0.16) : v.span;
      const xfo = overlapNext ? xfAt(k) : 0;          // 本音尾巴伸进下一音 slots 的长度
      const xfi = k > 0 ? xfAt(k - 1) : 0;            // 本音头部与上一音尾巴交叠的长度
      const wav = fn(v.item, Math.max(0.09, span) + xfo / sr, makeFFn(v, prof || DEFAULT_EXPR, prev),
                     B.legato ? cont : null,
                     { head: !B.legato || v.attack,
                       tailFade: xfo ? xfo / sr : (B.legato ? (phraseEnd ? 0.16 : 0) : 0.012) });
      if (!wav) continue;
      // 连唱靠“上一音的尾巴伸进来”交叠，而不是把本音提前——提前会让整条人声抢拍，
      // 且每个音的稳态段被滑音吃掉一半
      const lead = B.legato && !v.attack ? xfi : 0;
      const pos = Math.round(v.t * sr);
      // 乐句内的强弱：真唱一句里越往后越轻（气息消耗），不是每个音一样响
      const idx = phIdx[v.phraseId] = phIdx[v.phraseId] == null ? 0 : phIdx[v.phraseId] + 1;
      const decay = 1 - 0.16 * idx / Math.max(1, phCount[v.phraseId] - 1);
      for (let i = 0; i < wav.length; i++) {
        let g = 1;
        if (i < lead) g = Math.sin(Math.PI / 2 * (i / lead));
        const oi = pos + i;
        if (oi >= total) break;
        if (oi < 0) continue;
        mix[oi] += wav[i] * g * 0.9 * decay;
      }
      prev = v;
    }
    // 主输出峰值归一
    let pk = 0; for (let i = 0; i < mix.length; i++) pk = Math.max(pk, Math.abs(mix[i]));
    if (pk > 0.99) { const g = 0.95 / pk; for (let i = 0; i < mix.length; i++) mix[i] *= g; }
    const buf = ctx.createBuffer(1, mix.length, sr);
    buf.getChannelData(0).set(mix);
    return buf;
  }

  // ---------------------------------------------------------------- 两段式：先说话，再整句变调
  // 逐音变调＝每个音各自重算一次音高（拼接点重起、还可能换素材单元）；
  // 整句变调＝先把字按说话的方式摆成一句话（完全不变调），再对这条连续波形按旋律改音高。
  // 后者跨音处的共振峰与相位天然连续，就是“像说话一样把歌哼出来”的那种顺。
  /**
   * 第一段：把一句话摆成一条**连续的**波形（完全不变调），第二段再整句改音高。
   * 两条硬规矩，都是听感换来的：
   *  ① 不做 TD-PSOLA 重合成：素材是录好的，重合成一遍等于把辅音、气口、尾巴再加工，
   *     听感立刻变成机器拼贴（diary 页说话就是直接播原始 wav）。
   *  ② **一句话只用一条素材**：每个字换一条，元音共振峰和基频都不一样，
   *     连起来就是“多种音效在切换”。换素材只发生在换气处（不同乐句），那本来就是另一口气。
   * 每个字仍然用自己的头起一声（保留字粒），但**同一句里不再换素材**：
   * 换素材只发生在换气处（不同乐句），那本来就是另一口气。
   * 时值比素材长时，把稳态段（vStart..vEnd，整数周期、过零对齐）循环铺满；
   * 字尾接回素材自己的尾巴收声。
   */
  function speakTrack(planObj, chain, prof, o) {
    const total = Math.ceil(planObj.dur * sr) + sr;
    const mix = new Float32Array(total);
    const marks = [];
    const voices = planObj.voices;
    if (!voices.length) { const b = ctx.createBuffer(1, total, sr); return { buf: b, marks, dur: total / sr }; }
    const endT = planObj.dur - 0.25;
    // 按乐句（一口气）分组：同一乐句内绝不换素材、绝不重新起音
    const phrases = [];
    for (const v of voices) {
      const cur = phrases[phrases.length - 1];
      if (!cur || cur.id !== v.phraseId) phrases.push({ id: v.phraseId, vs: [v] });
      else cur.vs.push(v);
    }
    const fadeN = Math.max(32, Math.round(0.006 * sr));
    let prev = null;
    for (let pi = 0; pi < phrases.length; pi++) {
      const ph = phrases[pi], pv = ph.vs;
      // 整句共用一条素材：按句内各音的中位音高挑，让第二段的整体移调量最小
      const sel = pickUnit(median(pv.map(v => v.midi)), pv[0].pool, prev, {});
      const it = (sel && sel.item) || pv[0].item;
      prev = it;
      const src = it.d;
      const ls = clamp(Math.round(it.vStart * sr), 0, src.length - 2);
      const le = clamp(Math.round(it.vEnd * sr), ls + 32, src.length - 1);
      const phStop = Math.round(Math.min(endT, pv[pv.length - 1].t + Math.max(0.12, pv[pv.length - 1].span)) * sr);
      // 这一句里按字切：一个 attack 到下一个 attack 之前 = 一个字
      const runs = [];
      for (const v of pv) { if (v.attack || !runs.length) runs.push([]); runs[runs.length - 1].push(v); }
      for (let ri = 0; ri < runs.length; ri++) {
        const v0 = runs[ri][0];
        const pos = Math.round(v0.t * sr);
        const stop = Math.max(pos + 64, ri + 1 < runs.length ? Math.round(runs[ri + 1][0].t * sr) : phStop);
        let w = 0;                                   // 已写样本数（相对 pos）
        // 铺 src[from..to) 到 pos+w，同时把落在其中的基音标记换算到句内位置
        const emit = (from, to) => {
          if (to <= from) return;
          for (const m of it.marksA) if (m >= from && m < to) marks.push(pos + w + (m - from));
          for (let i = from; i < to; i++) { const oi = pos + w + (i - from); if (oi >= 0 && oi < total) mix[oi] += src[i]; }
          w += to - from;
        };
        // ① 素材头 + 稳态：原样搬，辅音、起音全在
        emit(0, Math.min(le, stop - pos));
        // ② 时值比素材长：循环稳态段铺满，留出尾巴的位置（循环点过零对齐，接缝不响）
        const tailLen = src.length - le;
        while (pos + w < stop - tailLen - 8) {
          const n = Math.min(le - ls, stop - (pos + w));
          if (n < 64) break;
          emit(ls, ls + n);
          if (n < le - ls) break;                    // 被时值截断，不再铺
        }
        // ③ 收声用素材自己的尾巴：说话的味道全在这段自然衰减里，不是我们拿 cos 淡出来的
        const rest = stop - (pos + w);
        if (rest > 32) emit(le, Math.min(src.length, le + rest));
        // ④ 被下一个字（或下一句）截断时补 6ms 淡出，避免爆音
        const cutAt = Math.min(total, pos + w);
        for (let i = Math.max(0, cutAt - fadeN); i < cutAt; i++) mix[i] *= (cutAt - i) / fadeN;
      }
    }
    // 逐段不归一（每句本身就带轻重），整句归一避免叠加爆表或偏小
    let pk = 0;
    for (let i = 0; i < mix.length; i++) { const a = Math.abs(mix[i]); if (a > pk) pk = a; }
    if (pk > 0) { const g = 0.9 / pk; for (let i = 0; i < mix.length; i++) mix[i] *= g; }
    const buf = ctx.createBuffer(1, total, sr);
    buf.getChannelData(0).set(mix);
    return { buf, marks, dur: total / sr };
  }

  /** 时间 → 该时刻的目标频率（按音分配，二分查找；整句几十万样本逐点扫会炸） */
  function sentenceF0(planObj, prof) {
    const vs = planObj.voices;
    return t => {
      let lo = 0, hi = vs.length - 1, k = 0;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (vs[mid].t <= t) { k = mid; lo = mid + 1; } else hi = mid - 1; }
      const v = vs[k];
      const local = clamp(t - v.t, 0, Math.max(0.001, v.span));
      return makeFFn(v, prof, k > 0 ? vs[k - 1] : null)(local);
    };
  }

  /**
   * 第二段：整句变调（TD-PSOLA，时长不变）
   * marks = 第一段每个浊音脉冲在句内的样本位置。合成脉冲按目标 f0 走，每个脉冲去最近的
   * 分析标记取两侧各一个周期的波形做 Hann 叠加——源是同一句话，所以跨音不会换音色。
   * 辅音/气声段没有标记，原样透传（硬糊上去会把辅音泡成嗡嗡声）。
   */
  function shiftSentence(d, marks, fFn) {
    const N = d.length, out = new Float32Array(N);
    if (!marks || marks.length < 8) { out.set(d); return out; }
    marks.sort((a, b) => a - b);
    // 一个基音周期有多长：掩码和 OLA 窗都按它定，绝不能用"到下一个标记的距离"——
    // 遇到气口/闭塞，那个距离是几十毫秒，掩码会把整段静音盖住、OLA 把字头波形抄进静音里，
    // 谷就被填平了（实测 dip/s 从 0.35 掉到 0.06 就是这么来的）
    const gaps0 = [];
    for (let j = 1; j < marks.length; j++) { const gg = marks[j] - marks[j - 1]; if (gg > 16) gaps0.push(gg); }
    const pg = gaps0.length ? Math.max(24, Math.round(median(gaps0))) : Math.round(sr / 200);
    const covTight = Math.max(24, Math.round(pg * 0.75));
    const cov = new Uint8Array(N);
    for (let j = 0; j < marks.length; j++) {
      for (let i = marks[j] - covTight; i <= marks[j] + covTight; i++) if (i >= 0 && i < N) cov[i] = 1;
    }
    let ph = 0, k = 0;
    for (let t = 0; t < N; t++) {
      if (!cov[t]) continue;
      ph += 2 * Math.PI * fFn(t / sr) / sr;
      if (ph < 2 * Math.PI) continue;
      ph -= 2 * Math.PI;
      while (k + 1 < marks.length && Math.abs(marks[k + 1] - t) <= Math.abs(marks[k] - t)) k++;
      const mc = marks[k];
      const hw = Math.max(24, Math.min(Math.round(sr / 110), Math.round(pg * 1.1)));
      for (let i = -hw; i <= hw; i++) {
        const oi = t + i, si = mc + i;
        if (oi < 0 || oi >= N || si < 0 || si >= N) continue;
        out[oi] += d[si] * (0.5 + 0.5 * Math.cos(Math.PI * i / hw));
      }
    }
    // 0/1 掩码做 2ms 滑动平均变软权重：浊音用合成结果、辅音用原句，交界不硬切
    const wg = new Float32Array(N), half = Math.max(8, Math.round(0.002 * sr));
    let acc = 0;
    for (let t = 0; t < N; t++) {
      acc += cov[t];
      if (t - 2 * half >= 0) acc -= cov[t - 2 * half];
      wg[t] = acc / (2 * half + 1);
    }
    let a = 0, b = 0;
    for (let t = 0; t < N; t++) if (cov[t]) { a += d[t] * d[t]; b += out[t] * out[t]; }
    const g = b > 1e-9 ? Math.sqrt(a / b) : 1;
    for (let t = 0; t < N; t++) out[t] = wg[t] * out[t] * g + (1 - wg[t]) * d[t];
    return out;
  }

  /** 两段串起来：说话 → 整句变调。返回中间产物，页面能直接把「先说话」放给人听 */
  function renderTrackSentence(planObj, chain, prof, o) {
    const sp = speakTrack(planObj, chain, prof, o);
    const fFn = sentenceF0(planObj, prof || DEFAULT_EXPR);
    const sung = shiftSentence(sp.buf.getChannelData(0), sp.marks, fFn);
    const out = ctx.createBuffer(1, sung.length, sr);
    out.getChannelData(0).set(sung);
    return { spoke: sp.buf, sung: out, marks: sp.marks.length };
  }

  // ---------------------------------------------------------------- 第三部分：独立验证
  // 音准测量：取整段稳态多个子窗的**中位** cents
  // 旧版只测一个 2048 样本窗，颤音相位直接当成误差——连唱把颤音拉开后 RMSE 会假性爆炸到 100+ 音分
  function measureVoice(buf, v, prof) {
    const d = buf.getChannelData(0), bsr = buf.sampleRate;
    const sco = (prof ? prof.scoopMs : 55) / 1000 + 0.03;
    const a = v.t + Math.min(sco, v.span * 0.5);
    // 连唱时下一音会提前 ~45ms 交叠进来，窗尾要留安全边界，否则中位会取到下一个音的频率
    const b = Math.max(a + 0.02, v.t + Math.max(v.span * 0.6, v.span - 0.08));
    const expF = m2f(v.midi);
    const W = Math.min(2048, Math.floor((b - a) * bsr));
    if (W < 256) return null;
    const step = Math.max(W >> 1, 256);
    const cs = []; let voiced = false, z = 0, cnt = 0;
    for (let i0 = Math.floor(a * bsr); i0 + W <= Math.floor(b * bsr); i0 += step) {
      const m = cepsPitch(d, i0, W, bsr, expF);
      if (!m.voiced) continue;
      let cents = 1200 * Math.log2(m.f0 / expF);
      while (cents > 600) cents -= 1200; while (cents < -600) cents += 1200;
      cs.push(cents); voiced = true; z += m.z; cnt++;
    }
    if (!cs.length) return null;
    cs.sort((x, y) => x - y);
    return { cents: cs[cs.length >> 1], spread: cs[cs.length - 1] - cs[0], voiced, z: cnt ? z / cnt : 0 };
  }
  function pitchMetrics(buf, voices, prof) {
    const rows = voices.map(v => ({ v, m: measureVoice(buf, v, prof) }));
    const ok = rows.filter(r => r.m && r.m.voiced);
    const errs = ok.map(r => r.m.cents);
    return {
      n: voices.length, measured: ok.length,
      rmse: Math.sqrt(mean(errs.map(x => x * x))),
      mae: mean(errs.map(Math.abs)),
      vibSpread: median(rows.filter(r => r.m).map(r => r.m.spread)),   // 整音 F0 跨度（音分）：颤音到底有没有
      maxAbs: errs.length ? Math.max(...errs.map(Math.abs)) : null,
      grossRate: errs.filter(x => Math.abs(x) > 200).length / (errs.length || 1),
      vuvMiss: rows.filter(r => r.m && !r.m.voiced).length / (rows.filter(r => r.m).length || 1),
      perVoice: rows.map(r => ({ midi: r.v.midi, pool: r.v.pool, attack: !!r.v.attack, span: +r.v.span.toFixed(2), cents: r.m ? Math.round(r.m.cents) : null, spread: r.m ? Math.round(r.m.spread) : null, voiced: r.m ? r.m.voiced : null }))
    };
  }
  // rate=1 恒等 null：稳态 0.3s 目标 f0=自然 f0，对齐后残差 dB
  function identityNull(chain) {
    const fn = chain === 'lpc' ? lpcV5 : psolaV5;
    const items = admissible().slice(0, 8);
    const rows = items.map(it => {
      const wav = fn(it, 0.3, () => it.f0);
      const d = it.d, N = Math.floor(0.3 * sr);
      const s0 = Math.floor((it.vStart + it.vEnd) / 2 * sr) - N / 2;
      const ref = d.slice(clamp(s0, 0, d.length - N), clamp(s0, 0, d.length - N) + N);
      // 粗对齐（±2 周期）
      let lag = 0, best = -1e9;
      for (let l = -Math.round(2 * sr / it.f0); l <= Math.round(2 * sr / it.f0); l++) {
        let s = 0; for (let i = 0; i < N; i++) { const a = wav[i], b = ref[clamp(i + l, 0, N - 1)] || 0; s += a * b; }
        if (s > best) { best = s; lag = l; }
      }
      let num = 0, den = 0;
      for (let i = 0; i < N; i++) { const b = ref[clamp(i + lag, 0, N - 1)] || 0; num += (wav[i] - b) ** 2; den += b * b; }
      return { file: it.file, pool: it.pool, residualDb: 10 * Math.log10(num / (den + 1e-9) + 1e-9) };
    });
    return { medDb: median(rows.map(r => r.residualDb)), rows };
  }
  // 拼接 click：相邻 voice 交接区差分尖峰数（相对全局中位差分的 8 倍）
  function clickCount(buf, voices) {
    const d = buf.getChannelData(0);
    const dd = [];
    for (let i = 1; i < d.length; i++) dd.push(Math.abs(d[i] - d[i - 1]));
    const med = median(dd), thr = med * 8;
    let clicks = 0;
    for (const v of voices.slice(1)) {
      const c = Math.round(v.t * sr);
      let hit = 0;
      for (let i = c - Math.round(0.004 * sr); i < c + Math.round(0.004 * sr); i++)
        if (i > 0 && i < dd.length && dd[i] > thr) hit++;
      if (hit > 2) clicks++;
    }
    return clicks;
  }
  // F1/F2 漂移：源稳态 vs ±200~400 音分合成结果（LPC 包络峰比值，应≈1）
  function formantDrift(chain) {
    const fn = chain === 'lpc' ? lpcV5 : psolaV5;
    const items = admissible().slice(0, 6);
    const ratios = [];
    for (const it of items) {
      const P = Math.min(26, (sr / 1000 | 0) + 6);
      const c0 = Math.floor((it.vStart + it.vEnd) / 2 * sr);
      const r0 = frameACF(it.d, c0, 1024, P), f0 = lpcFormants(levinson(r0, P).a, sr);
      for (const delta of [-300, 300]) {
        const wav = fn(it, 0.3, () => it.f0 * Math.pow(2, delta / 1200));
        const cc = Math.floor(wav.length * 0.5);
        const rr = frameACF(wav, cc, 1024, P), f1 = lpcFormants(levinson(rr, P).a, sr);
        if (f0.length >= 2 && f1.length >= 2) ratios.push(f1[0] / f0[0], f1[1] / f0[1]);
      }
    }
    return { medRatio: ratios.length ? median(ratios) : null, n: ratios.length };
  }

  // ---------------------------------------------------------------- 全量报告
  async function fullReport(onLog) {
    const log = onLog || (() => {});
    if (!audit) { log('审计未完成，先跑库存审计'); throw new Error('no-audit'); }
    log('拟合 wow 真唱表情参数…');
    const wowDec = await decode(WOW_URL);
    const fit = wowDec ? fitExpression(wowDec.buf) : null;
    const prof = fit ? fit.profile : DEFAULT_EXPR;

    const out = { ts: new Date().toISOString(), audit: {
      dedup: audit.dedup, pools: audit.pools, mfccSim: audit.mfccSim, crossPoolAllowed: audit.crossPoolAllowed,
      coverageSafeNotes: audit.coverage.filter(c => c.inSafe).length + '/30'
    }, expression: prof, strategies: {} };

    for (const strategy of ['angry', 'determined', 'cross']) {
      const p = plan(WOW_NOTES, null, strategy);
      out.strategies[strategy] = {};
      for (const chain of ['psola', 'lpc']) {
        log(`合成 wow：${strategy} × ${chain}（${p.voices.length} 音）`);
        await new Promise(r => setTimeout(r, 0));
        const buf = renderTrack(p, chain, prof);
        const met = pitchMetrics(buf, p.voices, prof);
        out.strategies[strategy][chain] = {
          rmseCents: +met.rmse.toFixed(1), maeCents: +met.mae.toFixed(1),
          grossRate: +met.grossRate.toFixed(3), vuvMiss: +met.vuvMiss.toFixed(3),
          clicks: clickCount(buf, p.voices), perVoice: met.perVoice
        };
      }
    }
    log('恒等 null 测试 + 共振峰漂移…');
    out.identity = { psola: identityNull('psola'), lpc: identityNull('lpc') };
    out.formants = { psola: formantDrift('psola'), lpc: formantDrift('lpc') };
    out.verdict = verdict(out);
    reportCache = out;
    return out;
  }

  function verdict(r) {
    const pass = [];
    const row = r.strategies.cross.psola, rowL = r.strategies.cross.lpc;
    if (row.rmseCents <= 50) pass.push('音准 RMSE≤50 音分');
    if (row.grossRate <= 0.05) pass.push('粗错率≤5%');
    if (row.clicks === 0) pass.push('拼接零 click');
    if (Math.abs(r.formants.lpc.medRatio - 1) < Math.abs(r.formants.psola.medRatio - 1)) pass.push('LPC 共振峰保持优于 PSOLA（数据支持选链）');
    if (r.audit.mfccSim < LIMITS.mfccGate) pass.push('两池音色距离触发句内锁池规则');
    if (r.identity.psola.medDb < -20) pass.push('PSOLA rate=1 恒等残差 < -20dB');
    return pass;
  }

  let reportCache = null;

  return {
    sr, POOLS, WOW_NOTES, ALL_POOLS, LIMITS, OPT,
    runAudit, fullReport, fitExpression,
    plan, renderTrack, renderTrackSentence, speakTrack, shiftSentence, pitchMetrics, identityNull, formantDrift, clickCount, safeRange,
    textToUnits, psolaV5, lpcV5, cepsPitch,
    getAudit: () => audit, getReport: () => reportCache,
    async loadWow() { const d = await decode(WOW_URL); return d ? d.buf : null; }
  };
}

global.SingV5 = { create: (ctx, opts) => SingV5Engine(ctx, opts), ALL_POOLS, WOW_NOTES, m2f, f2m };
if (typeof module !== 'undefined' && module.exports) module.exports = global.SingV5;
})(typeof window !== 'undefined' ? window : globalThis);
