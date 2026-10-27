# -*- coding: utf-8 -*-
"""
纯雪花背景 banner —— 不依赖 OPPO 照片。
- 底：深蓝竖向渐变（接近 Celeste 游戏启动画面的天空蓝）
- 雪花：用 Atlases/Overworld/snow.png（REA 反编译确认就是 HiresSnow 用的那张贴图），随机旋转、缩放、透明度
- 文字：主标题 + tagline 直接 bake 进这张图，不再需要单独的 tagline 图

输出：覆盖 assets/readme/header-banner.png（README 引用名不变，改内容）
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, os

W, H = 1520, 720            # 16:9，GitHub README 居中大图能撑满

# -------- 1. 深蓝渐变天空 --------
sky = Image.new("RGB", (W, H))
for y in range(H):
    t = y / H
    r = int(30 + (15 - 30) * t)     # 顶 30 → 底 15
    g = int(45 + (22 - 45) * t)     # 顶 45 → 底 22
    b = int(80 + (55 - 80) * t)     # 顶 80 → 底 55
    ImageDraw.Draw(sky).line([(0, y), (W, y)], fill=(r, g, b))
base = sky.convert("RGBA")

# -------- 2. 雪花粒子层（用游戏贴图 snow.png） --------
SNOW_TEX_PATH = r"c:\Users\28464\IdeaProjects\blog\blog-ui\Atlases\Overworld\snow.png"
snow_tex = Image.open(SNOW_TEX_PATH).convert("RGBA")
# 对齐 REA 反编译：snow.GetSubtexture(1,1,254,254)
snow_tex = snow_tex.crop((1, 1, 255, 255))

PARTICLE_COUNT = 280
random.seed(42)
fx_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))

for _ in range(PARTICLE_COUNT):
    # n^4 大小分布（HiresSnow/Particle.Reset 的 Scale 逻辑）
    u = random.random()
    n = u ** 4
    scale = 0.05 + n * 0.75           # 对应 Scale = Map(n⁴, 0,1, 0.05, 0.8)
    rot = random.uniform(0, 360)      # Rotation = NextFloat()*2π

    tex = snow_tex.copy()
    # 旋转 + 缩放
    tex = tex.rotate(rot, resample=Image.BICUBIC, expand=True)
    new_size = max(2, int(254 * scale))
    tex = tex.resize((new_size, new_size), Image.BICUBIC)

    # 透明度（越大越亮，Color = Lerp(White, Transparent, n*0.8)）
    alpha_mult = 1.0 - n * 0.8
    if alpha_mult < 1.0:
        a = tex.split()[3].point(lambda v, m=alpha_mult: int(v * m))
        tex.putalpha(a)

    # 位置（整屏随机，HiresSnow.Reset 的边外出生点在渲染时就是全屏可见态）
    x = random.randint(-new_size // 2, W + new_size // 2)
    y = random.randint(-new_size // 2, H + new_size // 2)

    fx_layer.alpha_composite(tex, dest=(x, y))

# 轻微模糊让小雪花有 airiness
fx_layer = fx_layer.filter(ImageFilter.GaussianBlur(radius=0.6))
base = Image.alpha_composite(base, fx_layer)

# -------- 3. 文字层 --------
TEXT_BIG = "CELESTE AI DIARY COMPANION BLOG"
TEXT_SM  = "Every step up the mountain is a word in your story."
TEXT_SUB = "a project by MELINHADES"

try:
    FONT_BIG = ImageFont.truetype(r"C:\Windows\Fonts\ariblk.ttf", 78)
except:
    FONT_BIG = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 78)
FONT_SM  = ImageFont.truetype(r"C:\Windows\Fonts\timesi.ttf", 38)
FONT_SUB = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf",   24)

tx_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tx_layer)

# 阴影层（深色偏移 + 模糊，让字在雪花底上清晰）
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)

# 测宽（Pillow 10+ 用 getbbox）
def text_size(font, text):
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]

# 主标题：画面上方 35% 处居中
bw, bh = text_size(FONT_BIG, TEXT_BIG)
bx, by = (W - bw) // 2, int(H * 0.28)
sd.text((bx + 4, by + 4), TEXT_BIG, fill=(0, 0, 0, 140), font=FONT_BIG)
td.text((bx, by), TEXT_BIG, fill=(255, 255, 255, 245), font=FONT_BIG)

# 副标题：主标题下方
sw, sh = text_size(FONT_SM, TEXT_SM)
sx, sy = (W - sw) // 2, by + bh + 22
sd.text((sx + 3, sy + 3), TEXT_SM, fill=(0, 0, 0, 110), font=FONT_SM)
td.text((sx, sy), TEXT_SM, fill=(235, 235, 235, 230), font=FONT_SM)

# 署名
uw, uh = text_size(FONT_SUB, TEXT_SUB)
ux, uy = (W - uw) // 2, sy + sh + 18
sd.text((ux + 2, uy + 2), TEXT_SUB, fill=(0, 0, 0, 90), font=FONT_SUB)
td.text((ux, uy), TEXT_SUB, fill=(200, 200, 210, 220), font=FONT_SUB)

shadow = shadow.filter(ImageFilter.GaussianBlur(radius=4))
base = Image.alpha_composite(base, shadow)
base = Image.alpha_composite(base, tx_layer)

# -------- 4. 保存（覆盖 assets/readme/header-banner.png） --------
OUT  = r"C:\Users\28464\IdeaProjects\blog\assets\readme\header-banner.png"
OUT2 = r"C:\Users\28464\IdeaProjects\blog\celeste-snow-particle\header-banner.png"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
base.convert("RGB").save(OUT, "PNG", optimize=True)
base.convert("RGB").save(OUT2, "PNG", optimize=True)
print(f"→ {OUT}   {os.path.getsize(OUT):,} bytes  {W}x{H}")
print(f"→ {OUT2}  同内容副本")