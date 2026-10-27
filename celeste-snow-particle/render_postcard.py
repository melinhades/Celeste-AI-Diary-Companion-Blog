# -*- coding: utf-8 -*-
"""
借鉴 profile 的明信片（github-profile/melinhades/assets/postcard.webp）
渲染根 README banner 下方的 tagline —— 一句话塞进明信片里。

参考：profile postcard.webp 859×583 米黄纸色 圆角 RGBA
       根 README 原 tagline: t002.webp 452px 宽，内容 'Every step up the mountain is a word in your story.'

输出：assets/readme/tagline-postcard.png —— 替换 t002.webp 的引用
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, os

# -------- 尺寸（放大到和 banner 同宽的 ~760px 级） --------
W, H = 760, 510          # 1.49 比例，接近 profile 的 1.473
RADIUS = 38              # 圆角半径

# -------- 颜色（对齐 profile 明信片采样） --------
PAPER   = (241, 230, 225, 255)    # 米色主体（采样中心 241,230,225）
PAPER_H = (230, 217, 204, 255)    # 左上角米黄（高光）
PAPER_L = (216, 178, 175, 255)    # 顶部偏深（阴影）
BORDER  = (120, 110, 100, 255)    # 边框（冷棕）
STAMP   = (200,  80,  80, 220)    # 邮戳红
INK     = ( 45,  40,  38, 255)    # 正文深棕（不是纯黑，更温柔）
INK_SM  = (110,  95,  88, 255)    # 小号字灰棕

# -------- 加载字体 --------
FONT_BIG   = ImageFont.truetype(r"C:\Windows\Fonts\timesi.ttf", 52)     # Times Italic，tagline 语气对
FONT_SMALL = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf",   18)
FONT_STAMP = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 22)

def rounded_rect(base, xy, radius, fill, outline=None, width=3):
    """画圆角矩形到底图上"""
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

# -------- 1. 纸面：圆角矩形 + 角落阴影 --------
card = Image.new("RGBA", (W, H), (0, 0, 0, 0))

# 主体
rounded_rect(card, (0, 0, W, H), RADIUS, PAPER, outline=BORDER, width=4)

# 左上高光 / 右下阴影（让它像真实有厚度的纸）
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle((6, 6, W, H), radius=RADIUS-4, fill=(0, 0, 0, 28))
shadow = shadow.filter(ImageFilter.GaussianBlur(radius=8))
card = Image.alpha_composite(shadow, card)   # 阴影在底，纸面在上

# 左侧"收件栏"虚线分隔 —— 经典明信片布局（中间虚线分写信区和收件栏）
dd = ImageDraw.Draw(card)
for y in range(80, H-80, 10):
    dd.line([(W-240, y), (W-240, y+5)], fill=BORDER, width=1)
# 右侧：两行地址线 + 邮票框
for y in (H//2-30, H//2+10, H//2+50):
    dd.line([(W-220, y), (W-20, y)], fill=BORDER, width=1)
# 邮票框（右上）
dd.rectangle([W-110, 30, W-30, 110], outline=BORDER, width=2)
dd.rectangle([W-104, 36, W-36, 104], outline=BORDER, width=1)

# -------- 2. 邮戳（左上，红色圆形印章，半透明叠加） --------
stamp_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd2 = ImageDraw.Draw(stamp_layer)
cx, cy = 110, 110
sd2.ellipse([cx-60, cy-60, cx+60, cy+60], outline=STAMP, width=5)
sd2.ellipse([cx-50, cy-50, cx+50, cy+50], outline=STAMP, width=2)
# 邮戳文字
sd2.text((cx-44, cy-14), "MELINHADES", fill=STAMP, font=FONT_STAMP)
sd2.text((cx-22, cy+14), "2026.10", fill=STAMP, font=FONT_SMALL)
# 斜条纹（模拟油墨印章不均匀）
for i in range(-20, 40, 6):
    sd2.line([(cx-60+i, cy-60), (cx+20+i, cy+60)], fill=(200,80,80,40), width=2)
stamp_layer = stamp_layer.filter(ImageFilter.GaussianBlur(radius=0.6))
card = Image.alpha_composite(card, stamp_layer)

# -------- 3. 正文 tagline（居中偏左） --------
TEXT = 'Every step up the mountain'
TEXT2= 'is a word in your story.'
tx_w1, tx_h1 = FONT_BIG.getbbox(TEXT)[2],  FONT_BIG.getbbox(TEXT)[3]
tx_w2, tx_h2 = FONT_BIG.getbbox(TEXT2)[2], FONT_BIG.getbbox(TEXT2)[3]
xc = W//2 - 120                    # 避开右侧收件栏
y1 = H//2 - 60
dd.text((xc - tx_w1//2, y1),      TEXT,  fill=INK, font=FONT_BIG)
dd.text((xc - tx_w2//2, y1+tx_h1+12), TEXT2, fill=INK, font=FONT_BIG)

# 署名（小字，右下角）
sign = "— by MELINHADES"
sw = FONT_SMALL.getbbox(sign)[2]
dd.text((xc - sw//2, y1+tx_h1+tx_h2+40), sign, fill=INK_SM, font=FONT_SMALL)

# -------- 4. 点缀 12 颗小雪花（呼应 banner 的雪花主题） --------
random.seed(777)
for _ in range(12):
    r = random.randint(2, 5)
    x = random.randint(40, W-130)
    y = random.randint(30, H-40)
    dd.ellipse([x-r, y-r, x+r, y+r], fill=(255, 255, 255, 180))

# -------- 5. 保存 --------
OUT  = r"C:\Users\28464\IdeaProjects\blog\assets\readme\tagline-postcard.png"
OUT2 = r"C:\Users\28464\IdeaProjects\blog\celeste-snow-particle\tagline-postcard.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
card.convert("RGB").save(OUT,  "PNG")   # GitHub 对 RGBA 支持好，但 RGB 体积小
card.convert("RGB").save(OUT2, "PNG")
print(f"→ {OUT}  {os.path.getsize(OUT):,} bytes")
print(f"→ {OUT2}")
print(f"尺寸 {W}×{H}  OK")