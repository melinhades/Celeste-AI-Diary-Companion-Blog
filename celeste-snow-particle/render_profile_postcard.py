# -*- coding: utf-8 -*-
"""
用 profile 的真实 postcard.webp 当底，tagline "Every step up the mountain is a word in your story." 写进左半写信区。
严格沿用 profile 的明信片形态（859×583 米黄纸 + 已有邮戳/虚线/地址线不动）。
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, textwrap

SRC_PC    = r"c:\Users\28464\IdeaProjects\blog\github-profile\melinhades\assets\postcard.webp"
FONT_REN  = r"c:\Users\28464\IdeaProjects\blog\blog-ui\celeste-font-en\Renogare-Regular.otf"
# 手写感备用
FONT_ITAL = r"C:\Windows\Fonts\timesi.ttf"

OUT  = r"c:\Users\28464\IdeaProjects\blog\assets\readme\tagline-postcard.png"
OUT2 = r"c:\Users\28464\IdeaProjects\blog\celeste-snow-particle\tagline-postcard.png"

# -------- 1. 底图：直接用 profile 明信片 --------
base = Image.open(SRC_PC).convert("RGBA")
W, H = base.size
print(f"底图 profile 明信片: {W}x{H}")

# -------- 2. 写字区：左半写信区（避开右侧收件栏） --------
# profile 明信片经典布局：右 40% 是收件栏（虚线分隔+邮票框），左 60% 是写信区
WRITE_LEFT   = int(W * 0.08)   # 8% 左边距
WRITE_RIGHT  = int(W * 0.55)  # 55% 右边距（虚线分隔大约在这）
WRITE_TOP    = int(H * 0.28)  # 28% 顶部（避开邮戳）
WRITE_BOTTOM = int(H * 0.82)  # 82% 底部
WRITE_W      = WRITE_RIGHT - WRITE_LEFT

# -------- 3. 字体（Renogare 游戏风 + 冷棕墨水色，在米色纸上像真印刷字） --------
TEXT = "Every step up the mountain is a word in your story."

# 字号自适应写字区宽度：尽量大，能容纳就单行，容纳不下就两行
FONT_SIZE_TRIES = [34, 32, 30, 28, 26, 24]

def try_fit(font_path, size, text, max_w):
    fnt = ImageFont.truetype(font_path, size)
    bbox = fnt.getbbox(text)
    tw = bbox[2] - bbox[0]
    return fnt, tw

# 优先单行，试试不同字号
FONT, USE_SIZE = None, None
for size in FONT_SIZE_TRIES:
    fnt, tw = try_fit(FONT_ITAL, size, TEXT, WRITE_W)
    if tw <= WRITE_W:
        FONT, USE_SIZE = fnt, size
        break
if FONT is None:
    FONT, USE_SIZE = ImageFont.truetype(FONT_ITAL, 22), 22

# 如果用 Renogare（更硬气，Celeste 标题感）
# 或者 Times Italic（更像手写明信片）——用户要 tagline，用 Italic 更合适
print(f"字体: Times Italic {USE_SIZE}px, 写字区 {WRITE_W}px, 文本宽 {FONT.getbbox(TEXT)[2] - FONT.getbbox(TEXT)[0]}px")

# -------- 4. 分两行（明信片 tagline 太长不挤） --------
# "Every step up the mountain\nis a word in your story."
LINES = ["Every step up the mountain", "is a word in your story."]

INK_COLOR   = (90, 75, 60, 255)     # 冷棕墨水（米色纸上好看）
INK_SHADOW  = (0, 0, 0, 60)          # 轻微阴影（让字有印刷感）

# 测行高
line_h = FONT.getbbox("Ag")[3] - FONT.getbbox("Ag")[1]  # 近似行高
GAP    = int(line_h * 0.3)                               # 行间距

# 垂直居中在写字区
total_text_h = line_h * len(LINES) + GAP * (len(LINES) - 1)
cur_y = WRITE_TOP + (WRITE_BOTTOM - WRITE_TOP - total_text_h) // 2

# -------- 5. 阴影 + 主字层 --------
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)

tx = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tx)

for line in LINES:
    lw = FONT.getbbox(line)[2] - FONT.getbbox(line)[0]
    lx = WRITE_LEFT + (WRITE_W - lw) // 2   # 每行居中

    # 阴影
    sd.text((lx + 2, cur_y + 2), line, fill=INK_SHADOW, font=FONT)
    # 主字
    td.text((lx, cur_y), line, fill=INK_COLOR, font=FONT)
    cur_y += line_h + GAP

shadow = shadow.filter(ImageFilter.GaussianBlur(radius=2))
base = Image.alpha_composite(base, shadow)
base = Image.alpha_composite(base, tx)

# -------- 6. 保存（替换 assets/readme/tagline-postcard.png） --------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
base.convert("RGB").save(OUT, "PNG", optimize=True)
base.convert("RGB").save(OUT2, "PNG", optimize=True)
print(f"→ {OUT}   {os.path.getsize(OUT):,} bytes  {W}×{H}")
print(f"写字区: x={WRITE_LEFT}-{WRITE_RIGHT}  y={WRITE_TOP}-{WRITE_BOTTOM}")