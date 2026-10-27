# -*- coding: utf-8 -*-
"""
Celeste 风格分隔线：中央雪花晶体 + 两侧渐变细线，透明底（明暗主题通用）。
颜色取 banner 的亮紫灰 (208,196,255)，两端淡出。
"""
from PIL import Image, ImageDraw, ImageFilter
import math, os

W, H = 900, 60
LINE_Y = H // 2
COLOR = (208, 196, 255)          # banner 同款亮紫灰
FLAKE_R = 16                     # 中央雪花半径
LINE_LEN = 330                   # 单侧线长
GAP = 30                         # 雪花与线之间的空隙

img = Image.new("RGBA", (900, 60), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

cx = 900 // 2

# ---- 两侧渐变线（从雪花旁向两端淡出）----
for side in (-1, 1):
    x_start = cx + side * (FLAKE_R + GAP)
    x_end = cx + side * (FLAKE_R + GAP + LINE_LEN)
    steps = LINE_LEN
    for i in range(steps):
        t = i / steps                       # 0=靠雪花, 1=远端
        alpha = int(230 * (1 - t) ** 1.6)   # 淡出
        x = x_start + side * i
        d.line([(x, LINE_Y), (x + side, LINE_Y)], fill=(*COLOR, alpha), width=2)

# ---- 中央六角雪花 ----
def arm(angle_deg, length, width):
    a = math.radians(angle_deg)
    x2 = cx + length * math.cos(a)
    y2 = LINE_Y + length * math.sin(a)
    d.line([(cx, LINE_Y), (x2, y2)], fill=(*COLOR, 255), width=width)
    # 每个分支 2/3 处画一对小枝
    bx = cx + length * 0.62 * math.cos(a)
    by = LINE_Y + length * 0.62 * math.sin(a)
    for delta in (-35, 35):
        b = math.radians(angle_deg + delta)
        d.line([(bx, by), (bx + length * 0.32 * math.cos(b), by + length * 0.32 * math.sin(b))],
               fill=(*COLOR, 235), width=max(1, width - 1))

for ang in range(0, 360, 60):
    arm(ang, FLAKE_R, 3)

# 中心小圆点
d.ellipse([cx - 4, LINE_Y - 4, cx + 4, LINE_Y + 4], fill=(*COLOR, 255))

img = img.filter(ImageFilter.GaussianBlur(radius=0.4))

out = r"c:\Users\28464\IdeaProjects\blog\assets\readme\divider-snow.png"
img.save(out, "PNG", optimize=True)
print(f"OK {out} {os.path.getsize(out):,} bytes")
