# -*- coding: utf-8 -*-
"""
banner 抠背景 → 输出明暗双版本:
  header-banner.png       深色文字/雪花, 透明底  (浅色主题用)
  header-banner-dark.png  白色文字/雪花, 透明底  (深色主题用)
源图用桌面原始文件(含蓝紫底), 因为仓库里的已被上一版脚本改写过。
"""
from PIL import Image
import numpy as np, os

SRC = r"C:\Users\28464\Desktop\1793094663414.png"
OUT_LIGHT = r"c:\Users\28464\IdeaProjects\blog\assets\readme\header-banner.png"
OUT_DARK  = r"c:\Users\28464\IdeaProjects\blog\assets\readme\header-banner-dark.png"

T1, T2 = 20, 60          # 更紧的阈值, 干掉紫色残影

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(np.int16)
mx = a.max(axis=2); mn = a.min(axis=2)
d = mx - mn

alpha = np.clip((T2 - d) / (T2 - T1), 0.0, 1.0) ** 2.0     # 幂次压掉半透明鬼影
bright = mx / 255.0
alpha = alpha * np.clip((bright - 0.30) / 0.20, 0.0, 1.0)  # 暗背景直接透明

# 轻微清噪: alpha < 0.15 的直接归零
alpha[alpha < 0.15] = 0.0

# 雪花点已全部移除（用户确认无雪花更干净好看）。
# 脚本追加的 120 点层已删；以下为去除**源图本身**烤入的残留雪花：
# 连通域几何判定 —— 雪花 = bbox ≤28px 的小团块；'i'/'j' 的 tittle 也是小团块，
# 但它位于某个大字母正上方（x 对齐、垂直间距 ≤25、且大字母在其下方），予以保留。
# （下限安全：tagline 最小字母 bbox 高 42px，最大雪花 23×23。）
import scipy.ndimage as ndi
binary = alpha > 0.0
lab, n = ndi.label(binary)
sz = np.bincount(lab.ravel())
large_ids = [L for L in range(1, n + 1) if sz[L] >= 300]
large_boxes = []
for L in large_ids:
    lys, lxs = np.where(lab == L)
    large_boxes.append((lxs.min(), lxs.max(), lys.min(), lys.max()))
remove_mask = np.zeros_like(binary)
for i in range(1, n + 1):
    if sz[i] == 0:
        continue
    ys, xs = np.where(lab == i)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    if (x1 - x0 + 1) > 28 or (y1 - y0 + 1) > 28:
        continue
    protected = False
    for (lx0, lx1, ly0, ly1) in large_boxes:
        if lx0 - 15 <= x0 and x1 <= lx1 + 15 and 0 <= ly0 - y1 <= 25:
            protected = True
            break
    if not protected:
        remove_mask[lab == i] = True
alpha[remove_mask] = 0.0

A = (alpha * 255).astype(np.uint8)

# ---- 深色主题版: 保留原白字 ----
white = np.full_like(a, 255, dtype=np.uint8)
dark_bg = np.dstack([white, A])
Image.fromarray(dark_bg, "RGBA").save(OUT_DARK, "PNG", optimize=True)

# ---- 浅色主题版: 所有不透明像素染成深藏青 (22,38,72) ----
navy = np.zeros_like(a, dtype=np.uint8)
navy[..., 0] = 22; navy[..., 1] = 38; navy[..., 2] = 72
light_bg = np.dstack([navy, A])
Image.fromarray(light_bg, "RGBA").save(OUT_LIGHT, "PNG", optimize=True)

for p in (OUT_LIGHT, OUT_DARK):
    print(f"OK {p} {os.path.getsize(p):,} bytes")
print(f"不透明: {(alpha > 0.95).mean()*100:.1f}%  透明: {(alpha == 0).mean()*100:.1f}%")
