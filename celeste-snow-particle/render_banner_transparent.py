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
