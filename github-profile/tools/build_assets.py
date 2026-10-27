# -*- coding: utf-8 -*-
"""Rebuild every asset used by the profile README from the Celeste sprite atlases.

The source art is the local game palette under `blog-ui/` (not redistributed with
this repo); this script keeps the crop boxes, target sizes and quality points so
the whole asset set is reproducible with one command:

    python tools/build_assets.py --src ../../blog-ui

Every exported image is sized for its on-page width (2x = retina) and encoded as
WebP. `--report` prints measured bytes and PSNR against the source pixels.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageStat
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
DEFAULT_SRC = ROOT.parent / "blog-ui"
ART = ROOT.parent / "art"        # hand-made source art kept beside the palette

PURPLE = (155, 135, 245)
TINT_LIGHT = (58, 44, 92)         # heading text / icon glyph on the light page
TINT_DARK = (208, 196, 255)       # heading text / icon glyph on #0d1117
CONTENT_W = 948          # GitHub renders the article at 948 CSS px on a 1280 viewport
Q_PAINT = 86             # painterly art: PSNR >= 44 dB at this point
Q_PIXEL = 94             # pixel art / flat UI: keep edges clean
Q_UI = 92
DUSK = (128, 92, 158)    # the footer's violet ambient, used to grade the portrait



# --------------------------------------------------------------------------- utils
def load(src: Path, *parts: str) -> Image.Image:
    return Image.open(os.path.join(src, *parts)).convert("RGBA")


def trim(im: Image.Image, pad: int = 0) -> Image.Image:
    box = im.getbbox()
    if box:
        im = im.crop(box)
    if pad:
        canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
        canvas.paste(im, (pad, pad), im)
        im = canvas
    return im


def tint(im: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Recolor a white glyph, keeping its alpha shading."""
    solid = Image.new("RGBA", im.size, color + (255,))
    solid.putalpha(ImageChops.multiply(im.convert("L"), im.getchannel("A")))
    return solid


def cutout(im: Image.Image, t1: int = 14, t2: int = 46) -> Image.Image:
    """Drop a flat dark backdrop, keeping anti-aliased edges."""
    w, h = im.size
    px = im.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = [sum(c[i] for c in corners) / 4 for i in range(3)]
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
            if d <= t1:
                continue
            k = 1.0 if d >= t2 else (d - t1) / (t2 - t1)
            op[x, y] = (r, g, b, int(a * k))
    return out


def norm_icon(im: Image.Image, box: int = 86, canvas: int = 96) -> Image.Image:
    """Same visual footprint for every section icon."""
    im = trim(im)
    k = box / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(im, ((canvas - im.width) // 2, (canvas - im.height) // 2), im)
    return out


def save(im: Image.Image, name: str, quality: int, report: list) -> None:
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)
    report.append((name, path.stat().st_size, im.size))


def rel_luminance(rgb) -> float:
    def ch(c):
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg) -> float:
    a, b = rel_luminance(fg) + 0.05, rel_luminance(bg) + 0.05
    return max(a, b) / min(a, b)


# --------------------------------------------------------------------------- builders
def build_hero(src: Path, report: list) -> None:
    """Full-bleed sunrise. 1200 px is the widest authentic composed frame available."""
    im = Image.open(src / "celeste-areas" / "Summit-ch7-complete.png").convert("RGB")
    im = im.crop((0, 0, 1200, 520))
    save(im, "hero.webp", Q_PAINT, report)


def character_cutout(path: Path) -> Image.Image:
    """Knock the white studio backdrop out of the portrait and keep a soft rim.

    A plain colour key eats the near-white highlights in the hair and the pale
    sweater, so the backdrop is flood-filled inward from the border instead: only
    white that is connected to the frame is removed. The 2 px anti-aliased rim
    that the fill leaves behind is turned into partial alpha and un-matted, which
    stops a white halo from showing up once she sits on the violet dusk band.
    """
    art = Image.open(path).convert("RGB")
    w, h = art.size
    sentinel = (0, 255, 0)
    work = art.copy()
    px = work.load()

    step = max(4, w // 160)
    seeds = ([(x, 0) for x in range(0, w, step)] +
             [(x, h - 1) for x in range(0, w, step)] +
             [(0, y) for y in range(0, h, step)] +
             [(w - 1, y) for y in range(0, h, step)])
    for s in seeds:
        r, g, b = px[s]
        if (r, g, b) == sentinel or min(r, g, b) < 232:
            continue
        ImageDraw.floodfill(work, s, sentinel, thresh=26)

    a = np.asarray(work).astype(np.float32)
    bg = (a[:, :, 1] == 255) & (a[:, :, 0] == 0) & (a[:, :, 2] == 0)
    dilated = np.asarray(
        Image.fromarray(bg.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))
    ) > 0
    rim = dilated & ~bg

    alpha = np.where(bg, 0.0, 1.0)
    minc = a.min(axis=2)
    alpha[rim] = np.clip((255.0 - minc[rim]) / 45.0, 0.0, 1.0)

    al = alpha[:, :, None]
    unmatted = np.clip((a - 255.0 * (1.0 - al)) / np.maximum(al, 1e-3), 0, 255)
    out = Image.fromarray(np.dstack([unmatted, alpha * 255.0]).astype(np.uint8), "RGBA")
    return trim(out)


def composite_character(base: Image.Image, fig: Image.Image, x: int, height: int,
                        fade: float = 0.16, fade_left: float = 0.10) -> Image.Image:
    """Sit the portrait on the dusk band: grade it, dissolve its cut edges into the mist.

    The grade is a light blend toward the band's own violet, so the pink hair and
    the pale sweater still read as themselves instead of looking pasted on. The
    bottom and left fades replace what would otherwise be two hard cuts — a bust
    runs off the bottom edge of a 3:1 banner, and the illustration itself crops
    the long hair at its left border.
    """
    k = height / fig.height
    fig = fig.resize((max(1, round(fig.width * k)), height), Image.LANCZOS)

    alpha = fig.getchannel("A")
    rgb = fig.convert("RGB")
    rgb = Image.blend(rgb, Image.new("RGB", rgb.size, DUSK), 0.12)
    rgb = Image.eval(rgb, lambda v: int(v * 0.95))
    fig = rgb.convert("RGBA")
    fig.putalpha(alpha)

    a = np.asarray(fig.getchannel("A")).astype(np.float32)
    hh, ww = fig.height, fig.width
    down = np.clip((hh - 1 - np.arange(hh, dtype=np.float32)) / max(1.0, hh * fade), 0.0, 1.0)
    left = np.clip(np.arange(ww, dtype=np.float32) / max(1.0, ww * fade_left), 0.0, 1.0)
    a = a * down[:, None] * left[None, :]
    fig.putalpha(Image.fromarray(a.astype(np.uint8), "L"))

    out = base.copy()
    out.paste(fig, (x, base.height - fig.height), fig)
    return out


def build_footer(src: Path, report: list) -> None:
    """Dusk sky over the cloud slope, with the portrait in the left foreground.

    `SummitEnd/08.png` is the character cut-out layer: flattened onto RGB it is a
    pure-black sheet whose right 45% is empty — a black hole on the light theme.
    `SummitEnd/00.png` is the only composed dusk frame, mid-tone enough to read on
    both themes, so it is cropped to a 3:1 band and used alone.
    """
    im = Image.open(os.path.join(src, "Atlases", "SummitEnd", "00.png")).convert("RGB")
    im = im.crop((0, 294, 1068, 650))

    portrait = ART / "readme-end.jpg"
    if portrait.exists():
        fig = character_cutout(portrait)
        im = composite_character(im, fig, x=92, height=326)
    else:
        print(f"    footer: portrait source missing ({portrait}), plain band used")
    save(im, "footer.webp", Q_PAINT, report)



def build_mountain(src: Path, report: list) -> None:
    mtn = cutout(load(src, "Atlases", "SummitIntro", "03.png"))
    mtn = trim(mtn)
    mtn.thumbnail((800, 800), Image.LANCZOS)
    save(mtn, "mountain.webp", Q_PAINT, report)


def mean_rgb(im: Image.Image) -> tuple[float, float, float]:
    im = im.convert("RGBA")
    mask = im.getchannel("A").point(lambda v: 255 if v > 160 else 0)
    return tuple(ImageStat.Stat(im.convert("RGB"), mask).mean)


def theme_variant(im: Image.Image, tint: tuple[int, int, int], bg: tuple[int, int, int],
                   target: float = 3.2) -> tuple[Image.Image, float]:
    """Blend a glyph toward the theme tint until it separates from the page background.

    Keeps the alpha channel intact, so only the painted pixels shift.
    """
    rgb = im.convert("RGB")
    solid = Image.new("RGB", im.size, tint)
    for step in range(0, 13):
        k = step / 20          # 0 .. 0.60
        blended = Image.blend(rgb, solid, k)
        probe = blended.convert("RGBA")
        probe.putalpha(im.getchannel("A"))
        if contrast(mean_rgb(probe), bg) >= target:
            out = blended.convert("RGBA")
            out.putalpha(im.getchannel("A"))
            return out, k
    out = solid.convert("RGBA")
    out.putalpha(im.getchannel("A"))
    return out, 1.0


def build_icons(src: Path, report: list) -> None:
    """Two variants per glyph: one tuned for the light page, one for #0d1117.

    A single asset cannot satisfy both — the warm chapter icons sit at 1.8:1 on the
    dark page while the pale cassette/checkpoint sit at 2.7–2.9:1 on the light one.
    """
    icons = {
        "intro": ("Atlases", "Gui", "areas", "intro.png"),
        "city": ("Atlases", "Gui", "areas", "city.png"),
        "reflection": ("Atlases", "Gui", "areas", "reflection.png"),
        "core": ("Atlases", "Gui", "areas", "core.png"),
        "farewell": ("Atlases", "Gui", "areas", "farewell.png"),
        "summit-flag": ("Atlases", "Gui", "areas", "Summit.png"),
        "strawberry": ("Atlases", "Gui", "collectables", "strawberry.png"),
        "goldberry": ("Atlases", "Gui", "collectables", "goldberry.png"),
        "cassette": ("Atlases", "Gui", "collectables", "cassette.png"),
        "heart": ("celeste-icons", "heartgem1.png"),
    }
    for name, parts in list(icons.items()) + [("checkpoint", ("Atlases", "Gui", "checkpoint.png"))]:
        glyph = load(src, *parts)
        # the checkpoint glyph ships white; tint it first so it is not invisible on white
        if name == "checkpoint":
            glyph = tint(trim(glyph), PURPLE)
        base = norm_icon(glyph)
        for theme, tint_rgb, bg in (("", TINT_LIGHT, (255, 255, 255)),
                                    ("-dark", TINT_DARK, (13, 17, 23))):
            im, k = theme_variant(base, tint_rgb, bg)
            im = im.resize((52, 52), Image.LANCZOS)
            save(im, f"icons/{name}{theme}.webp", Q_UI, report)
            print(f"    icons/{name + theme:16s} blend {k:.2f} -> "
                  f"contrast {contrast(mean_rgb(im), bg):.2f}:1 vs {'light' if not theme else 'dark'}")


def build_chapters(src: Path, report: list) -> None:
    """Chapter cards are 120x80 native with rounded alpha edges; 2x nearest keeps the pixels honest."""
    for n in ("1", "2", "3", "4", "5", "6", "7", "9"):
        im = load(src, "celeste-gui", "chapter-covers", f"{n}.png")
        im = im.resize((240, 160), Image.NEAREST)
        save(im, f"chapters/ch{n}.webp", Q_PIXEL, report)


def build_portrait(src: Path, report: list) -> None:
    save(load(src, "celeste-portraits", "madeline", "peaceful00.png"),
         "portrait.webp", Q_PAINT, report)


def build_postcard(src: Path, report: list) -> None:
    """Keeps the card's alpha edge: flattening it to RGB paints black corners."""
    pc = Image.open(src / "Atlases" / "Gui" / "postcard.png").convert("RGBA")
    layer = Image.new("RGBA", pc.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    f1 = ImageFont.truetype(str(src / "celeste-font-en" / "Renogare-Regular.otf"), 40)
    f2 = ImageFont.truetype(str(src / "fonts" / "NotoSansCJKsc-Medium.otf"), 22)
    d.text((74, 188), "You can do this.", font=f1, fill=(196, 96, 96, 235))
    d.text((76, 248), "Falling is fine. Just try again.", font=f2, fill=(152, 96, 96, 215))
    layer = layer.rotate(-2.2, resample=Image.BICUBIC, center=(160, 230))
    pc.alpha_composite(layer)
    save(pc, "postcard.webp", Q_PAINT, report)


def build_divider(src: Path, report: list) -> None:
    """Uses the game's own credits fade (1920x3 alpha ramp) as the edge taper of a rule.

    The ramp is flat-black until 40% then climbs to full by 60%, so its rising edge is
    sampled into a 0..1 profile and mirrored onto both ends of the rule; taking a plain
    `min(a[x], a[1-x])` would leave only a 20%-wide spark in the middle.
    """
    ramp = Image.open(src / "Atlases" / "Gui" / "creditsGradient.png").convert("RGBA")
    vals = [ramp.getpixel((x, 1))[3] / 255.0 for x in range(ramp.width)]
    peak = max(vals) or 1.0
    start = next(i for i, v in enumerate(vals) if v > 0)
    top = next(i for i, v in enumerate(vals) if v >= peak * 0.98)
    curve = [vals[i] / peak for i in range(start, top + 1)]

    def taper(t: float) -> float:
        if t <= 0:
            return 0.0
        if t >= 1:
            return 1.0
        return curve[int(t * (len(curve) - 1))]

    W, H = 1782, 40          # displayed at 94% of the 948 CSS px column, 2x
    edge = 0.14              # taper occupies the outer 14% on each side
    for theme, color in (("dark", (176, 158, 255)), ("light", (104, 82, 196))):
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        mid = H // 2
        for x in range(W):
            lx = x / (W - 1)
            fade = min(taper(lx / edge), taper((1 - lx) / edge))
            d.line([(x, mid - 3), (x, mid + 3)], fill=color + (int(40 * fade),))
            d.line([(x, mid - 1), (x, mid + 1)], fill=color + (int(240 * fade),))
        # centre ornament: one big star, two small, two ticks
        cx, cy = W / 2, mid + 0.5
        ornaments = [
            (0, 0, 17, 1.0), (-26, 0, 8, 0.6), (26, 0, 8, 0.6),
            (0, -16, 6, 0.4), (0, 16, 6, 0.4),
        ]
        for dx, dy, s, k in ornaments:
            x0, y0 = cx + dx, cy + dy
            d.polygon([(x0, y0 - s), (x0 + s * .3, y0 - s * .3), (x0 + s, y0),
                       (x0 + s * .3, y0 + s * .3), (x0, y0 + s),
                       (x0 - s * .3, y0 + s * .3), (x0 - s, y0),
                       (x0 - s * .3, y0 - s * .3)],
                      fill=color + (int(255 * k),))
        save(im, f"divider-{theme}.webp", Q_UI, report)


def build_wordmark(src: Path, report: list) -> None:
    """Replaces the third-party typing animation: local, static, 2x, no motion."""
    text = "YOU CAN DO THIS."
    font_path = src / "celeste-font-en" / "PressStart2P-Regular.ttf"
    target_w = 1100          # rendered 2x for a 550 px display width
    size = 40
    while True:
        font = ImageFont.truetype(str(font_path), size)
        width = font.getbbox(text)[2] - font.getbbox(text)[0]
        if width >= target_w or size > 200:
            break
        size += 1
    img = Image.new("RGBA", (width + 12, size * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    color = (124, 99, 216)
    d.text((6, 0), text, font=font, fill=color + (255,))
    save(img, "wordmark.webp", Q_PIXEL, report)


def build_badges(src: Path, report: list) -> None:
    """Local badges replace img.shields.io; contrast against white text is asserted.

    Drawn at 2x (H=112 -> displayed 56 px) so the label stays crisp on retina.
    """
    font_path = src / "fonts" / "NotoSansCJKsc-Medium.otf"
    badges = [
        ("badge-celeste.webp", "Celeste fan", (201, 54, 107)),
        ("badge-tuj.webp", "TYUT · Software Eng.", (108, 85, 201)),
        ("badge-10km.webp", "10KM before dawn", (26, 122, 88)),
    ]
    H, PAD, R = 112, 48, 28
    widths = {}
    for name, text, bg in badges:
        ratio = contrast((255, 255, 255), bg)
        assert ratio >= 4.5, f"{name}: white text contrast {ratio:.2f} < 4.5"
        font = ImageFont.truetype(str(font_path), 54)
        tw = font.getbbox(text)[2] - font.getbbox(text)[0]
        img = Image.new("RGBA", (tw + PAD * 2, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([0, 0, img.width - 1, H - 1], radius=R, fill=bg + (255,))
        d.rounded_rectangle([2, 2, img.width - 3, H - 3], radius=R - 2, outline=(255, 255, 255, 40), width=2)
        d.text(((img.width - tw) // 2, (H - font.getbbox(text)[3]) // 2 - 2), text, font=font, fill=(255, 255, 255, 255))
        save(img, name, Q_UI, report)
        widths[name] = img.width
        print(f"    {name:24s} {img.width}x{H} -> display {img.width // 2}x{H // 2}, "
              f"white-on-bg contrast {ratio:.2f}:1")
    print("    widths for README:", {k: v // 2 for k, v in widths.items()})


def build_headings(src: Path, report: list) -> None:
    """Section titles rendered in Renogare, light/dark variants.

    GitHub strips ``@font-face`` from README HTML, so any text that must wear
    the game font is baked into an image — same trick as the badges and the
    wordmark. Two variants per title, tinted with the same purple the icons
    use, so the glyph stays legible on both themes.
    """
    font_path = src / "celeste-font-en" / "Renogare-Regular.otf"
    headings = [
        "About", "Celeste", "Stack", "How I got here",
        "Projects", "A day", "What's next", "Say hi",
    ]
    font_size = 46          # 2x for a ~23 px display height
    font = ImageFont.truetype(str(font_path), font_size)
    pad = 6
    for text in headings:
        bbox = font.getbbox(text)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        w, h = tw + pad * 2, th + pad * 2
        slug = text.lower().replace(" ", "-").replace("'", "")
        for theme, color in (("", TINT_LIGHT), ("-dark", TINT_DARK)):
            img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            d.text((pad - bbox[0], pad - bbox[1]), text, font=font, fill=color + (255,))
            save(img, f"headings/{slug}{theme}.webp", Q_UI, report)


# --------------------------------------------------------------------------- text images
# GitHub strips <style> and @font-face from README HTML, so body text that must
# wear the game fonts is baked into WebP images — same trick as the headings.
# Renogare covers the Latin set; anything missing (©, CJK) falls back per
# character to CelesteZH (NotoSansCJKsc). Every block ships a light/dark pair.
BODY_LIGHT = (31, 35, 40)      # GitHub light page default text
BODY_DARK = (230, 237, 243)    # GitHub dark page default text
LINK_LIGHT = (9, 105, 218)
LINK_DARK = (47, 129, 247)
WRAP_W = 880                   # max display width of a paragraph, CSS px

# slug: (display_px, payload, opts)
#   payload = [line, ...]; line = str | [(text, bold), ...]
#   opts: wrap (display px), center, bold, link (link colours), alpha, pad_l/pad_r (display px)
TEXTS: dict[str, tuple[int, list, dict]] = {
    "now": (17, [
        [("Building:", True), (" an AI diary for Celeste", False)],
        [("Studying:", True), (" software engineering, third year", False)],
        [("Running:", True), (" ten kilometers every morning", False)],
    ], {"center": True}),

    "nav-about": (15, ["About"], {"link": True}),
    "nav-stack": (15, ["Stack"], {"link": True}),
    "nav-chapters": (15, ["Chapters"], {"link": True}),
    "nav-projects": (15, ["Projects"], {"link": True}),
    "nav-say-hi": (15, ["Say hi"], {"link": True}),
    "nav-sep": (15, ["·"], {}),

    "about-1": (17, ["I'm a third-year software engineering student at "
                     "Taiyuan University of Technology."], {}),
    "about-2": (17, ["Most of what's here is other people's code kept for reading "
                     "— forks, marked as forks. What I built myself is in Projects."], {}),
    "celeste-1": (17, ["Main story finished. Still missing the golden strawberries. "
                       "I record some TAS runs, and the diary app is built around the game."], {}),

    "st-l1": (16, ["Languages"], {"bold": True}),
    "st-l2": (16, ["Backend"], {"bold": True}),
    "st-l3": (16, ["Data"], {"bold": True}),
    "st-l4": (16, ["Frontend"], {"bold": True}),
    "st-l5": (16, ["AI"], {"bold": True}),
    "st-l6": (16, ["Ops"], {"bold": True}),
    "st-v1": (16, ["Java, Python, JavaScript, SQL"], {"wrap": 700}),
    "st-v2": (16, ["Spring Boot 3.2, MyBatis-Plus, JWT"], {"wrap": 700}),
    "st-v3": (16, ["MySQL, Redis"], {"wrap": 700}),
    "st-v4": (16, ["Handwritten HTML/CSS/JS — no framework, no build step"], {"wrap": 700}),
    "st-v5": (16, ["Qwen2.5-7B for chat, bge-m3 for embeddings, through SiliconFlow"], {"wrap": 700}),
    "st-v6": (16, ["Docker, Prometheus"], {"wrap": 700}),
    "stack-note": (17, ["Going deeper on three things right now: machine learning from "
                        "scratch with NumPy, frontend without frameworks, and LLM "
                        "applications. The diary is where the last one gets tested."], {}),

    "chapters-intro": (17, ["The last few years, arranged as game chapters. Nine in the "
                            "game; I used eight — the one I left out hasn't happened yet."], {}),
    "ch-name-1": (16, ["Forsaken City"], {"bold": True}),
    "ch-name-2": (16, ["Old Site"], {"bold": True}),
    "ch-name-3": (16, ["Celestial Resort"], {"bold": True}),
    "ch-name-4": (16, ["Golden Ridge"], {"bold": True}),
    "ch-name-5": (16, ["Mirror Temple"], {"bold": True}),
    "ch-name-6": (16, ["Reflection"], {"bold": True}),
    "ch-name-7": (16, ["The Summit"], {"bold": True}),
    "ch-name-8": (16, ["Farewell"], {"bold": True}),
    "ch-desc-1": (16, ["First time travelling alone."], {"wrap": 520}),
    "ch-desc-2": (16, ["Things I thought were finished were still waiting where I left them."], {"wrap": 520}),
    "ch-desc-3": (16, ["Cleaning up a mess nobody else wanted."], {"wrap": 520}),
    "ch-desc-4": (16, ["Headwind the whole way."], {"wrap": 520}),
    "ch-desc-5": (16, ["The part of me I'd rather not look at."], {"wrap": 520}),
    "ch-desc-6": (16, ["Deciding whether to keep going."], {"wrap": 520}),
    "ch-desc-7": (16, ["Ten kilometers done, the sun is up."], {"wrap": 520}),
    "ch-desc-8": (16, ["Not yet. Saving it for later."], {"wrap": 520}),

    "projects-intro": (17, ["Two repositories, both built by me end to end. Everything "
                            "else on this account is a fork I read, not work I claim."], {}),
    "proj-h1": (16, ["Project"], {"bold": True}),
    "proj-h2": (16, ["What it is"], {"bold": True}),
    "proj-h3": (16, ["Stack"], {"bold": True}),
    "proj-n1": (16, ["Celeste-AI-Diary-Companion-Blog"], {"bold": True, "link": True}),
    "proj-d1": (16, ["Blog, AI diary companion and Celeste UI"], {"wrap": 420}),
    "proj-s1": (16, ["Spring Boot, plain JS, MySQL"], {"wrap": 300}),
    "proj-n2": (16, ["java-ai-langchain4j"], {"bold": True, "link": True}),
    "proj-d2": (16, ["AI experiments in Java, built on LangChain4j"], {"wrap": 420}),
    "proj-s2": (16, ["Java, LangChain4j, Maven"], {"wrap": 300}),

    "contrib-sub": (14, ["Contribution history"], {}),

    "day-summary": (16, ["Open the timeline"], {}),
    "day-h1": (16, ["Time"], {"bold": True}),
    "day-h2": (16, ["What"], {"bold": True}),
    "day-t1": (16, ["Before dawn"], {"bold": True}),
    "day-t2": (16, ["Daytime"], {"bold": True}),
    "day-t3": (16, ["Evening"], {"bold": True}),
    "day-t4": (16, ["Late night"], {"bold": True}),
    "day-w1": (16, ["Ten kilometers. Then the day can start."], {"wrap": 620}),
    "day-w2": (16, ["Classes, coursework, the occasional staring into space"], {"wrap": 620}),
    "day-w3": (16, ["Reading and code. Often stuck in the same place for hours."], {"wrap": 620}),
    "day-w4": (16, ["A couple of Celeste levels, or writing something nobody reads."], {"wrap": 620}),

    "next-summary": (16, ["Open the list"], {}),
    "next-1": (17, ["Turn machine learning exercises into notes that actually run"], {}),
    "next-2": (17, ["Build one complete application from scratch, no framework"], {}),
    "next-3": (17, ["Make the diary solid instead of big"], {}),

    "sayhi-1": (17, ["If any of this is close to what you're working on, "
                     "email is the fastest way to reach me."], {}),

    "contact-label": (14, ["Contact:"], {"pad_r": 6}),
    "contact-mail": (14, ["jfy2846484252@outlook.com"], {"link": True}),
    "contact-sep": (14, ["·"], {"pad_l": 6, "pad_r": 6}),
    "contact-top": (14, ["Back to top"], {"link": True}),

    "cr-1": (13, ["Pixel art from"], {"alpha": 0.65, "pad_r": 4}),
    "cr-2": (13, ["Celeste"], {"alpha": 0.65, "link": True}),
    "cr-3": (13, ["© Maddy Makes Games, used for a personal page."], {"alpha": 0.65, "pad_l": 4}),
}


def _plain_text(payload: list) -> str:
    out = []
    for line in payload:
        segs = line if isinstance(line, list) else [(line, False)]
        out.append("".join(t for t, _ in segs))
    return " ".join(out)


def build_texts(src: Path, report: list) -> dict[str, tuple[int, int]]:
    """Render every README text block as a light/dark WebP pair in the game fonts.

    Returns the {slug: (display_w, display_h)} manifest that build_readme() needs.
    Per-character font fallback: Renogare first, CelesteZH for what it lacks.
    """
    from fontTools.ttLib import TTFont

    ren_path = src / "celeste-font-en" / "Renogare-Regular.otf"
    cjk_path = src / "fonts" / "NotoSansCJKsc-Medium.otf"
    coverage = {p: set(TTFont(str(p)).getBestCmap()) for p in (ren_path, cjk_path)}

    fonts: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}

    def font_for(path: Path, px: int) -> ImageFont.FreeTypeFont:
        key = (str(path), px)
        if key not in fonts:
            fonts[key] = ImageFont.truetype(str(path), px)
        return fonts[key]

    def pick(ch: str) -> Path:
        return ren_path if ord(ch) in coverage[ren_path] else cjk_path

    def seg_width(text: str, px: int) -> float:
        return sum(font_for(pick(c), px).getlength(c) for c in text)

    def wrap_line(segs: list, px: int, max_w: float) -> list:
        """Word-wrap a segment list, preserving bold flags."""
        words = []  # (word_text, bold, trailing_space)
        for text, bold in segs:
            for i, w in enumerate(text.split(" ")):
                if w == "" and i == 0:
                    continue
                words.append([w, bold])
        lines, cur, cur_w = [], [], 0.0
        for w, bold in words:
            piece = (" " if cur else "") + w
            pw = seg_width(piece, px)
            if cur and cur_w + pw > max_w:
                lines.append(cur)
                cur, cur_w, piece = [], 0.0, w
                pw = seg_width(w, px)
            cur.append((piece if cur else w, bold))
            cur_w += pw
        if cur:
            lines.append(cur)
        return lines

    manifest: dict[str, tuple[int, int]] = {}
    for slug, (disp_px, payload, opts) in TEXTS.items():
        px = disp_px * 2
        lh = int(px * {17: 1.75, 16: 1.7, 15: 1.6, 14: 1.6, 13: 1.5}.get(disp_px, 1.7))
        stroke = max(1, px // 24)
        wrap_w = opts.get("wrap", WRAP_W) * 2

        # normalise + wrap
        lines = []
        for line in payload:
            segs = line if isinstance(line, list) else [(line, False)]
            if opts.get("bold"):
                segs = [(t, True) for t, _ in segs]
            lines.extend(wrap_line(segs, px, wrap_w))

        # measure
        ascents, descents, widths = [], [], []
        for segs in lines:
            w = 0.0
            for text, _ in segs:
                for ch in text:
                    f = font_for(pick(ch), px)
                    a, d = f.getmetrics()
                    ascents.append(a)
                    descents.append(d)
                    w += f.getlength(ch)
            widths.append(w)
        ascent, descent = max(ascents), max(descents)
        block_w = int(max(widths)) + 8
        block_h = ascent + descent + lh * (len(lines) - 1) + 8

        for theme, fg in (("", LINK_LIGHT if opts.get("link") else BODY_LIGHT),
                          ("-dark", LINK_DARK if opts.get("link") else BODY_DARK)):
            img = Image.new("RGBA", (block_w, block_h), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            for i, segs in enumerate(lines):
                x = 4.0
                if opts.get("center"):
                    x = (block_w - widths[i]) / 2
                y = 4 + i * lh
                for text, bold in segs:
                    for ch in text:
                        f = font_for(pick(ch), px)
                        a, _ = f.getmetrics()
                        kw = {"stroke_width": stroke, "stroke_fill": fg + (255,)} if bold else {}
                        d.text((x, y + ascent - a), ch, font=f, fill=fg + (255,), **kw)
                        x += f.getlength(ch)
            img = trim(img)
            pad_l, pad_r = opts.get("pad_l", 0) * 2, opts.get("pad_r", 0) * 2
            if pad_l or pad_r:
                canvas = Image.new("RGBA", (img.width + pad_l + pad_r, img.height), (0, 0, 0, 0))
                canvas.paste(img, (pad_l, 0), img)
                img = canvas
            if opts.get("alpha"):
                a = img.getchannel("A").point(lambda v: int(v * opts["alpha"]))
                img.putalpha(a)
            save(img, f"texts/{slug}{theme}.webp", Q_UI, report)
        manifest[slug] = (img.width // 2, img.height // 2)
    return manifest


def build_readme(manifest: dict[str, tuple[int, int]]) -> None:
    """Assemble README.md from the baked text images; run after build_texts()."""
    def img(slug: str, link: str | None = None) -> str:
        w, _ = manifest[slug]
        alt = _plain_text(TEXTS[slug][1]).replace('"', "'")
        pic = (f'<picture><source media="(prefers-color-scheme: dark)" '
               f'srcset="./assets/texts/{slug}-dark.webp">'
               f'<img src="./assets/texts/{slug}.webp" width="{w}" alt="{alt}"></picture>')
        return f'<a href="{link}">{pic}</a>' if link else pic

    def heading(icon: str, slug: str, title: str) -> str:
        return (f'### <picture><source media="(prefers-color-scheme: dark)" '
                f'srcset="./assets/icons/{icon}-dark.webp"><img src="./assets/icons/{icon}.webp" '
                f'width="26" alt=""></picture> <picture><source media="(prefers-color-scheme: dark)" '
                f'srcset="./assets/headings/{slug}-dark.webp"><img src="./assets/headings/{slug}.webp" '
                f'height="20" alt="{title}"></picture>')

    divider = '''<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/divider-dark.webp" />
    <source media="(prefers-color-scheme: light)" srcset="./assets/divider-light.webp" />
    <img src="./assets/divider-dark.webp" width="94%" alt="" />
  </picture>
</div>'''

    nav = "&nbsp;".join([
        img("nav-about", "#about"), img("nav-sep"), img("nav-stack", "#stack"), img("nav-sep"),
        img("nav-chapters", "#chapters"), img("nav-sep"), img("nav-projects", "#projects"),
        img("nav-sep"), img("nav-say-hi", "#letters"),
    ])

    chapters = [
        (1, "Chapter 1 Forsaken City cover art"),
        (2, "Chapter 2 Old Site cover art"),
        (3, "Chapter 3 Celestial Resort cover art"),
        (4, "Chapter 4 Golden Ridge cover art"),
        (5, "Chapter 5 Mirror Temple cover art"),
        (6, "Chapter 6 Reflection cover art"),
        (7, "Chapter 7 The Summit cover art"),
        (9, "Chapter 9 Farewell cover art"),
    ]
    ch_rows = "\n".join(
        f'<tr><td><img src="./assets/chapters/ch{n}.webp" width="120" alt="{alt}" /></td>'
        f'<td>{img(f"ch-name-{i}")}</td><td>{img(f"ch-desc-{i}")}</td></tr>'
        for i, (n, alt) in enumerate(chapters, start=1))

    stack_rows = "\n".join(
        f"<tr><td>{img(f'st-l{i}')}</td><td>{img(f'st-v{i}')}</td></tr>" for i in range(1, 7))
    day_rows = "\n".join(
        f"<tr><td>{img(f'day-t{i}')}</td><td>{img(f'day-w{i}')}</td></tr>" for i in range(1, 5))

    readme = f'''<a name="top"></a>

<div align="center">
  <img src="./assets/hero.webp" width="100%" alt="Celeste chapter 7: the summit before dawn — snow, stars and a sea of clouds" />
  <br/><br/><br/>
  <img src="./assets/wordmark.webp" width="558" alt="YOU CAN DO THIS." />
  <br/>
  <img src="./assets/badge-celeste.webp" width="191" alt="Celeste fan" />
  <img src="./assets/badge-tuj.webp" width="335" alt="TYUT · Software Eng." />
  <img src="./assets/badge-10km.webp" width="288" alt="10KM before dawn" />
  <br/><br/>
  <a name="now"></a>
  {img("now")}
  <br/><br/>
  {nav}
</div>

<a name="about"></a>

## <picture><source media="(prefers-color-scheme: dark)" srcset="./assets/headings/about-dark.webp"><img src="./assets/headings/about.webp" height="20" alt="About"></picture>

{img("about-1")}

{img("about-2")}

<div align="center">
  <img src="./assets/portrait.webp" width="112" alt="Madeline's pixel portrait" />
</div>

{divider}

{heading("reflection", "celeste", "Celeste")}

{img("celeste-1")}

{divider}

<a name="stack"></a>

{heading("core", "stack", "Stack")}

<table>
{stack_rows}
</table>

{img("stack-note")}

{divider}

<a name="chapters"></a>

{heading("intro", "how-i-got-here", "How I got here")}

{img("chapters-intro")}

<div align="center">
  <img src="./assets/mountain.webp" width="310" alt="A grey-purple snow mountain" />
</div>

<table>
{ch_rows}
</table>

{divider}

<a name="projects"></a>

{heading("cassette", "projects", "Projects")}

{img("projects-intro")}

<table>
<tr><th>{img("proj-h1")}</th><th>{img("proj-h2")}</th><th>{img("proj-h3")}</th></tr>
<tr><td>{img("proj-n1", "https://github.com/melinhades/Celeste-AI-Diary-Companion-Blog")}</td><td>{img("proj-d1")}</td><td>{img("proj-s1")}</td></tr>
<tr><td>{img("proj-n2", "https://github.com/melinhades/java-ai-langchain4j")}</td><td>{img("proj-d2")}</td><td>{img("proj-s2")}</td></tr>
</table>

<div align="center">
  {img("contrib-sub")}
  <br/>
  <img src="https://streak-stats.demolab.com?user=melinhades&theme=transparent&hide_border=true&ring=9B87F5&fire=FF6B9D&currStreakLabel=9B87F5&sideLabels=9B87F5&currStreakNum=9B87F5&sideNums=9B87F5&dates=8b949e" alt="GitHub contribution streak" />
</div>

{divider}

{heading("checkpoint", "a-day", "A day")}

<details>
<summary>{img("day-summary")}</summary>

<table>
<tr><th>{img("day-h1")}</th><th>{img("day-h2")}</th></tr>
{day_rows}
</table>

</details>

{divider}

{heading("farewell", "whats-next", "What's next")}

<details>
<summary>{img("next-summary")}</summary>

- {img("next-1")}
- {img("next-2")}
- {img("next-3")}

</details>

{divider}

<a name="letters"></a>

{heading("heart", "say-hi", "Say hi")}

<div align="center">
  <img src="./assets/postcard.webp" width="45%" alt="A handwritten note: You can do this. / Falling is fine. Just try again." />
</div>

{img("sayhi-1")}

<div align="center">

<img src="./assets/footer.webp" width="100%" alt="Above the summit at dusk: violet light, a slope of cloud, and Madeline holding a cassette" />

<br/>
<div>
{img("contact-label")}{img("contact-mail", "mailto:jfy2846484252@outlook.com")}{img("contact-sep")}{img("contact-top", "#top")}
</div>

<br/>
<div>
{img("cr-1")}{img("cr-2", "https://www.celestegame.com/")}{img("cr-3")}
</div>

</div>

<!--
Contribution snake: enable once .github/workflows/snake.yml has run successfully.
Before the first run the links 404 and show broken images, which is why this stays
commented out. Remove the comment markers below to turn it on.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/melinhades/melinhades/output/snake-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/melinhades/melinhades/output/snake.svg" />
    <img alt="contribution snake" src="https://raw.githubusercontent.com/melinhades/melinhades/output/snake.svg" />
  </picture>
</p>
-->
'''
    (ROOT / "README.md").write_text(readme, encoding="utf-8")
    print(f"    README.md written ({len(readme) / 1024:.1f} KB, {len(TEXTS)} text blocks)")


# --------------------------------------------------------------------------- main
EXAMPLE_USAGE = "python tools/build_assets.py --src ../../blog-ui"


def main() -> int:
    ap = argparse.ArgumentParser(description=EXAMPLE_USAGE)
    ap.add_argument("--src", default=str(DEFAULT_SRC), help="path to blog-ui palette dir")
    args = ap.parse_args()
    src = Path(args.src)
    if not src.exists():
        print(f"source palette not found: {src}", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    report: list = []
    build_hero(src, report)
    build_footer(src, report)
    build_mountain(src, report)
    build_icons(src, report)
    build_chapters(src, report)
    build_portrait(src, report)
    build_postcard(src, report)
    build_divider(src, report)
    build_wordmark(src, report)
    build_badges(src, report)
    build_headings(src, report)
    manifest = build_texts(src, report)
    build_readme(manifest)

    keep = {(OUT / n).resolve() for n, _, _ in report}
    removed = []
    for p in OUT.rglob("*"):
        if p.is_file() and p.resolve() not in keep:
            p.unlink()
            removed.append(p.relative_to(OUT).as_posix())

    total = sum(size for _, size, _ in report)
    print(f"\n{len(report)} assets, {total / 1024:.0f} KB total")
    for name, size, dim in sorted(report, key=lambda r: -r[1])[:8]:
        print(f"  {name:26s} {dim[0]}x{dim[1]:<5d} {size / 1024:6.1f} KB")
    if removed:
        print("removed:", ", ".join(removed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
