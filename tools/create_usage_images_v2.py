# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path.cwd()
OUT_DIR = ROOT / "使用说明图" / "新版"
RAW_DIR = ROOT / "使用说明图" / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)

CANVAS_W = 1600
CANVAS_H = 900

INK = "#172033"
TEXT = "#405066"
MUTED = "#718096"
FAINT = "#eef3f8"
LINE = "#d8e2ee"
BLUE = "#0b72b7"
RED = "#b51f32"
GREEN = "#18865a"
GOLD = "#c9962f"
WHITE = "#ffffff"


FONT_CANDIDATES = [
    (Path(r"C:\Windows\Fonts\Noto Sans SC (TrueType).otf"), Path(r"C:\Windows\Fonts\Noto Sans SC Bold (TrueType).otf")),
    (Path(r"C:\Windows\Fonts\msyh.ttc"), Path(r"C:\Windows\Fonts\msyhbd.ttc")),
    (Path(r"C:\Windows\Fonts\simhei.ttf"), Path(r"C:\Windows\Fonts\simhei.ttf")),
]


def _font_path(bold: bool = False) -> Path:
    for regular, bold_path in FONT_CANDIDATES:
        candidate = bold_path if bold else regular
        if candidate.exists():
            return candidate
    return Path(r"C:\Windows\Fonts\arial.ttf")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(_font_path(bold)), size)


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_h(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont) -> int:
    box = draw.textbbox((0, 0), text, font=f)
    return box[3] - box[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for ch in text:
        candidate = current + ch
        if ch == "\n":
            lines.append(current)
            current = ""
            continue
        if draw.textlength(candidate, font=f) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = ch
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    f: ImageFont.FreeTypeFont,
    fill: str,
    max_width: int,
    line_gap: int = 8,
) -> int:
    for line in wrap_text(draw, text, f, max_width):
        draw.text((x, y), line, font=f, fill=fill)
        y += text_h(draw, line, f) + line_gap
    return y


def draw_header(draw: ImageDraw.ImageDraw, num: str, title: str, subtitle: str) -> None:
    rounded(draw, (54, 38, 1546, 126), 26, WHITE, LINE, 2)
    rounded(draw, (82, 58, 138, 106), 15, RED)
    draw.text((110, 82), num, font=font(22, True), fill=WHITE, anchor="mm")
    draw.text((166, 54), title, font=font(34, True), fill=INK)
    draw.text((168, 94), subtitle, font=font(18), fill=MUTED)
    draw.text((1418, 66), "美工助手", font=font(20, True), fill=BLUE, anchor="ra")
    draw.text((1418, 94), "AI 套版拼接工具说明图", font=font(15), fill=MUTED, anchor="ra")


def shadow_card(base: Image.Image, box: tuple[int, int, int, int], radius: int = 26, fill: str = WHITE) -> ImageDraw.ImageDraw:
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    x1, y1, x2, y2 = box
    sd.rounded_rectangle((x1, y1 + 10, x2, y2 + 10), radius=radius, fill=(24, 44, 75, 32))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(shadow)
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=LINE, width=1)
    return draw


def paste_crop(
    base: Image.Image,
    raw_name: str,
    crop: tuple[int, int, int, int],
    box: tuple[int, int, int, int],
    radius: int = 20,
    label: str | None = None,
    mode: str = "contain",
) -> None:
    raw = Image.open(RAW_DIR / raw_name).convert("RGBA")
    piece = raw.crop(crop)
    w, h = box[2] - box[0], box[3] - box[1]
    if mode == "cover":
        piece = ImageOps.fit(piece, (w, h), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))
        px, py = 0, 0
    else:
        piece = ImageOps.contain(piece, (w, h), method=Image.Resampling.LANCZOS)
        px = (w - piece.width) // 2
        py = (h - piece.height) // 2

    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    shadow_card(base, box, radius=radius, fill=WHITE)
    bg = Image.new("RGBA", (w, h), "#fbfdff")
    bg.alpha_composite(piece, (px, py))
    base.paste(bg, (box[0], box[1]), mask)

    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle(box, radius=radius, outline="#cbd8e6", width=2)
    if label:
        rounded(draw, (box[0] + 18, box[1] + 18, box[0] + 18 + 12 * len(label) + 42, box[1] + 52), 12, "#172033d8")
        draw.text((box[0] + 38, box[1] + 25), label, font=font(14, True), fill=WHITE)


def pill(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, color: str, pad_x: int = 18) -> int:
    f = font(16, True)
    w = int(draw.textlength(text, font=f)) + pad_x * 2
    rounded(draw, (x, y, x + w, y + 36), 18, color)
    draw.text((x + pad_x, y + 8), text, font=f, fill=WHITE)
    return x + w + 10


def info_panel(base: Image.Image, box: tuple[int, int, int, int], heading: str, items: Iterable[tuple[str, str]], accent: str = BLUE) -> None:
    draw = shadow_card(base, box, radius=24, fill=WHITE)
    x1, y1, x2, _ = box
    draw.text((x1 + 30, y1 + 28), heading, font=font(24, True), fill=INK)
    draw.line((x1 + 30, y1 + 70, x2 - 30, y1 + 70), fill=LINE, width=2)
    y = y1 + 94
    for idx, (title, body) in enumerate(items, start=1):
        draw.ellipse((x1 + 30, y, x1 + 62, y + 32), fill=accent if idx % 2 else GREEN)
        draw.text((x1 + 46, y + 16), str(idx), font=font(16, True), fill=WHITE, anchor="mm")
        draw.text((x1 + 78, y - 1), title, font=font(20, True), fill=INK)
        y = draw_wrapped(draw, body, x1 + 78, y + 32, font(16), TEXT, x2 - x1 - 108, 7)
        y += 24


def callout(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, color: str = BLUE) -> None:
    draw.ellipse((x, y, x + 30, y + 30), fill=color)
    draw.text((x + 15, y + 15), text[:1], font=font(16, True), fill=WHITE, anchor="mm")


def flow(draw: ImageDraw.ImageDraw, steps: list[str], y: int, colors: list[str]) -> None:
    x = 80
    w = 300
    h = 78
    for i, step in enumerate(steps):
        rounded(draw, (x, y, x + w, y + h), 20, WHITE, LINE, 2)
        draw.ellipse((x + 22, y + 23, x + 54, y + 55), fill=colors[i])
        draw.text((x + 38, y + 39), str(i + 1), font=font(16, True), fill=WHITE, anchor="mm")
        draw.text((x + 70, y + 22), step, font=font(20, True), fill=INK)
        if i < len(steps) - 1:
            draw.line((x + w + 10, y + h // 2, x + w + 64, y + h // 2), fill="#9fb2c7", width=3)
            draw.polygon([(x + w + 64, y + h // 2), (x + w + 50, y + h // 2 - 8), (x + w + 50, y + h // 2 + 8)], fill="#9fb2c7")
        x += w + 80


def ai_plan_mock(base: Image.Image, box: tuple[int, int, int, int]) -> None:
    draw = shadow_card(base, box, radius=24, fill=WHITE)
    x1, y1, x2, _ = box
    rounded(draw, (x1 + 22, y1 + 22, x1 + 150, y1 + 58), 18, INK)
    draw.text((x1 + 44, y1 + 30), "AI 对话区", font=font(15, True), fill=WHITE)

    draw.text((x1 + 28, y1 + 76), "用户输入", font=font(18, True), fill=INK)
    rounded(draw, (x1 + 28, y1 + 106, x2 - 28, y1 + 180), 18, "#f6f8fb", LINE, 1)
    draw_wrapped(draw, "配色统一改成红色，商品名合适，产品图不要盖字，全部 SKU。", x1 + 48, y1 + 126, font(18), TEXT, x2 - x1 - 96, 7)

    rounded(draw, (x1 + 28, y1 + 206, x2 - 28, y1 + 244), 18, "#e8f3fb", "#cfe3f2", 1)
    draw.text((x1 + 50, y1 + 215), "DeepSeek · deepseek-v4-flash", font=font(16, True), fill=BLUE)

    draw.text((x1 + 28, y1 + 270), "AI 输出草稿", font=font(18, True), fill=INK)
    items = [
        ("统一主题变量", "主色 #b51e2c，绑定标题、胶囊、底部条、表格。"),
        ("创建素材变体", "缺少红色底板时，改色 SVG 后放入素材库。"),
        ("调整布局与质检", "商品名适配，产品图避开文字。"),
    ]
    y = y1 + 306
    for idx, (title, body) in enumerate(items, start=1):
        draw.ellipse((x1 + 34, y + 2, x1 + 58, y + 26), fill=[RED, BLUE, GOLD, GREEN][idx - 1])
        draw.text((x1 + 46, y + 14), str(idx), font=font(13, True), fill=WHITE, anchor="mm")
        draw.text((x1 + 72, y - 2), title, font=font(17, True), fill=INK)
        draw_wrapped(draw, body, x1 + 72, y + 26, font(14), TEXT, x2 - x1 - 110, 5)
        y += 72

    rounded(draw, (x1 + 28, box[3] - 64, x2 - 28, box[3] - 24), 18, RED)
    draw.text(((x1 + x2) // 2, box[3] - 44), "确认应用到成品图", font=font(17, True), fill=WHITE, anchor="mm")


def base_slide(num: str, title: str, subtitle: str) -> Image.Image:
    base = Image.new("RGBA", (CANVAS_W, CANVAS_H), "#f6f8fb")
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle((-80, 680, 690, 980), 80, fill="#eaf2f8")
    draw.rounded_rectangle((1060, -120, 1700, 190), 90, fill="#f4e8eb")
    draw_header(draw, num, title, subtitle)
    return base


def save(base: Image.Image, name: str) -> Path:
    out = OUT_DIR / name
    base.convert("RGB").save(out, quality=96)
    return out


def slide_01() -> Path:
    base = base_slide("01", "AI 对话：从自然语言到可确认计划", "先让 AI 出结构化草稿，确认后再批量控制模板和素材。")
    draw = ImageDraw.Draw(base)
    ai_plan_mock(base, (76, 164, 502, 742))
    paste_crop(base, "01-ai-draft.png", (620, 110, 1265, 755), (560, 164, 1116, 532), label="实时预览")
    info_panel(
        base,
        (1160, 166, 1528, 622),
        "开发要点",
        [
            ("自然语言不是假按钮", "LLM 要读取当前 SKU、素材库、图层和模板配置，再输出可执行计划。"),
            ("计划必须可审查", "每个动作拆成：改主题色、建素材变体、调图层、跑质检、应用范围。"),
            ("确认后才执行", "AI 不直接覆盖成品图，用户点击确认后再写入覆盖配置。"),
        ],
        RED,
    )
    flow(draw, ["输入套版要求", "生成操作草稿", "人工确认", "批量应用 SKU"], 774, [RED, BLUE, GOLD, GREEN])
    return save(base, "01-AI对话到可确认计划.png")


def slide_02() -> Path:
    base = base_slide("02", "确认后执行：批量套版与即时质检", "AI 应用的是模板图层和真实素材，不生成整张产品图。")
    draw = ImageDraw.Draw(base)
    paste_crop(base, "02-applied-result.png", (520, 105, 1370, 760), (74, 170, 754, 650), label="成品图预览")
    paste_crop(base, "02-applied-result.png", (248, 0, 510, 820), (790, 170, 1096, 590), label="执行日志", mode="cover")
    info_panel(
        base,
        (1140, 170, 1530, 724),
        "需要呈现给开发方",
        [
            ("状态追踪", "显示已应用到哪些 SKU、创建了哪些素材变体，以及是否仍需人工处理。"),
            ("质量规则同步", "执行后立即检查：商品名不溢出、产品图不盖字、安全边距正确。"),
            ("可回退覆盖配置", "批量结果写到 SKU 覆盖配置，不污染原模板和原始素材。"),
        ],
        BLUE,
    )
    pill(draw, 790, 626, "真实产品图", GREEN)
    pill(draw, 920, 626, "模板素材", BLUE)
    pill(draw, 1044, 626, "文字渲染", RED)
    draw.text((790, 676), "合成逻辑：真实素材 + 可编辑图层 + 参数数据", font=font(22, True), fill=INK)
    draw_wrapped(draw, "禁止把整张成品图交给 AI 生成；AI 只负责判断、建议、改色、排版和质检。", 790, 714, font(18), TEXT, 320)
    return save(base, "02-确认后批量套版与质检.png")


def slide_03() -> Path:
    base = base_slide("03", "素材库：底板、顶板、LOGO 可组合保存", "已有设计素材优先复用；缺少颜色时由 AI 改色生成素材变体并入库。")
    draw = ImageDraw.Draw(base)
    paste_crop(base, "03-material-library.png", (255, 880, 500, 1272), (72, 172, 498, 700), label="模板素材库")
    paste_crop(base, "03-material-library.png", (705, 130, 1190, 610), (558, 172, 1038, 488), label="套版效果")
    slots = [
        ("底板", RED),
        ("顶板", BLUE),
        ("LOGO", INK),
        ("服务块", GREEN),
        ("参数胶囊", GOLD),
        ("角标", "#8c5a9e"),
    ]
    x, y = 558, 530
    for i, (label, color) in enumerate(slots):
        bx = x + (i % 3) * 160
        by = y + (i // 3) * 92
        rounded(draw, (bx, by, bx + 138, by + 64), 18, WHITE, LINE, 2)
        draw.rectangle((bx + 18, by + 22, bx + 52, by + 42), fill=color)
        draw.text((bx + 66, by + 20), label, font=font(18, True), fill=INK)
    info_panel(
        base,
        (1100, 172, 1530, 700),
        "素材库规则",
        [
            ("按槽位替换", "模板保存的是槽位关系，不把一次出图结果新增为模板类别。"),
            ("自动做变体", "例如没有深红底板时，AI 基于蓝色 SVG 改色后放入素材库。"),
            ("手动保存套装", "用户确认后可把底板、顶板、LOGO、胶囊组合保存为一整套。"),
        ],
        GREEN,
    )
    return save(base, "03-素材库组合与变体入库.png")


def slide_04() -> Path:
    base = base_slide("04", "模板调整：图层级位置、尺寸、颜色都可控", "保留专业底板设计，只开放必要图层给 AI 和人工微调。")
    draw = ImageDraw.Draw(base)
    paste_crop(base, "04-layer-inspector-title.png", (710, 130, 1190, 610), (70, 168, 642, 536), label="画布选中图层")
    paste_crop(base, "04-layer-inspector-title.png", (1390, 180, 1722, 1265), (700, 168, 1048, 730), label="属性面板", mode="cover")
    info_panel(
        base,
        (1090, 168, 1530, 730),
        "图层控制项",
        [
            ("布局安全", "商品名字号自动适配，产品图与标题、胶囊、卖点条保持最小间距。"),
            ("属性实时生效", "位置、尺寸、缩放、旋转、透明度、阴影、颜色改动后立即重绘。"),
            ("AI 可控但不越界", "AI 只能修改开放字段和覆盖配置，不能破坏锁定层和原模板。"),
        ],
        RED,
    )
    draw.text((88, 585), "固定成品图类型", font=font(22, True), fill=INK)
    categories = ["主图", "参数表", "工程图", "白底图", "详情模块"]
    cx = 88
    for i, name in enumerate(categories):
        cx = pill(draw, cx, 624, name, [BLUE, RED, GREEN, GOLD, "#526173"][i], 20)
    draw_wrapped(draw, "AI 出稿时只更新当前类别的图层覆盖，不创建“红色主图”“红色参数表”等新分类。", 88, 684, font(18), TEXT, 510)
    return save(base, "04-模板图层微调面板.png")


def slide_05() -> Path:
    base = base_slide("05", "参数表与主题色：所有蓝色组件都要可配置", "参数胶囊、标题、表头、斑马纹、边框和文字色统一纳入主题变量。")
    draw = ImageDraw.Draw(base)
    paste_crop(base, "05-table-inspector.png", (705, 130, 1190, 610), (74, 168, 660, 540), label="参数表成品图")
    paste_crop(base, "05-table-inspector.png", (1390, 180, 1722, 1210), (708, 168, 1048, 728), label="表格属性", mode="cover")
    info_panel(
        base,
        (1090, 168, 1530, 728),
        "颜色变量应覆盖",
        [
            ("全局主题色", "红色主题应同时影响标题、胶囊、底部条、参数表表头和边框。"),
            ("表格独立项", "表头色、斑马纹、文字色、边框色、圆角和行高都可单独调整。"),
            ("AI 可批量控制", "用户说“配色统一改成红色”时，所有绑定变量一起更新。"),
        ],
        BLUE,
    )
    palette = [
        ("主色", RED),
        ("参数胶囊", "#c53043"),
        ("表头", "#b51f32"),
        ("斑马纹", "#f7dfe2"),
        ("边框", "#d79aa2"),
        ("文字", INK),
    ]
    x, y = 96, 610
    for i, (label, color) in enumerate(palette):
        bx = x + i * 165
        rounded(draw, (bx, y, bx + 132, y + 82), 18, WHITE, LINE, 2)
        draw.rounded_rectangle((bx + 18, y + 18, bx + 58, y + 58), radius=10, fill=color)
        draw.text((bx + 70, y + 26), label, font=font(17, True), fill=INK)
    return save(base, "05-参数表与主题色统一控制.png")


def slide_06() -> Path:
    base = base_slide("06", "AI 套版 Skill：把基础排版问题挡在出图前", "AI 不只是改颜色，还要在批量套版前后检查可用性和视觉质量。")
    draw = ImageDraw.Draw(base)

    steps = [
        ("读需求", "解析用户自然语言：配色、SKU 范围、模板类型、特殊限制。", RED),
        ("读上下文", "读取当前模板、素材槽位、图层锁定状态和 SKU 参数。", BLUE),
        ("生成动作", "输出可审查计划：改变量、创素材、调图层、质检。", GOLD),
        ("确认执行", "用户确认后才写覆盖配置并批量套版。", GREEN),
        ("质检修正", "发现溢出、遮挡、间距不足时自动给出修正建议。", "#6b46c1"),
    ]
    x, y = 84, 176
    for i, (title, body, color) in enumerate(steps):
        bx = x + (i % 3) * 480
        by = y + (i // 3) * 190
        rounded(draw, (bx, by, bx + 420, by + 142), 26, WHITE, LINE, 2)
        draw.ellipse((bx + 28, by + 30, bx + 78, by + 80), fill=color)
        draw.text((bx + 53, by + 55), str(i + 1), font=font(22, True), fill=WHITE, anchor="mm")
        draw.text((bx + 98, by + 28), title, font=font(24, True), fill=INK)
        draw_wrapped(draw, body, bx + 98, by + 68, font(17), TEXT, 284, 7)

    rules = [
        "商品名不压产品图，最长型号自动缩小或换行",
        "产品图必须完整可见，保留安全边距",
        "胶囊、表格、标题、卖点条颜色受主题变量控制",
        "锁定层不被 AI 改动，原始模板不被污染",
        "缺素材时优先改色生成局部素材，不生成整张成品图",
        "导出前检查尺寸、清晰度、透明图保真和文字溢出",
    ]
    rounded(draw, (84, 604, 1516, 802), 28, WHITE, LINE, 2)
    draw.text((118, 632), "内置质量检查清单", font=font(26, True), fill=INK)
    for i, item in enumerate(rules):
        bx = 118 + (i % 2) * 690
        by = 684 + (i // 2) * 36
        draw.ellipse((bx, by + 3, bx + 18, by + 21), fill=GREEN)
        draw.line((bx + 5, by + 12, bx + 8, by + 17), fill=WHITE, width=3)
        draw.line((bx + 8, by + 17, bx + 15, by + 7), fill=WHITE, width=3)
        draw.text((bx + 30, by), item, font=font(17), fill=TEXT)
    return save(base, "06-AI套版质量规则.png")


def main() -> None:
    outputs = [slide_01(), slide_02(), slide_03(), slide_04(), slide_05(), slide_06()]
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
