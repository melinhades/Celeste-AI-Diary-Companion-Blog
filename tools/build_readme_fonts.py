# -*- coding: utf-8 -*-
"""Bake the repo README's prose into Renogare + CelesteZH webp images.

GitHub sanitizes style attributes and @font-face out of README HTML, so the
game fonts can only survive as pictures. This script reads README.src.md
(hand-maintained markdown source) and writes README.md + assets/readme/*.webp:

    python tools/build_readme_fonts.py

Baked: headings, paragraphs, blockquotes, lists, table cells, TOC links.
Kept as-is: fenced code blocks, shields badges, screenshots, the star-history
chart, and bare URLs in the Access table (copy-paste beats typography there).

Inline markdown supported in baked text: **bold** (faux stroke), *italic*
(faux shear), `code` (Consolas on a translucent chip), [links](url) (baked in
link blue, wrapped in a real <a>), CJK fallback to NotoSansCJKsc, and color
emoji via Segoe UI Emoji baked right into the image. Every block ships a
light/dark pair switched with <picture> + prefers-color-scheme.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
SRC_MD = ROOT / "README.src.md"
OUT_MD = ROOT / "README.md"
OUT = ROOT / "assets" / "readme"
BLOG_UI = ROOT / "blog-ui"

REN = BLOG_UI / "celeste-font-en" / "Renogare-Regular.otf"
CJK = BLOG_UI / "fonts" / "NotoSansCJKsc-Medium.otf"
EMOJI = Path(r"C:\Windows\Fonts\seguiemj.ttf")
MONO = Path(r"C:\Windows\Fonts\consola.ttf")

BODY_LIGHT, BODY_DARK = (31, 35, 40), (230, 237, 243)
LINK_LIGHT, LINK_DARK = (9, 105, 218), (47, 129, 247)
HEAD_LIGHT, HEAD_DARK = (58, 44, 92), (208, 196, 255)
QUOTE_LIGHT, QUOTE_DARK = (89, 99, 110), (145, 152, 161)
CHIP_LIGHT = (175, 184, 193, 64)     # GitHub inline-code bg, light
CHIP_DARK = (110, 118, 129, 102)     # same, dark
Q_UI = 92

VS, ZWJ = "️", "‍"
EMOJI_PX = 109                       # Segoe UI Emoji only rasterizes color at 109

# ---------------------------------------------------------------- fonts / coverage
cov: dict[str, set] = {}
for p in (REN, CJK, EMOJI, MONO):
    cov[str(p)] = set(TTFont(str(p)).getBestCmap()) if p.exists() else set()

_fonts: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font_for(path: Path, px: int) -> ImageFont.FreeTypeFont:
    key = (str(path), px)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(str(path), px)
    return _fonts[key]


def clusters(text: str) -> list[str]:
    """Grapheme-ish clusters: keep VS16 / ZWJ sequences attached to their base."""
    out, i = [], 0
    while i < len(text):
        cl = text[i]
        i += 1
        while i < len(text) and text[i] in (VS, ZWJ):
            cl += text[i]
            i += 1
            if cl.endswith(ZWJ) and i < len(text):
                cl += text[i]
                i += 1
        out.append(cl)
    return out


def pick(cl: str) -> Path:
    base = [c for c in cl if c not in (VS, ZWJ)]
    if all(ord(c) in cov[str(REN)] for c in base):
        return REN
    if all(ord(c) in cov[str(CJK)] for c in base):
        return CJK
    if base and ord(base[0]) in cov[str(EMOJI)]:
        return EMOJI
    return CJK


_emoji_tiles: dict[tuple[str, int], Image.Image] = {}


def emoji_tile(cl: str, px: int) -> Image.Image:
    key = (cl, px)
    if key in _emoji_tiles:
        return _emoji_tiles[key]
    f = font_for(EMOJI, EMOJI_PX)
    tile = Image.new("RGBA", (EMOJI_PX + 40, EMOJI_PX + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.text((20, 20), cl, font=f, embedded_color=True)
    tile = trim(tile)
    h = int(px * 1.12)
    w = max(1, round(tile.width * h / tile.height))
    tile = tile.resize((w, h), Image.LANCZOS)
    _emoji_tiles[key] = tile
    return tile


def trim(im: Image.Image, pad: int = 0) -> Image.Image:
    box = im.getbbox()
    if box:
        im = im.crop(box)
    if pad:
        canvas = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
        canvas.paste(im, (pad, pad), im)
        im = canvas
    return im


def cluster_width(cl: str, px: int, kind: str) -> float:
    if pick(cl) == EMOJI:
        return emoji_tile(cl, px).width
    if kind == "code" and ord(cl[0]) in cov[str(MONO)]:
        return font_for(MONO, int(px * 0.9)).getlength(cl)
    return font_for(pick(cl), px).getlength(cl)


def seg_width(text: str, px: int, kind: str) -> float:
    return sum(cluster_width(c, px, kind) for c in clusters(text))


# ---------------------------------------------------------------- inline markdown
# seg = (kind, text, url, bold) ; kind in {text, italic, code, link}
TOKEN = re.compile(
    r"\[([^\]]+)\]\(([^)]+)\)"      # 1,2 link
    r"|\*\*([^*]+)\*\*"             # 3 bold
    r"|\*([^*]+)\*"                 # 4 italic
    r"|`([^`]+)`"                   # 5 code
)


def parse_inline(text: str) -> list[tuple[str, str, str | None, bool]]:
    segs, pos = [], 0
    for m in TOKEN.finditer(text):
        if m.start() > pos:
            segs.append(("text", text[pos:m.start()], None, False))
        if m.group(1) is not None:
            inner, url = m.group(1), m.group(2)
            bold = inner.startswith("**") and inner.endswith("**")
            if bold:
                inner = inner[2:-2]
            segs.append(("link", inner, url, bold))
        elif m.group(3) is not None:
            segs.append(("text", m.group(3), None, True))
        elif m.group(4) is not None:
            # 用户反馈斜体没必要——合并进正体，不再走 faux shear
            segs.append(("text", m.group(4), None, False))
        else:
            segs.append(("code", m.group(5), None, False))
        pos = m.end()
    if pos < len(text):
        segs.append(("text", text[pos:], None, False))
    return [(k, t, u, b) for k, t, u, b in segs if t != ""]


def plain(segs) -> str:
    return "".join(t for _, t, _, _ in segs)


def esc_alt(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "'")


def slugify(t: str) -> str:
    t = re.sub(r"[*`]", "", t).lower()
    return re.sub(r"[^a-z0-9一-鿿]+", "-", t).strip("-")


def split_emoji_prefix(text: str) -> tuple[str, str]:
    pref = ""
    while text:
        c0 = clusters(text)[0]
        base = [c for c in c0 if c not in (VS, ZWJ)]
        uncovered = all(ord(c) not in cov[str(REN)] and ord(c) not in cov[str(CJK)] for c in base)
        vs_emoji = VS in c0 and base and ord(base[0]) in cov[str(EMOJI)]
        if base and ord(base[0]) >= 0x2000 and (uncovered or vs_emoji):
            pref += c0
            text = text[len(c0):]
        else:
            break
    return pref, text.lstrip()


# ---------------------------------------------------------------- baking
_counter = 0
_manifest: dict[str, tuple[int, str]] = {}   # slug -> (display_w, alt)
_report: list[tuple[str, int]] = []


def wrap_payload(payload, px: int, wrap_w: float | None):
    """payload: [line]; line = [seg]. Word-wrap each source line independently."""
    out = []
    for line in payload:
        if wrap_w is None:
            out.append(line)
            continue
        words = []  # (kind, word, url, bold)
        for kind, text, url, b in line:
            for w in text.split(" "):
                if w:
                    words.append((kind, w, url, b))
        cur, cur_w = [], 0.0
        for kind, w, url, b in words:
            piece = (" " if cur else "") + w
            pw = seg_width(piece, px, kind)
            if cur and cur_w + pw > wrap_w:
                out.append(cur)
                cur, cur_w, piece, pw = [], 0.0, w, seg_width(w, px, kind)
            cur.append((kind, piece, url, b))
            cur_w += pw
        if cur:
            out.append(cur)
    return out


def _line_metrics(lines, px):
    asc = desc = 0
    widths = []
    for line in lines:
        w = 8.0
        for kind, text, _, _ in line:
            for cl in clusters(text):
                w += cluster_width(cl, px, kind)
                if pick(cl) == EMOJI:
                    a, d = px, int(px * 0.1)
                elif kind == "code" and ord(cl[0]) in cov[str(MONO)]:
                    a, d = font_for(MONO, int(px * 0.9)).getmetrics()
                else:
                    a, d = font_for(pick(cl), px).getmetrics()
                asc, desc = max(asc, a), max(desc, d)
        widths.append(w)
    return asc, desc, widths


def italic_tile(text: str, px: int, fg, stroke: int) -> Image.Image:
    pad = 4
    w = int(seg_width(text, px, "text")) + pad * 2
    a, d = 0, 0
    for cl in clusters(text):
        ca, cd = font_for(pick(cl), px).getmetrics()
        a, d = max(a, ca), max(d, cd)
    h = a + d + pad * 2
    tile = Image.new("RGBA", (w + int(h * 0.3) + 4, h), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    x = pad
    for cl in clusters(text):
        f = font_for(pick(cl), px)
        ca, _ = f.getmetrics()
        td.text((x, pad + a - ca), cl, font=f, fill=fg + (255,),
                stroke_width=stroke, stroke_fill=fg + (255,))
        x += f.getlength(cl)
    slant = 0.28
    new_w = tile.width + int(tile.height * slant)
    return tile.transform((new_w, tile.height), Image.AFFINE,
                          (1, -slant, slant * tile.height, 0, 1, 0),
                          resample=Image.BICUBIC)


def render(lines, px: int, theme: str, color: str, bold_all: bool,
           icon: Image.Image | None = None) -> Image.Image:
    fg = {
        "body": BODY_LIGHT if theme == "" else BODY_DARK,
        "head": HEAD_LIGHT if theme == "" else HEAD_DARK,
        "quote": QUOTE_LIGHT if theme == "" else QUOTE_DARK,
    }[color]
    link_fg = LINK_LIGHT if theme == "" else LINK_DARK
    chip = CHIP_LIGHT if theme == "" else CHIP_DARK
    stroke = max(1, px // 24)
    lh = int(px * 1.7)
    asc, desc, widths = _line_metrics(lines, px)
    gap = int(px * 0.45) if icon else 0
    icon_w = (icon.width + gap) if icon else 0
    W = int(max(widths)) + 8 + icon_w
    H = asc + desc + 8 + lh * (len(lines) - 1)
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if icon:
        img.alpha_composite(icon, (4, 4 + (asc + desc) // 2 - icon.height // 2))
    d = ImageDraw.Draw(img)
    for li, line in enumerate(lines):
        y_base = 4 + asc + li * lh
        x = 4.0 + icon_w
        for kind, text, _, b in line:
            bold = b or bold_all
            if kind == "italic":
                tile = italic_tile(text, px, link_fg if False else fg, stroke if bold else 0)
                img.alpha_composite(tile, (int(x), y_base - asc - 4))
                x += tile.width - 4
                continue
            col = link_fg if kind == "link" else fg
            if kind == "code":
                w_seg = seg_width(text, px, "code")
                mf = font_for(MONO, int(px * 0.9))
                ma, md = mf.getmetrics()
                d.rounded_rectangle([x - 6, y_base - ma - 4, x + w_seg + 6, y_base + md + 4],
                                    radius=8, fill=chip)
                for cl in clusters(text):
                    f = mf if ord(cl[0]) in cov[str(MONO)] else font_for(pick(cl), px)
                    a, _ = f.getmetrics()
                    d.text((x, y_base - a), cl, font=f, fill=fg + (255,))
                    x += f.getlength(cl)
                continue
            for cl in clusters(text):
                if pick(cl) == EMOJI:
                    tile = emoji_tile(cl, px)
                    img.alpha_composite(tile, (int(x), y_base + int(px * 0.10) - tile.height))
                    x += tile.width
                    continue
                f = font_for(pick(cl), px)
                a, _ = f.getmetrics()
                kw = {"stroke_width": stroke, "stroke_fill": col + (255,)} if bold else {}
                d.text((x, y_base - a), cl, font=f, fill=col + (255,), **kw)
                x += f.getlength(cl)
    return trim(img)


def bake(payload, disp_px: int, color: str = "body", bold: bool = False,
         wrap: float | None = None, icon: str | None = None) -> str:
    """payload: [line]; line = [seg]. Bakes light+dark, returns slug."""
    global _counter
    _counter += 1
    slug = f"t{_counter:03d}"
    px = disp_px * 2
    if bold:
        payload = [[(k, t, u, True) for k, t, u, _ in line] for line in payload]
    lines = wrap_payload(payload, px, wrap * 2 if wrap else None)
    alt = esc_alt(" ".join(plain(l) for l in payload))
    icon_img = None
    if icon:
        art = Image.open(ROOT / icon).convert("RGBA")
        h = int(px * 1.15)
        icon_img = art.resize((max(1, round(art.width * h / art.height)), h),
                              Image.LANCZOS)
    img = None
    for theme in ("", "-dark"):
        img = render(lines, px, theme, color, bold_all=False, icon=icon_img)
        path = OUT / f"{slug}{theme}.webp"
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path, "WEBP", quality=Q_UI, method=4)
        _report.append((f"{slug}{theme}.webp", path.stat().st_size))
    _manifest[slug] = (img.width // 2, alt)
    return slug


def pic(slug: str, link: str | None = None) -> str:
    w, alt = _manifest[slug]
    p = (f'<picture><source media="(prefers-color-scheme: dark)" '
         f'srcset="assets/readme/{slug}-dark.webp">'
         f'<img src="assets/readme/{slug}.webp" width="{w}" alt="{alt}"></picture>')
    return f'<a href="{link}">{p}</a>' if link else p


def segs_html(segs, disp_px: int, wrap=None, color: str = "body", bold_all: bool = False) -> str:
    """Bake a segment list to inline HTML. Link segments become their own
    images wrapped in real <a> tags; neighbouring text merges into one image."""
    if bold_all:
        segs = [(k, t, u, True) for k, t, u, _ in segs]
    if not any(k == "link" for k, *_ in segs):
        return pic(bake([segs], disp_px, color=color, wrap=wrap))

    # split into groups around links; trailing punctuation merges into the link image
    groups: list[list] = []
    cur: list = []
    for seg in segs:
        if seg[0] == "link":
            if cur:
                groups.append(cur)
                cur = []
            groups.append([seg])
        else:
            if groups and not cur and groups[-1][0][0] == "link" \
                    and 0 < len(seg[1].strip()) <= 2 \
                    and all(c in "!?),.;:" for c in seg[1].strip()):
                k, t, u, b = seg
                groups[-1].append(("text", t, None, b))
            else:
                cur.append(seg)
    if cur:
        groups.append(cur)

    parts = []
    for g in groups:
        if g[0][0] == "link":
            link_seg = g[0]
            url = link_seg[2]
            if url.startswith("#"):      # TOC anchor: retarget to our explicit <a name>
                _, rest = split_emoji_prefix(link_seg[1])
                url = "#" + slugify(re.sub(r"\*\*", "", rest))
            slug = bake([[(k, t.strip() if len(g) > 1 else t, u, b) for k, t, u, b in g]],
                        disp_px, color=color)
            parts.append(pic(slug, url))
        else:
            # only the outer edges face HTML-provided gaps; inner spacing stays
            g = [(k, t.lstrip(" ") if i == 0 else t, u, b)
                 for i, (k, t, u, b) in enumerate(g)]
            k, t, u, b = g[-1]
            g[-1] = (k, t.rstrip(" "), u, b)
            if not plain(g).strip():
                continue
            parts.append(pic(bake([g], disp_px, color=color)))
    return " ".join(parts)


# ---------------------------------------------------------------- markdown blocks
def is_special(l: str) -> bool:
    s = l.strip()
    return (not s or s.startswith(("```", "#", "|", ">", "<", "[!["))
            or s == "---" or re.match(r"(-\s+|\d+\.\s+)", s))


def split_row(l: str) -> list[str]:
    s = l.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def align_of(sep_cell: str) -> str:
    s = sep_cell.strip()
    if s.startswith(":") and s.endswith(":"):
        return "center"
    if s.endswith(":"):
        return "right"
    return "left"


def cell_html(cell: str, header: bool, align: str) -> str:
    tag = "th" if header else "td"
    if "<img" in cell:                   # 仅 icon cells 保留原文，URL 也走烘焙
        inner = cell
    else:
        inner = segs_html(parse_inline(cell), 16, wrap=(300 if header else 480),
                          bold_all=header)
    return f'<{tag} align="{align}">{inner}</{tag}>'


def convert(md: str) -> str:
    lines = md.split("\n")
    out: list[str] = []

    # ---- header: emitted verbatim (banner / postcard / badges are pre-baked art)
    first_hr = next(i for i, l in enumerate(lines) if l.strip() == "---")
    head = lines[:first_hr]
    while head and not head[0].strip():
        head.pop(0)
    while head and not head[-1].strip():
        head.pop()
    if head:
        out += head + [""]

    i = first_hr
    n = len(lines)

    def block(*ls: str) -> None:
        """Append a block, guaranteeing a blank line separates it from the last one."""
        if out and out[-1] != "":
            out.append("")
        out.extend(ls)

    while i < n:
        l = lines[i]
        s = l.strip()
        if not s:
            i += 1
            continue

        if s.startswith("```"):                          # fenced code: verbatim
            j = i + 1
            while j < n and not lines[j].strip().startswith("```"):
                j += 1
            block(*lines[i:j + 1], "")
            i = j + 1
        elif s == "---":
            block("---", "")
            i += 1
        elif s.startswith("<") or s.startswith("[!["):   # raw html / badges
            html_lines = []
            while i < n and (lines[i].strip().startswith("<")
                             or lines[i].strip().startswith("[![")):
                html_lines.append(lines[i])
                i += 1
            block(*html_lines, "")
        elif m := re.match(r"(#{1,6})\s+(.*)", l):       # heading
            level = len(m.group(1))
            body = m.group(2).strip()
            icon = None
            icon_tag = ""
            im = re.match(r'<img\s+src="([^"]+)"[^>]*>\s*(.*)$', body)
            if im:                                       # game icon replaces emoji
                icon, body = im.group(1), im.group(2)
            emoji_pref, rest = split_emoji_prefix(body)
            segs = parse_inline(rest)
            size = {2: 18, 3: 16}.get(level, 16)
            if icon and icon.lower().endswith(".gif"):   # animated: keep as <img>
                icon_tag = f'<img src="{icon}" height="{int(size * 1.875)}"> '
                icon = None
            slug = bake([segs], size, color="head", bold=True, icon=icon)
            if level == 2:
                block(f'<a name="{slugify(plain(segs))}"></a>', "")
            block("#" * level + " " + (emoji_pref + " " if emoji_pref else "")
                  + icon_tag + pic(slug), "")
            i += 1
        elif s.startswith("|"):                          # table
            tbl = []
            while i < n and lines[i].strip().startswith("|"):
                tbl.append(lines[i])
                i += 1
            rows = [split_row(r) for r in tbl]
            header, sep, body = rows[0], rows[1], rows[2:]
            aligns = [align_of(c) for c in sep]
            ncol = len(header)
            aligns += ["left"] * (ncol - len(aligns))
            tlines = ["<table>",
                      "<tr>" + "".join(cell_html(c, True, aligns[k])
                                       for k, c in enumerate(header)) + "</tr>"]
            for r in body:
                r += [""] * (ncol - len(r))
                tlines.append("<tr>" + "".join(cell_html(c, False, aligns[k])
                                               for k, c in enumerate(r[:ncol])) + "</tr>")
            tlines += ["</table>", ""]
            block(*tlines)
        elif s.startswith(">"):                          # blockquote
            entries = []                                 # ("text", segs) / ("item", segs)
            while i < n and lines[i].strip().startswith(">"):
                q = lines[i].strip()[1:].lstrip()
                i += 1
                if not q:
                    continue
                if qm := re.match(r"-\s+(.*)", q):
                    entries.append(("item", parse_inline(qm.group(1))))
                else:
                    entries.append(("text", parse_inline(q)))
            qo: list[str] = []
            buf = []
            for kind, segs in entries + [("flush", None)]:
                if kind == "text":
                    buf.append(segs)
                    continue
                if buf:
                    qo.append("> " + pic(bake(buf, 16, color="quote", wrap=860)))
                    buf = []
                if kind == "item":
                    qo.append("> - " + segs_html(segs, 16, wrap=820, color="quote"))
            block(*qo, "")
        elif re.match(r"(-\s+|\d+\.\s+)", l):            # list block
            items = []
            while i < n and (lm := re.match(r"((?:-|\d+\.)\s+)(\[[ xX]\]\s+)?(.*)",
                                            lines[i])):
                marker, box, text = lm.group(1), lm.group(2) or "", lm.group(3)
                prefix = ""
                if pm := re.match(r"<img\s[^>]*>\s*", text):   # leading icon: raw
                    prefix, text = pm.group(0), text[pm.end():]
                items.append(marker + box + prefix
                             + segs_html(parse_inline(text), 16, wrap=860))
                i += 1
            block(*items, "")
        else:                                            # paragraph
            para = [l]
            while i + 1 < n and not is_special(lines[i + 1]):
                i += 1
                para.append(lines[i])
            text = " ".join(x.strip() for x in para)
            block(segs_html(parse_inline(text), 16, wrap=880), "")
            i += 1

    return "\n".join(out) + "\n"


def main() -> int:
    if not SRC_MD.exists():
        print(f"source not found: {SRC_MD}", file=sys.stderr)
        return 1
    md = SRC_MD.read_text(encoding="utf-8-sig")
    OUT.mkdir(parents=True, exist_ok=True)
    html = convert(md)
    OUT_MD.write_text(html, encoding="utf-8")
    total = sum(sz for _, sz in _report)
    print(f"{len(_report)} images, {total / 1024:.0f} KB, README.md {len(html) / 1024:.1f} KB")
    # warn about clusters no font could cover (would render as tofu)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
