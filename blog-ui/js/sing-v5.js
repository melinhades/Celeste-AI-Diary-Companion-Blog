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
 * 暴露 window.SingV5。
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

// ---------------------------------------------------------------- 文本单元（复刻 v4 规则）
function textToUnits(text) {
  const units = [];
  for (const ch of text) {
    if (/[。！？!?…，,、；;：:（）()*\s]/.test(ch)) { units.push({ ch, speak: false }); continue; }
    if (/[\u4e00-\u9fff\u3040-\u30ff\uff01-\uff5e]/.test(ch)) { units.push({ ch, speak: true }); continue; }
    if (/[a-zA-Z0-9']/.test(ch)) {
      if (units.length && units[units.length - 1].word) units[units.length - 1].ch += ch;
      else units.push({ ch, speak: true, word: true });
    }
  }
  return units.slice(0, 44);
}

// ================================================================= 引擎
function SingV5Engine(ctx) {
  const sr = ctx.sampleRate;
  const POOLS = ['angry', 'determined'];
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

  // ---- 第零部分：库存审计（双池 + 哈希去重 + celeste-sounds 副本核对）
  async function runAudit(onProgress) {
    const spec = [];
    for (const p of POOLS) for (const g of GROUPS) for (let i = 1; i <= 10; i++) {
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
    for (const p of POOLS) {
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
    // 池间音色距离（MFCC 中位向量余弦）
    const poolMfcc = {};
    for (const p of POOLS) {
      const its = present.filter(r => r.pool === p);
      poolMfcc[p] = its[0].mfcc.map((_, j) => median(its.map(r => r.mfcc[j])));
    }
    const mfccSim = cosine(poolMfcc.angry, poolMfcc.determined);
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
    audit = { ts: new Date().toISOString(), sr, dedup, limits: LIMITS, pools: poolReport, mfccSim, crossPoolAllowed: mfccSim >= LIMITS.mfccGate, coverage, items: present };
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
  function makeFFn(v, prof) {
    const fT = m2f(v.midi), fN = v.nextMidi != null ? m2f(v.nextMidi) : null, sp = v.span;
    return t => {
      let cents = 0;
      if (t < prof.scoopMs / 1000) { const u = t / (prof.scoopMs / 1000); cents -= prof.scoopCents * (1 - u) * (1 - u); }
      if (prof.overshootCents > 0) cents += prof.overshootCents * Math.exp(-Math.pow((t / sp - 0.25) / 0.12, 2));
      const vibStart = prof.vibOnsetFrac * sp, glideStart = sp * 0.7;
      if (sp >= 0.25 && t >= vibStart && t < glideStart) {
        const env = clamp((t - vibStart) / 0.08, 0, 1) * clamp((glideStart - t) / 0.05, 0, 1);
        cents += prof.vibDepth * env * Math.sin(2 * Math.PI * prof.vibRate * (t - vibStart));
      }
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

  function psolaV5(it, span, fFn) {
    const d = it.d, ilen = d.length;
    const f0 = clamp(it.f0, 150, 600);
    const vStart = Math.round(it.vStart * sr), vEnd = Math.round(it.vEnd * sr);
    const N = Math.ceil(span * sr);
    const { out, headEnd } = renderHead(d, ilen, vStart, N, fFn, f0);
    // 源 V/UV 掩码（帧级，256 hop）
    const H = 256, vmask = [];
    for (let c = vStart; c < vEnd; c += H) {
      const Nf = 1024;
      if (c + Nf > ilen) { vmask.push(1); continue; }
      const lo = Math.floor(sr / 700), hi = Math.floor(sr / 150);
      vmask.push(yinFrame(d, c, Nf, lo, Math.min(hi, Nf / 2 - 2), sr).cmnd < 0.22 ? 1 : 0);
    }
    const pa = sr / f0, halfW = Math.round(pa * 0.5);
    let sp = vStart, ph = 0, uNext = headEnd;
    for (let op = headEnd; op < N; op++) {
      if (sp >= vEnd - pa) sp = vStart + (sp - vStart) % Math.max(256, vEnd - vStart - pa);
      const fk = Math.floor((sp - vStart) / H);
      const voiced = vmask[clamp(fk, 0, vmask.length - 1)];
      if (voiced) {
        ph += 2 * Math.PI * fFn(op / sr) / sr;
        if (ph >= 2 * Math.PI) {
          ph -= 2 * Math.PI;
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
            if (oi < headEnd + 0.012 * sr) g *= (oi - headEnd) / (0.012 * sr);
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
    const tail = Math.min(0.012 * sr, N);
    for (let i = N - tail; i < N; i++) out[i] *= (N - i) / tail;
    peakNorm(out, d);
    return out;
  }

  // ---------------------------------------------------------------- 链路 2：LPC 源-滤波器
  function lpcV5(it, span, fFn) {
    const d = it.d, ilen = d.length;
    const f0 = clamp(it.f0, 150, 600);
    const vStart = Math.round(it.vStart * sr), vEnd = Math.round(it.vEnd * sr);
    const N = Math.ceil(span * sr);
    const { out, headEnd } = renderHead(d, ilen, vStart, N, fFn, f0);
    const F = 1024, H = F >> 1, P = Math.min(26, (sr / 1000 | 0) + 6);
    let ph = 0;
    const hist = new Float64Array(P);
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
        if (oi < headEnd + 0.012 * sr) gg *= (oi - headEnd) / (0.012 * sr);
        out[oi] += gg;
      }
    }
    const tail = Math.min(0.012 * sr, N);
    for (let i = N - tail; i < N; i++) out[i] *= (N - i) / tail;
    peakNorm(out, d);
    return out;
  }
  function peakNorm(out, ref) {
    let pk = 0; for (let i = 0; i < ref.length; i++) pk = Math.max(pk, Math.abs(ref[i]));
    let ok = 0; for (let i = 0; i < out.length; i++) ok = Math.max(ok, Math.abs(out[i]));
    if (ok > 0) { const g = pk / ok; for (let i = 0; i < out.length; i++) out[i] *= g; }
  }

  // ---------------------------------------------------------------- 选声与规划
  // pool=null 表示允许跨池
  function pickUnit(midi, pool, lastItem) {
    let cand = admissible(pool).map(r => {
      let cents = 1200 * Math.log2(m2f(midi) / r.f0);
      while (cents > 600) cents -= 1200; while (cents < -600) cents += 1200;
      return { r, cents };
    });
    const inRange = cand.filter(c => {
      const rate = m2f(midi) / c.r.f0 * Math.pow(2, -Math.round(c.cents / 1200));
      return rate >= LIMITS.rateLo && rate <= LIMITS.rateHi;
    });
    if (inRange.length) cand = inRange;
    if (!cand.length) return audit.items.length ? { item: audit.items[0], cents: 0 } : null;
    cand.sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents));
    const top = cand.slice(0, 3).filter(c => c.r !== lastItem);
    const pool2 = top.length ? top : cand;
    const pick = pool2[Math.random() * pool2.length | 0];
    return { item: pick.r, cents: pick.cents };
  }

  // notes：WOW_NOTES 或自定义 [{t,dur,midi}]；text 给定时按发声字映射（一字一音）
  function plan(notes, text, strategy) {
    const seq = notes.map((g, k) => ({
      t: g[0], dur: g[1], midi: g[2],
      span: k + 1 < notes.length ? notes[k + 1][0] - g[0] : Math.min(0.5, g[1] + 0.25),
      nextMidi: k + 1 < notes.length ? notes[k + 1][2] : null
    }));
    let mapping = seq.map((v, k) => ({ v, phraseId: 0 }));
    if (text) {
      const units = textToUnits(text);
      const speakK = [];
      units.forEach((u, i) => { if (u.speak) speakK.push(i); });
      mapping = speakK.map((ui, k) => {
        const v = seq[k % seq.length];
        let phrase = 0;
        for (let j = 0; j <= ui; j++) if (units[j] && !units[j].speak) phrase++;
        return { v, phraseId: phrase, ch: units[ui].ch };
      }).filter(m => m.v);
    } else {
      // wow 真唱：以 onset 间隔 >0.25s 划分乐句
      let phrase = 0, prevT = null;
      mapping.forEach(m => { if (prevT !== null && m.v.t - prevT > 0.25) phrase++; m.phraseId = phrase; prevT = m.v.t; });
    }
    // 音色门：两池 MFCC 相似度不足 → 句内锁池（乐句首音决定池，cross 策略才生效）
    const crossAllowed = strategy === 'cross' && audit && audit.crossPoolAllowed;
    // 锁池时选准入单元更多的池作为乐句默认池
    const majorPool = admissible('angry').length >= admissible('determined').length ? 'angry' : 'determined';
    const phrasePool = {};
    let last = null;
    const voices = mapping.map(m => {
      let pool = strategy === 'angry' ? 'angry' : strategy === 'determined' ? 'determined' : null;
      if (!pool) {
        if (!crossAllowed) {
          if (phrasePool[m.phraseId] == null) phrasePool[m.phraseId] = majorPool;
          pool = phrasePool[m.phraseId];
        }
      }
      const sel = pickUnit(m.v.midi, pool, last);   // pool=null = 允许跨池
      if (!sel) return null;
      last = sel.item;
      return { ...m.v, phraseId: m.phraseId, ch: m.ch || null, item: sel.item, pool: sel.item.pool };
    }).filter(Boolean);
    return { voices, dur: seq[seq.length - 1].t + seq[seq.length - 1].dur + 0.3 };
  }

  // ---------------------------------------------------------------- 轨道渲染（8ms 同步交叉淡化，替代 v4 硬截断）
  function renderTrack(planObj, chain, prof) {
    const fn = chain === 'lpc' ? lpcV5 : psolaV5;
    const total = Math.ceil(planObj.dur * sr) + sr;
    const mix = new Float32Array(total);
    for (const v of planObj.voices) {
      const wav = fn(v.item, Math.max(0.09, v.span), makeFFn(v, prof || DEFAULT_EXPR));
      if (!wav) continue;
      const pos = Math.round(v.t * sr);
      const fade = Math.round(0.008 * sr);
      for (let i = 0; i < wav.length; i++) {
        let g = 1;
        if (i < fade) g = i / fade;
        const oi = pos + i;
        if (oi >= total) break;
        mix[oi] += wav[i] * g * 0.9;
      }
    }
    // 主输出峰值归一
    let pk = 0; for (let i = 0; i < mix.length; i++) pk = Math.max(pk, Math.abs(mix[i]));
    if (pk > 0.99) { const g = 0.95 / pk; for (let i = 0; i < mix.length; i++) mix[i] *= g; }
    const buf = ctx.createBuffer(1, mix.length, sr);
    buf.getChannelData(0).set(mix);
    return buf;
  }

  // ---------------------------------------------------------------- 第三部分：独立验证
  function measureVoice(buf, v, prof) {
    const d = buf.getChannelData(0), bsr = buf.sampleRate;
    const sco = (prof ? prof.scoopMs : 55) / 1000 + 0.03;
    const a = v.t + Math.min(sco, v.span * 0.5);
    const b = v.t + (v.span >= 0.25 ? Math.max(a + 0.02, (prof ? prof.vibOnsetFrac : 0.35) * v.span) : v.span * 0.66);
    const i0 = Math.floor(a * bsr), N = Math.min(2048, Math.floor((b - a) * bsr));
    if (N < 256) return null;
    const expF = m2f(v.midi);
    const m = cepsPitch(d, i0, N, bsr, expF);
    let cents = 1200 * Math.log2(m.f0 / expF);
    while (cents > 600) cents -= 1200; while (cents < -600) cents += 1200;
    return { cents, voiced: m.voiced, z: m.z };
  }
  function pitchMetrics(buf, voices, prof) {
    const rows = voices.map(v => ({ v, m: measureVoice(buf, v, prof) }));
    const ok = rows.filter(r => r.m && r.m.voiced);
    const errs = ok.map(r => r.m.cents);
    return {
      n: voices.length, measured: ok.length,
      rmse: Math.sqrt(mean(errs.map(x => x * x))),
      mae: mean(errs.map(Math.abs)),
      maxAbs: errs.length ? Math.max(...errs.map(Math.abs)) : null,
      grossRate: errs.filter(x => Math.abs(x) > 200).length / (errs.length || 1),
      vuvMiss: rows.filter(r => r.m && !r.m.voiced).length / (rows.filter(r => r.m).length || 1),
      perVoice: rows.map(r => ({ midi: r.v.midi, pool: r.v.pool, cents: r.m ? Math.round(r.m.cents) : null, voiced: r.m ? r.m.voiced : null }))
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
    sr, POOLS, WOW_NOTES,
    runAudit, fullReport, fitExpression,
    plan, renderTrack, pitchMetrics, identityNull, formantDrift, clickCount,
    textToUnits, psolaV5, lpcV5, cepsPitch,
    getAudit: () => audit, getReport: () => reportCache,
    async loadWow() { const d = await decode(WOW_URL); return d ? d.buf : null; }
  };
}

global.SingV5 = { create: ctx => SingV5Engine(ctx) };
})(window);
