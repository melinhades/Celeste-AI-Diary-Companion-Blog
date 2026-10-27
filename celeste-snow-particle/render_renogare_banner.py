# -*- coding: utf-8 -*-
"""
用户截图 (2532×1398, 深蓝底) + Renogare 字体 bake 两行文字 → 覆盖 header-banner.png
Renogare 是 Celeste 游戏标题字体，项目里已有 blog-ui/celeste-font-en/Renogare-Regular.otf
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

SRC  = r"C:\Users\28464\Pictures\联想安卓照片\Screenshots\屏幕截图 2026-10-27 173226.png"
FONT = r"c:\Users\28464\IdeaProjects\blog\blog-ui\celeste-font-en\Renogare-Regular.otf"
OUT  = r"c:\Users\28464\IdeaProjects\blog\assets\readme\header-banner.png"
OUT2 = r"c:\Users\28464\IdeaProjects\blog\celeste-snow-particle\header-banner.png"

# -------- 1. 加载底图 --------
base = Image.open(SRC).convert("RGBA")
W, H = base.size
print(f"底图 {W}×{H}")

# -------- 2. 加载 Renogare --------
# Renogare 是 Celeste 标题字体，用大写更接近游戏风格
# 字号按底图高度比例
BIG_SIZE  = int(H * 0.12)   # 主标题 ~12% 高
SMALL_SIZE = int(H * 0.04)  # tagline  ~4% 高
try:
    FONT_BIG    = ImageFont.truetype(FONT, BIG_SIZE)
    FONT_SMALL  = ImageFont.truetype(FONT, SMALL_SIZE)
    FONT_SMALL_I= ImageFont.truetype(FONT, int(SMALL_SIZE * 0.85))
    print(f"Renogare 加载 OK: BIG={BIG_SIZE} SMALL={SMALL_SIZE}")
except Exception as e:
    print(f"Renogare 失败: {e}，回退 Arial")
    FONT_BIG    = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", BIG_SIZE)
    FONT_SMALL  = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf",   SMALL_SIZE)
    FONT_SMALL_I= FONT_SMALL

# -------- 3. 文字（跟之前 banner 保持一致） --------
TEXT_BIG  = "CELESTE AI DIARY COMPANION BLOG"
TEXT_SM   = "EVERY STEP UP THE MOUNTAIN IS A WORD IN YOUR STORY."

def text_size(font, text):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

bw, bh = text_size(FONT_BIG,   TEXT_BIG)
sw, sh = text_size(FONT_SMALL, TEXT_SM)

# -------- 4. 字放中间偏上（避开截图里可能有的底部内容） --------
# 垂直排布：主标题居中，tagline 在其下方
TITLE_CENTER_Y = int(H * 0.38)          # 主标题中心在 38% 高处
by = TITLE_CENTER_Y - bh // 2
bx = (W - bw) // 2

sy = by + bh + int(H * 0.025)           # 主标题下 2.5% 间距
sx = (W - sw) // 2

# -------- 5. 阴影层（深色偏移 + 模糊，保证在任何底上清晰） --------
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
# 主标题阴影（厚一点模糊）
sd.text((bx + 6, by + 6), TEXT_BIG,  fill=(0, 0, 0, 180), font=FONT_BIG)
sd.text((sx + 4, sy + 4), TEXT_SM,   fill=(0, 0, 0, 140), font=FONT_SMALL)
shadow = shadow.filter(ImageFilter.GaussianBlur(radius=5))

# -------- 6. 主文字层 --------
tx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tx)
# Renogare 白色，加一点光晕感
td.text((bx, by), TEXT_BIG, fill=(255, 255, 255, 255), font=FONT_BIG)
td.text((sx, sy), TEXT_SM,  fill=(230, 240, 255, 240), font=FONT_SMALL)

# -------- 7. 合成 --------
base = Image.alpha_composite(base, shadow)
base = Image.alpha_composite(base, tx)

# -------- 8. 保存（覆盖 assets/readme/header-banner.png） --------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
base.convert("RGB").save(OUT, "PNG", optimize=True)
base.convert("RGB").save(OUT2, "PNG", optimize=True)
print(f"→ {OUT}   {os.path.getsize(OUT):,} bytes  {W}×{H}")
print(f"→ {OUT2}  同内容副本")
print(f"主标题 Renogare {BIG_SIZE}px  中心 {TITLE_CENTER_Y}px")
print(f"tagline Renogare {SMALL_SIZE}px  下 {H*0.025:.1f}%")