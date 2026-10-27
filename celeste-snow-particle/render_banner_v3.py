# -*- coding: utf-8 -*-
"""
用户给的 wordmark 截图 (781×66, 深蓝底+亮紫灰字, 宽字距) 作为字效模板：
1. 把 wordmark 抠底（深蓝→透明），保留亮字
2. 缩放到 banner 合适宽度，居中贴到 banner 截图上
3. tagline 用 Renogare 照着 wordmark 的字色 (210,200,255) + 宽字距重写

效果是用户已认证过的字效，不自己瞎调字体参数。
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, os

SRC_BANNER  = r"C:\Users\28464\Pictures\联想安卓照片\Screenshots\屏幕截图 2026-10-27 173226.png"
SRC_WM      = r"C:\Users\28464\Pictures\联想安卓照片\Screenshots\屏幕截图 2026-10-27 173746.png"
FONT        = r"c:\Users\28464\IdeaProjects\blog\blog-ui\celeste-font-en\Renogare-Regular.otf"
OUT         = r"c:\Users\28464\IdeaProjects\blog\assets\readme\header-banner.png"
OUT2        = r"c:\Users\28464\IdeaProjects\blog\celeste-snow-particle\header-banner.png"

# -------- 1. 抠 wordmark：深蓝底 → 透明，亮字保留 --------
wm = Image.open(SRC_WM).convert("RGB")
wm_arr = np.array(wm).astype(np.float32)
bright = np.mean(wm_arr, axis=2)            # 亮度
# 背景是 ~18，字是 ~220；中间是抗锯齿过渡
# alpha = clamp((bright - 60) / 160, 0, 1) 把背景全透明，字保留
alpha = np.clip((bright - 55) / 170, 0, 1) * 255
alpha = alpha.astype(np.uint8)
wm_rgba = np.dstack([wm_arr.astype(np.uint8), alpha])
wm_clean = Image.fromarray(wm_rgba, "RGBA")
print(f"wordmark 抠底后: {wm_clean.size}, 字色 {tuple(wm_arr[27,30].astype(int))}")

# -------- 2. banner 底图 --------
base = Image.open(SRC_BANNER).convert("RGBA")
W, H = base.size

# -------- 3. 缩放 wordmark 到 banner 宽度的 ~65%，居中 --------
TARGET_W = int(W * 0.65)
ratio = TARGET_W / wm_clean.width
TARGET_H = int(wm_clean.height * ratio)
wm_big = wm_clean.resize((TARGET_W, TARGET_H), Image.LANCZOS)
# 贴到画面中间偏上
x = (W - TARGET_W) // 2
y = int(H * 0.38) - TARGET_H // 2
base.alpha_composite(wm_big, dest=(x, y))
print(f"主标题贴到 ({x},{y}), 尺寸 {TARGET_W}×{TARGET_H}")

# -------- 4. tagline：用 wordmark 同款字色 + Renogare + 宽字距 --------
TEXT_SM = "EVERY STEP UP THE MOUNTAIN IS A WORD IN YOUR STORY."
# 量 wordmark 的字色（均值）
fg_color = tuple(wm_arr[bright > 180].mean(axis=0).astype(int))
print(f"tagline 字色（wordmark 采样均值）: {fg_color}")

# 字号按 banner 高度比例
SM_SIZE = int(H * 0.038)
FONT_SM = ImageFont.truetype(FONT, SM_SIZE)

def text_size(font, text):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

sw, sh = text_size(FONT_SM, TEXT_SM)

# 字间距：模拟 wordmark 的宽字距（gap ≈ 字宽 * 1.6）
# wordmark 单字宽 ~12px，间隙 ~20px → gap = 字宽 * 1.67
LETTER_GAP = int(SM_SIZE * 0.55)     # 比例匹配 wordmark 字宽:间隙 ≈ 1:1.6

# 先写阴影层，再写字
# tagline 放在主标题正下方
main_bottom_y = y + TARGET_H
sy = main_bottom_y + int(H * 0.02)

# 阴影（深蓝 banner 上字要清晰，阴影稍重）
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
cur_x = (W - (sw + LETTER_GAP * (len(TEXT_SM) - 1))) // 2
for ch in TEXT_SM:
    sd.text((cur_x + 3, sy + 3), ch, fill=(0, 0, 0, 160), font=FONT_SM)
    ch_w = FONT_SM.getbbox(ch)[2] - FONT_SM.getbbox(ch)[0]
    cur_x += ch_w + LETTER_GAP
shadow = shadow.filter(ImageFilter.GaussianBlur(radius=4))

tx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tx)
cur_x = (W - (sw + LETTER_GAP * (len(TEXT_SM) - 1))) // 2
for ch in TEXT_SM:
    td.text((cur_x, sy), ch, fill=fg_color + (235,), font=FONT_SM)
    ch_w = FONT_SM.getbbox(ch)[2] - FONT_SM.getbbox(ch)[0]
    cur_x += ch_w + LETTER_GAP

base = Image.alpha_composite(base, shadow)
base = Image.alpha_composite(base, tx)
print(f"tagline 主色 {fg_color}, 字号 {SM_SIZE}px, 字间距 {LETTER_GAP}px")

# -------- 5. 保存 --------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
base.convert("RGB").save(OUT, "PNG", optimize=True)
base.convert("RGB").save(OUT2, "PNG", optimize=True)
print(f"→ {OUT}   {os.path.getsize(OUT):,} bytes  {W}×{H}")