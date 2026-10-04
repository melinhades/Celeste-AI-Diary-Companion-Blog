"""Measure f0 + RMS of every Madeline blip WAV, bake into js/blip_data.js.
Method: mono mix, middle 60%, numpy normalized autocorrelation (80-700Hz),
parabolic interpolation around peak. Much more reliable than the crude
in-browser autocorrelation that caused chipmunk/metallic artifacts.
"""
import os, json, wave
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sounds")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "js", "blip_data.js")

def analyze(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        n = w.getnframes()
        ch = w.getnchannels()
        raw = w.readframes(n)
    x = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    s0, s1 = int(len(x) * 0.2), int(len(x) * 0.8)
    seg = x[s0:s1]
    if len(seg) < 2048:
        seg = x
    rms = float(np.sqrt(np.mean(seg * seg)))
    seg = seg - seg.mean()
    lo, hi = int(sr / 700), int(sr / 80)  # 80..700 Hz
    hi = min(hi, len(seg) - 2)
    ac = np.correlate(seg, seg, mode="full")[len(seg) - 1:]
    if ac[0] <= 1e-9:
        return None, rms
    region = ac[lo:hi] / ac[0]
    best = int(np.argmax(region)) + lo
    # parabolic interpolation for sub-sample lag
    if 0 < best < len(ac) - 1:
        y0, y1, y2 = ac[best - 1], ac[best], ac[best + 1]
        den = y0 - 2 * y1 + y2
        if abs(den) > 1e-12:
            best = best + 0.5 * (y0 - y2) / den
    f0 = float(sr / best)
    # sanity: peak strength
    strength = float(region[int(best) - lo] if int(best) - lo < len(region) else 0)
    if strength < 0.25:  # unpitched (breath/consonant) — mark unreliable
        return None, rms
    return round(f0, 2), rms

data = {}
for emo in sorted(os.listdir(ROOT)):
    emo_dir = os.path.join(ROOT, emo)
    if not os.path.isdir(emo_dir):
        continue
    entries = {}
    for grp in sorted(os.listdir(emo_dir)):
        grp_dir = os.path.join(emo_dir, grp)
        if not os.path.isdir(grp_dir):
            continue
        for fn in sorted(os.listdir(grp_dir)):
            if not fn.lower().endswith(".wav"):
                continue
            f0, rms = analyze(os.path.join(grp_dir, fn))
            entries[f"{grp}/{fn}"] = {"f0": f0, "rms": round(rms, 5)}
    if entries:
        data[emo] = entries

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write("// 离线精确测频（Python numpy 自相关+抛物线插值），替代浏览器端粗略测频\n")
    f.write("// f0=null 表示该 blip 无明显基频（气声/辅音），运行时跳过不用于长音\n")
    f.write("window.BLIP_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")

total = sum(len(v) for v in data.values())
nulls = sum(1 for v in data.values() for e in v.values() if e["f0"] is None)
print(f"emotions={len(data)} files={total} unpitched={nulls}")
for emo, entries in data.items():
    f0s = [e["f0"] for e in entries.values() if e["f0"]]
    if f0s:
        import statistics
        print(f"  {emo}: n={len(f0s)} median={statistics.median(f0s):.1f}Hz range={min(f0s):.0f}-{max(f0s):.0f}")
