# -*- coding: utf-8 -*-
"""
合成：用户的棋盘格底（1696×1080，已 baked-in 标题文字）+ 雪花粒子叠加 → 静态 PNG
等价于把 snow-effect.js 的粒子系统随机撒到你那张 PNG 上，然后保存。

这次是"真正合成"，不是单独渲染字或者单独生成底。
"""
from PIL import Image, ImageDraw, ImageFilter
import random, math, os

SRC = r"C:\Users\28464\Documents\OPPO 互联\1793091607439.png"
OUT = r"C:\Users\28464\IdeaProjects\blog\assets\readme\header-banner-snow.png"

# -------- 加载底图 --------
base = Image.open(SRC).convert("RGBA")
W, H = base.size
print(f"底图 {W}×{H}")

# -------- 生成雪花粒子层（单独 alpha 图层，再 composite 到底图上） --------
SNOW_COUNT = 220           # 粒子数 —— 视觉密度
MIN_R, MAX_R = 2, 7        # 半径（对应 snow-effect.js 里 Scale×254 的大致范围）
MIN_A, MAX_A = 160, 255    # alpha（对应 HiresSnow.Color 的 Lerp 结果）

random.seed(20261027)      # 固定种子 → 可复现

snow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
draw = ImageDraw.Draw(snow_layer)

for _ in range(SNOW_COUNT):
    # n^4 分布（对齐 Particle.Reset：Scale = Map(u^4, 0,1, 0.05, 0.8)）
    u = random.random()
    n = u ** 4

    # 位置（整屏随机，对齐 Reset() 覆盖边外出生点的逻辑）
    x = random.randrange(0, W)
    y = random.randrange(0, H)

    # 半径（大 → 亮，小 → 暗，近大远小的景深效果）
    r = MIN_R + n * (MAX_R - MIN_R)
    a = int(MIN_A + (1 - n) * (MAX_A - MIN_A))   # 大雪花更亮

    # 白色半透明圆（模拟 snow-effect.js 里的 snow 贴图；近似即可）
    draw.ellipse(
        [x - r, y - r, x + r, y + r],
        fill=(255, 255, 255, a)
    )

# 轻微模糊一下小粒子，让它们看起来有 airiness，不是生硬硬边
snow_layer = snow_layer.filter(ImageFilter.GaussianBlur(radius=1.2))

# -------- 合成（= Canvas2D 的 globalCompositeOperation='lighter' + 正常混合） --------
composite = Image.alpha_composite(base, snow_layer)

# -------- 覆盖掉之前单独渲染的 banner，这样根 README 不动图片名就能生效 --------
os.makedirs(os.path.dirname(OUT), exist_ok=True)
# 同时也覆盖 celeste-snow-particle/header-banner.png，保持两个路径一致
OUT2 = r"C:\Users\28464\IdeaProjects\blog\celeste-snow-particle\header-banner.png"
composite.save(OUT, "PNG")
composite.save(OUT2, "PNG")
print(f"→ {OUT}")
print(f"→ {OUT2}  (同内容副本)")

# -------- 校验 --------
im = Image.open(OUT).convert("RGBA")
print(f"输出 {im.size}  mode={im.mode}  OK")
# 采样雪花覆盖了没
for x, y in [(200, 200), (848, 450), (1400, 600), (848, 850)]:
    print(f"  ({x},{y}) {im.getpixel((x,y))}")