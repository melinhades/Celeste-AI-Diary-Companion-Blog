/**
 * Secret Voice —— 复刻 Celeste「wow_so_secret」的做法。
 *
 * 结论来源（对原作采样与同 bank 的 360 条素材做同尺度测量）：
 *   原作没有任何「Madeline 歌唱系统」，也没有变声滤镜。
 *   wow_so_secret 就是一条干净干声：单条连贯录制、硬边界、48k/mono/16bit，
 *   空间感（混响）不在采样里，挂在 FMOD 事件层。
 *
 * 因此本模块只做四件事：录一条 → 量一条 → 验一条 → 按规格导一条。
 * 门限全部来自实测，见 SPEC。
 */
(function (global) {
  'use strict';

  // ---------- 验收规格（实测值 / 门限）----------
  // 参照：wow_so_secret  dur=15.909s  跨度=20.1半音(p95-p5)  voiced=0.90  底噪=-90.7dB
  //       首帧(20ms)=-108.67dB(纯数字零)  尾帧跳到-63dB  峰值RMS=-15.1dB
  // 对照：同库 360 条素材亮度比 z=-0.13 → 不校验音色，因为没有滤镜可校验
  var SPEC = {
    targetRate: 48000,
    minDurSec: 13.5,        // 参照 15.909
    minSpanSemitone: 18,    // 参照 20.1；用 p95-p5，不用 max-min（自相关哨兵值会伪造跨度）
    minVoicedRatio: 0.85,   // 参照 0.90
    maxNoiseFloorDb: -80,   // 参照 -90.7；高于此说明环境底噪或增益过大
    maxHeadFrameDb: -55,    // 参照 -108.67；起音前必须是静音而不是淡入
    headRiseMs: 120,        // 参照 38ms 即进入歌声：首帧之后这么短内就到正常电平
    maxTailFrameDb: -60,    // 参照 -63.18；结尾硬切而不是拖尾
    tailQuietMs: 80,        // 参照 <60ms：最后这么长内必须已经塌下去
    normPeakDbfs: -12       // 参照 -9.2；导出统一贴到该峰值，留动态余量
  };

  // 音高搜索边界（周期检测窗 1024 @48k 只能可靠看到 ~94Hz 以上，故下限取 120Hz）
  var PT = { win: 1024, hop: 240, fLo: 120, fHi: 500, rmsGate: 5e-4, acTh: 0.35 };

  // ---------- 基础工具 ----------
  function db(v) { return 20 * Math.log10(v + 1e-9); }

  function rms(buf) {
    var s = 0;
    for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / (buf.length || 1));
  }

  /** 线性重采样。原作规格是 48kHz，麦克风常给 44.1k/48k，统一在这里对齐。 */
  function resampleLinear(src, fromRate, toRate) {
    if (fromRate === toRate) return src;
    var ratio = toRate / fromRate;
    var outLen = Math.max(1, Math.round(src.length * ratio));
    var out = new Float32Array(outLen);
    for (var i = 0; i < outLen; i++) {
      var p = i / ratio;
      var i0 = Math.floor(p), i1 = Math.min(i0 + 1, src.length - 1);
      var f = p - i0;
      out[i] = src[i0] * (1 - f) + src[i1] * f;
    }
    return out;
  }

  /** 混降单声道；原作采样是单声道。 */
  function toMono(input) {
    var n = input.numberOfChannels;
    if (n === 1) return input.getChannelData(0);
    var out = new Float32Array(input.length);
    for (var c = 0; c < n; c++) {
      var d = input.getChannelData(c);
      for (var i = 0; i < input.length; i++) out[i] += d[i];
    }
    for (var i = 0; i < out.length; i++) out[i] /= n;
    return out;
  }

  /** 打包 48k/mono/16bit WAV；不做任何淡入淡出（硬边界是规格的一部分）。 */
  function encodeWav(samples, rate) {
    var len = samples.length;
    var buf = new ArrayBuffer(44 + len * 2);
    var v = new DataView(buf);
    function str(off, s) { for (var i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, len * 2, true);
    var peak = 0;
    for (var i = 0; i < len; i++) { var a = Math.abs(samples[i]); if (a > peak) peak = a; }
    var g = peak > 0 ? Math.pow(10, SPEC.normPeakDbfs / 20) / peak : 1;
    for (var i = 0; i < len; i++) {
      var s = Math.max(-1, Math.min(1, samples[i] * g));
      v.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // ---------- 音高轨迹 ----------
  /** 单帧自相关基频；返回 Hz 或 null（比 python 原型收紧了下限，见 PT 注释）。 */
  function frameF0(x, start, sr) {
    var win = PT.win;
    if (start + win > x.length) return null;
    var mean = 0;
    for (var i = 0; i < win; i++) mean += x[start + i];
    mean /= win;
    var e = 0;
    for (var i = 0; i < win; i++) { var d = x[start + i] - mean; e += d * d; }
    e = Math.sqrt(e / win);
    if (e < PT.rmsGate) return null;

    var lo = Math.floor(sr / PT.fHi), hi = Math.ceil(sr / PT.fLo);
    var best = -1, bestLag = 0, r0 = 1e-12;
    for (var lag = lo; lag <= hi && lag < win; lag++) {
      var num = 0, da = 0, db2 = 0;
      for (var i = 0; i < win - lag; i++) {
        var a = x[start + i] - mean, b = x[start + i + lag] - mean;
        num += a * b; da += a * a; db2 += b * b;
      }
      var norm = num / (Math.sqrt(da * db2) + 1e-12);
      if (lag === lo) r0 = 1;
      if (norm > best) { best = norm; bestLag = lag; }
    }
    if (best < PT.acTh || bestLag === 0) return null;
    return sr / bestLag;
  }

  /** 整条轨迹：等间隔帧，未判浊音记 null（绝不压缩数组，否则时间轴会错位）。 */
  function pitchTrack(x, sr) {
    var hop = PT.hop, out = [];
    for (var s = 0; s + PT.win <= x.length; s += hop) out.push({ t: s / sr, f0: frameF0(x, s, sr) });
    return out;
  }

  // ---------- 测量 ----------
  /** 一次性算出全部验收指标。跨度用 p95-p5，底噪用「最安静 2% 帧」而不是全局最小。 */
  function measure(x, sr) {
    var frameMs = 20, fl = Math.max(1, Math.round(sr * frameMs / 1000));
    var envDb = [], peakDb = -Infinity;
    for (var s = 0; s + fl <= x.length; s += fl) {
      var d = db(rms(x.subarray(s, s + fl)));
      envDb.push(d);
      if (d > peakDb) peakDb = d;
    }
    var track = pitchTrack(x, sr);
    var voiced = 0, st = [];
    for (var i = 0; i < track.length; i++) if (track[i].f0) { voiced++; st.push(12 * Math.log2(track[i].f0 / 440) + 69); }
    st.sort(function (a, b) { return a - b; });

    var sorted = envDb.slice().sort(function (a, b) { return a - b; });
    var floor = sorted.length ? sorted[Math.floor(sorted.length * 0.02)] : -Infinity;

    // 亮度比：4-12k / 1-4k，逐帧中位。帧长不补窗，短素材取 min(2048, 长度) 的 2 的幂。
    var win = Math.min(2048, x.length);
    win = 1 << Math.floor(Math.log2(Math.max(128, win)));
    var bright = brightness(x, sr, win);

    return {
      durSec: x.length / sr,
      rate: sr,
      peakDb: peakDb,
      noiseFloorDb: floor,
      headFrameDb: envDb.length ? envDb[0] : -Infinity,
      tailFrameDb: envDb.length ? envDb[envDb.length - 1] : -Infinity,
      lastLoudSec: lastLoudSec(envDb, 20),
      spanSt: st.length > 20 ? pct(st, 0.95) - pct(st, 0.05) : 0,
      spanRawSt: st.length > 20 ? st[st.length - 1] - st[0] : 0,
      centsMAD: st.length > 20 ? mad(st) : 0,
      voicedRatio: track.length ? voiced / track.length : 0,
      frames: track.length,
      brightDb: bright,
      track: track,
      envDb: envDb,
      frameMs: frameMs
    };
  }

  function pct(sorted, q) {
    if (!sorted.length) return 0;
    var i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
    return sorted[i];
  }

  /** 从尾部往前数，最后一个高于「峰值-40dB」的帧之后还剩多少秒静音。原作接近 0（硬截断）。 */
  function lastLoudSec(envDb, frameMs) {
    if (!envDb.length) return 0;
    var pk = -Infinity;
    for (var i = 0; i < envDb.length; i++) if (envDb[i] > pk) pk = envDb[i];
    var gate = pk - 40;
    for (var i = envDb.length - 1; i >= 0; i--) if (envDb[i] >= gate) return (envDb.length - 1 - i) * frameMs / 1000;
    return 0;
  }

  function mad(st) {
    var med = pct(st, 0.5), d = st.map(function (v) { return Math.abs(v - med); });
    d.sort(function (a, b) { return a - b; });
    return pct(d, 0.5) * 100;
  }

  function brightness(x, sr, win) {
    var hop = Math.max(1, win >> 2), acc = [];
    var lo1 = Math.floor(win / 2) + 1, fr = new Float64Array(lo1);
    for (var i = 0; i < lo1; i++) fr[i] = i * sr / win;
    for (var s = 0; s + win <= x.length; s += hop) {
      var e = 0;
      for (var i = 0; i < win; i++) { var vv = x[s + i]; e += vv * vv; }
      if (Math.sqrt(e / win) < PT.rmsGate) continue;
      var seg = new Float64Array(win);
      for (var i = 0; i < win; i++) { var w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (win - 1)); seg[i] = x[s + i] * w; }
      var sp = rfftPower(seg);
      var mid = 0, hi = 0;
      for (var k = 0; k < lo1; k++) {
        if (fr[k] >= 1000 && fr[k] < 4000) mid += sp[k];
        else if (fr[k] >= 4000 && fr[k] < 12000) hi += sp[k];
      }
      acc.push(10 * Math.log10((hi + 1e-12) / (mid + 1e-12)));
    }
    if (!acc.length) return NaN;
    acc.sort(function (a, b) { return a - b; });
    return pct(acc, 0.5);
  }

  /** 迭代 radix-2 实数 FFT 功率谱（长度必须是 2 的幂）。 */
  function rfftPower(re) {
    var n = re.length, out = new Float64Array(n * 2);
    for (var i = 0; i < n; i++) out[i * 2] = re[i];
    fftInPlace(out, n);
    var p = new Float64Array(n / 2 + 1);
    for (var k = 0; k <= n / 2; k++) {
      var a = out[k * 2], b = out[k * 2 + 1];
      p[k] = a * a + b * b;
    }
    return p;
  }

  function fftInPlace(a, n) {
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var t = a[2 * i]; a[2 * i] = a[2 * j]; a[2 * j] = t;
        t = a[2 * i + 1]; a[2 * i + 1] = a[2 * j + 1]; a[2 * j + 1] = t;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wr = Math.cos(ang), wi = Math.sin(ang);
      for (var i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (var k = 0; k < len / 2; k++) {
          var ar = a[2 * (i + k)], ai = a[2 * (i + k) + 1];
          var br = a[2 * (i + k + len / 2)], bi = a[2 * (i + k + len / 2) + 1];
          var xr = br * cr - bi * ci, xi = br * ci + bi * cr;
          a[2 * (i + k)] = ar + xr; a[2 * (i + k) + 1] = ai + xi;
          a[2 * (i + k + len / 2)] = ar - xr; a[2 * (i + k + len / 2) + 1] = ai - xi;
          var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  // ---------- 判定 ----------
  /** 逐条对照 SPEC。level: pass / warn / fail。warn 用于「能过但明显偏离原作」。 */
  function verify(m) {
    var S = SPEC, r = [];
    function add(name, ok, got, need, level, note) {
      r.push({ name: name, ok: !!ok, got: got, need: need, level: level, note: note || '' });
    }
    add('时长', m.durSec >= S.minDurSec, m.durSec.toFixed(2) + 's', '>=' + S.minDurSec + 's',
        m.durSec >= S.minDurSec ? 'pass' : 'fail', '原作 15.91s 一口气一条录完');
    add('音域跨度', m.spanSt >= S.minSpanSemitone, m.spanSt.toFixed(1) + '半音', '>=' + S.minSpanSemitone + '半音',
        m.spanSt >= S.minSpanSemitone ? 'pass' : 'fail', 'p95-p5；原作 20.1（max-min 会被哨兵值伪造，不可用）');
    add('连贯度', m.voicedRatio >= S.minVoicedRatio, m.voicedRatio.toFixed(2), '>=' + S.minVoicedRatio,
        m.voicedRatio >= S.minVoicedRatio ? 'pass' : 'fail', '原作 0.90；断句碎唱就不是这个做法');
    add('底噪', m.noiseFloorDb <= S.maxNoiseFloorDb, m.noiseFloorDb.toFixed(1) + 'dB', '<=' + S.maxNoiseFloorDb + 'dB',
        m.noiseFloorDb <= S.maxNoiseFloorDb ? 'pass' : 'fail', '原作 -90.7dB 干净录音室干声');
    add('硬起音', m.headFrameDb <= S.maxHeadFrameDb, m.headFrameDb.toFixed(1) + 'dB', '<=' + S.maxHeadFrameDb + 'dB',
        m.headFrameDb <= S.maxHeadFrameDb ? 'pass' : 'fail', '原作首帧 -108.67dB 纯零；淡入=做法错了');
    add('硬收尾', m.tailFrameDb <= S.maxTailFrameDb, m.tailFrameDb.toFixed(1) + 'dB', '<=' + S.maxTailFrameDb + 'dB',
        m.tailFrameDb <= S.maxTailFrameDb ? 'pass' : 'warn', '原作 15.84s 跳到 -63dB 后文件结束（混响不烘进采样）');
    add('尾巴无多余静音', m.lastLoudSec <= S.tailQuietMs / 1000, m.lastLoudSec.toFixed(2) + 's', '<=' + (S.tailQuietMs / 1000) + 's',
        m.lastLoudSec <= S.tailQuietMs / 1000 ? 'pass' : 'warn', '唱完立刻按停；拖尾静音会让触发时机不准');
    add('采样率', m.rate === S.targetRate, m.rate + 'Hz', S.targetRate + 'Hz',
        m.rate === S.targetRate ? 'pass' : 'warn', '导出会重采样到 48k，这里只是记录原始值');
    var fails = r.filter(function (x) { return x.level === 'fail'; }).length;
    return { rows: r, fails: fails, pass: fails === 0 };
  }

  // ---------- 事件层混响（预览用，绝不进导出）----------
  /** 指数衰减噪声脉冲响应。原作采样里没有混响，空间感挂在播放层，所以这里只做预览。 */
  function makeImpulse(ctx, seconds, decay) {
    var len = Math.max(1, Math.round(ctx.sampleRate * seconds));
    var ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c);
      for (var i = 0; i < len; i++) {
        var t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.005 ? 0.3 : 1);
      }
    }
    return ir;
  }

  // ---------- 录制 ----------
  function Recorder(ctx) {
    this.ctx = ctx;
    this.chunks = [];
    this.total = 0;
    this.streamRate = 0;
    this.live = { frames: 0, voiced: 0, pitches: [], cur: null, spanSt: 0 };
    this.node = null;
    this.source = null;
    this.stream = null;
  }
  Recorder.prototype.start = function (onLevel) {
    var self = this;
    return navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      self.stream = stream;
      self.streamRate = self.ctx.sampleRate;
      self.source = self.ctx.createMediaStreamSource(stream);
      var proc = self.ctx.createScriptProcessor(2048, 1, 1);
      self.node = proc;
      proc.onaudioprocess = function (ev) {
        var inp = ev.inputBuffer.getChannelData(0);
        var copy = new Float32Array(inp.length);
        copy.set(inp);
        self.chunks.push(copy);
        self.total += copy.length;
        // 实时音高：每块测一次，给「跨度够不够」的即时反馈
        var f0 = frameF0(copy, 0, self.streamRate);
        var lv = rms(inp);
        if (f0) {
          self.live.voiced++;
          self.live.cur = f0;
          var st = 12 * Math.log2(f0 / 440) + 69;
          self.live.pitches.push(st);
          if (self.live.pitches.length > 4000) self.live.pitches.shift();
          // 滚动跨度：取最近 400 个浊音值的 p95-p5，与离线度量同一口径
          var w2 = self.live.pitches.slice(-400).sort(function (a, b) { return a - b; });
          self.live.spanSt = w2.length > 20 ? (w2[Math.round(0.95 * (w2.length - 1))] - w2[Math.round(0.05 * (w2.length - 1))]) : 0;
        }
        self.live.frames++;
        if (onLevel) onLevel(lv, f0, self.live);
      };
      self.source.connect(proc);
      proc.connect(self.ctx.destination);
      return stream;
    });
  };
  Recorder.prototype.stop = function () {
    var self = this;
    if (this.node) { try { this.source.disconnect(); this.node.disconnect(); } catch (e) {} }
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    var len = this.total, out = new Float32Array(len), o = 0;
    for (var i = 0; i < this.chunks.length; i++) { out.set(this.chunks[i], o); o += this.chunks[i].length; }
    this.chunks = []; this.total = 0;
    var rate = this.streamRate || this.ctx.sampleRate;
    return { samples: out, rate: rate };
  };
  Recorder.prototype.reset = function () {
    this.chunks = []; this.total = 0;
    this.live = { frames: 0, voiced: 0, pitches: [], cur: null, spanSt: 0 };
  };

  global.SecretVoice = {
    SPEC: SPEC, PT: PT,
    measure: measure,
    verify: verify,
    pitchTrack: pitchTrack,
    frameF0: frameF0,
    resampleLinear: resampleLinear,
    toMono: toMono,
    encodeWav: encodeWav,
    makeImpulse: makeImpulse,
    Recorder: Recorder,
    db: db,
    rms: rms
  };
})(window);
