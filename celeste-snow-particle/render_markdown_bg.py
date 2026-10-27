# -*- coding: utf-8 -*-
"""生成纯净的"OPPO 互联"风格灰色棋盘格底图 + Markdown 层级文字。

原图 1696x1080 的像素特征：
  - 非文字区域是 255×255×255（白）与 198×198×198（中灰）的棋盘格交替
  - 每个格子尺寸约 32px（从 br(198,198,198) / center(253,253,253) 反推）
  - 画布整体带 24bpp 但 viewer 显示为透明（PNG 实际有 alpha）
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1696, 1080

# -------- 1) 生成干净棋盘格底（带 alpha，真正透明） --------
TILE = 32
LIGHT = (240, 240, 240, 255)
DARK  = (198, 198, 198, 255)

bg = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for y in range(0, H, TILE):
    for x in range(0, W, TILE):
        color = LIGHT if ((x // TILE) + (y // TILE)) % 2 == 0 else DARK
        # 只填 TILE×TILE 的块，不超画布
        tw = min(TILE, W - x)
        th = min(TILE, H - y)
        bg.paste(Image.new("RGBA", (tw, th), color), (x, y))

# 整体再盖一层极浅的白渐变，让 checker 更柔和
overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
for i in range(60):
    # 四角极淡暗角（原图整体是浅的，只有四角略灰）
    r = 200 - i * 2
    od.rectangle([i, i, W - i, H - i], outline=(200, 200, 200, 2))
bg = Image.alpha_composite(bg, overlay)

# -------- 2) Markdown 层级文字 --------
TEXT = {
    "h1": "CELESTE",
    "h2": "AI COMPANION BLOG",
    "p":  "a project by",
    "em": "MELINHADES",
}

FONT_DIR = r"C:\Windows\Fonts"
F_H1 = ImageFont.truetype(os.path.join(FONT_DIR, "ariblk.ttf"), 170)
F_H2 = ImageFont.truetype(os.path.join(FONT_DIR, "arialbd.ttf"), 70)
F_P  = ImageFont.truetype(os.path.join(FONT_DIR, "arial.ttf"), 36)
F_EM = ImageFont.truetype(os.path.join(FONT_DIR, "arialbd.ttf"), 56)

C_H1 = (255, 255, 255, 255)
C_H2 = (255, 255, 255, 255)
C_P  = (130, 130, 130, 255)
C_EM = (130, 130, 130, 255)

def measure(draw, text, font):
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]

def draw_shadow(img, text, font, color, xy, offset=(6, 6), blur=10):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((xy[0] + offset[0], xy[1] + offset[1]), text, font=font, fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(radius=blur))
    img.alpha_composite(layer)

def put(img, text, font, color, y, shadow=None):
    draw = ImageDraw.Draw(img)
    w, h = measure(draw, text, font)
    x = (W - w) // 2
    if shadow:
        draw_shadow(img, text, font, shadow[0], (x, y), shadow[1], shadow[2])
    draw.text((x, y), text, font=font, fill=color)
    return y + h

draw0 = ImageDraw.Draw(bg)
_, h1h = measure(draw0, TEXT["h1"], F_H1)
_, h2h = measure(draw0, TEXT["h2"], F_H2)
_, ph  = measure(draw0, TEXT["p"],  F_P)
_, emh = measure(draw0, TEXT["em"],  F_EM)

GAP = (40, 100, 20)
total = h1h + GAP[0] + h2h + GAP[1] + ph + GAP[2] + emh
y = (H - total) // 2

y = put(bg, TEXT["h1"], F_H1, C_H1, y, shadow=((0,0,0,180), (6, 6), 10))
y += GAP[0]
y = put(bg, TEXT["h2"], F_H2, C_H2, y, shadow=((0,0,0,160), (4, 4), 6))
y += GAP[1]
y = put(bg, TEXT["p"],  F_P,  C_P,  y)
y += GAP[2]
y = put(bg, TEXT["em"], F_EM,  C_EM,  y)

# -------- 保存 --------
OUT = r"C:\Users\28464\Documents\OPPO 互联\celeste-blog-header-markdown.png"
bg.save(OUT, "PNG")
print("→", OUT, "  ", bg.size, "  alpha OK =", bg.mode)