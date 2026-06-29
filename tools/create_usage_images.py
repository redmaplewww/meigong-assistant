# -*- coding: utf-8 -*-
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path.cwd() / "\u4f7f\u7528\u8bf4\u660e\u56fe"
RAW = ROOT / "raw"
ROOT.mkdir(parents=True, exist_ok=True)

FONT_REGULAR = Path(r"C:\Windows\Fonts\Noto Sans SC (TrueType).otf")
FONT_BOLD = Path(r"C:\Windows\Fonts\Noto Sans SC Bold (TrueType).otf")
if not FONT_REGULAR.exists():
    FONT_REGULAR = Path(r"C:\Windows\Fonts\msyh.ttc")
if not FONT_BOLD.exists():
    FONT_BOLD = Path(r"C:\Windows\Fonts\msyhbd.ttc")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


W, H = 1365, 768
TITLE = "#172033"
TEXT = "#405066"
MUTED = "#6b778a"
RED = "#b51e2c"
BLUE = "#0b70b7"
GREEN = "#138a55"
BORDER = "#dbe4ee"


def draw_wrapped(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], fnt: ImageFont.FreeTypeFont, fill: str, max_width: int, line_gap: int = 6) -> int:
    x, y = xy
    line = ""
    for char in text:
        candidate = line + char
        if draw.textlength(candidate, font=fnt) <= max_width or not line:
            line = candidate
        else:
            draw.text((x, y), line, font=fnt, fill=fill)
            y += fnt.size + line_gap
            line = char
    if line:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + line_gap
    return y


def rounded(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill: str, outline: str | None = None, width: int = 1) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def add_header(draw: ImageDraw.ImageDraw, badge: str, title: str, subtitle: str) -> None:
    rounded(draw, (22, 18, W - 22, 100), 18, "#ffffffee", BORDER, 2)
    rounded(draw, (46, 31, 104, 89), 18, RED)
    draw.text((75, 60), badge, font=font(24, True), fill="white", anchor="mm")
    draw.text((122, 31), title, font=font(32, True), fill=TITLE)
    draw.text((124, 70), subtitle, font=font(17), fill=MUTED)


def add_notes(draw: ImageDraw.ImageDraw, notes: list[tuple[str, str, str]]) -> None:
    x, y, w = 980, 118, 360
    row_heights = []
    for _, _, body in notes:
        row_heights.append(88 if len(body) < 35 else 112)
    h = 28 + sum(row_heights) + 14 * (len(notes) - 1)
    rounded(draw, (x, y, x + w, y + h), 18, "#fffffff2", BORDER, 2)
    cy = y + 20
    for index, (num, title, body) in enumerate(notes):
        color = [RED, BLUE, GREEN][index % 3]
        draw.ellipse((x + 18, cy + 2, x + 50, cy + 34), fill=color)
        draw.text((x + 34, cy + 18), num, font=font(17, True), fill="white", anchor="mm")
        draw.text((x + 62, cy), title, font=font(20, True), fill=TITLE)
        draw_wrapped(draw, body, (x + 62, cy + 31), font(15), TEXT, w - 82, 5)
        cy += row_heights[index] + 14


def add_highlights(base: Image.Image, highlights: list[dict]) -> None:
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for item in highlights:
        color = item.get("color", RED)
        x, y, w, h = item["box"]
        fill = tuple(int(color.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)) + (34,)
        draw.rounded_rectangle((x, y, x + w, y + h), radius=14, outline=color, width=5, fill=fill)
        draw.ellipse((x - 16, y - 16, x + 18, y + 18), fill=color)
        draw.text((x + 1, y + 1), item["label"], font=font(18, True), fill="white", anchor="mm")
    base.alpha_composite(overlay)


def make_slide(raw_name: str, out_name: str, badge: str, title: str, subtitle: str, notes: list[tuple[str, str, str]], highlights: list[dict]) -> Path:
    screenshot = Image.open(RAW / raw_name).convert("RGBA").resize((W, H), Image.Resampling.LANCZOS)
    blur = screenshot.filter(ImageFilter.GaussianBlur(0.2))
    dim = Image.new("RGBA", (W, H), (255, 255, 255, 38))
    base = Image.alpha_composite(blur, dim)
    draw = ImageDraw.Draw(base)
    add_highlights(base, highlights)
    draw = ImageDraw.Draw(base)
    add_header(draw, badge, title, subtitle)
    add_notes(draw, notes)
    rounded(draw, (26, H - 45, 340, H - 16), 14, "#ffffffe6", BORDER, 1)
    draw.text((42, H - 39), "美工助手 · AI 套版拼接工具说明图", font=font(15), fill=MUTED)
    out_path = ROOT / out_name
    base.convert("RGB").save(out_path, quality=95)
    return out_path


SLIDES = [
    {
        "raw": "01-ai-draft.png",
        "out": "01-AI对话生成套版方案.png",
        "badge": "01",
        "title": "AI 对话生成套版方案",
        "subtitle": "用自然语言描述目标，AI 输出可确认、可审查的结构化套版计划。",
        "notes": [
            ("1", "自然语言输入", "直接描述配色、商品名、产品图间距、批量 SKU 等目标。"),
            ("2", "AI 草稿可审查", "先列出主题、素材创建和图层调整，确认前不改动成品图。"),
            ("3", "人工确认后执行", "保留确认动作，避免 LLM 直接覆盖模板或生成整张图。"),
        ],
        "highlights": [
            {"box": (210, 30, 255, 175), "label": "1"},
            {"box": (210, 240, 255, 385), "label": "2", "color": BLUE},
            {"box": (220, 640, 230, 56), "label": "3", "color": GREEN},
        ],
    },
    {
        "raw": "02-applied-result.png",
        "out": "02-确认后批量应用到成品图.png",
        "badge": "02",
        "title": "确认后批量应用到成品图",
        "subtitle": "AI 只控制真实素材和模板图层，应用后即时看到主图效果和质检状态。",
        "notes": [
            ("1", "状态可追踪", "显示已应用到全部 SKU，并说明创建了多少个素材变体。"),
            ("2", "真实拼接预览", "使用真实产品图、文字和模板组件，不生成整张图片。"),
            ("3", "质检同步", "自动检查文字溢出、产品图盖字等基础排版问题。"),
        ],
        "highlights": [
            {"box": (450, 62, 520, 36), "label": "1", "color": GREEN},
            {"box": (480, 145, 500, 520), "label": "2"},
            {"box": (890, 70, 90, 30), "label": "3", "color": BLUE},
        ],
    },
    {
        "raw": "03-material-library.png",
        "out": "03-模板素材库可组合保存.png",
        "badge": "03",
        "title": "模板素材库可组合保存",
        "subtitle": "底板、顶板、LOGO、参数胶囊等都作为可替换素材槽位管理。",
        "notes": [
            ("1", "按槽位管理素材", "用户可直接替换底板、LOGO、服务块、参数胶囊等模板部件。"),
            ("2", "AI 可创建改色变体", "缺少红色组件时，基于现有 SVG 确定性改色并入库。"),
            ("3", "套装手动保存", "AI 出稿不自动新增模板类别；复用时再手动保存素材套装。"),
        ],
        "highlights": [
            {"box": (220, 345, 240, 145), "label": "1"},
            {"box": (320, 515, 135, 90), "label": "2", "color": BLUE},
            {"box": (220, 620, 245, 85), "label": "3", "color": GREEN},
        ],
    },
    {
        "raw": "04-layer-inspector-title.png",
        "out": "04-图层级模板微调.png",
        "badge": "04",
        "title": "图层级模板微调",
        "subtitle": "保留专业设计底板，用户只调整图层位置、字号、颜色、显隐和顺序。",
        "notes": [
            ("1", "固定成品图类型", "主图、参数表、工程图、详情长图等类别固定，不因出稿新增分类。"),
            ("2", "点击图层即调整", "选中商品名、产品图、LOGO 等图层后即可修改。"),
            ("3", "属性实时生效", "位置、尺寸、字号、颜色、透明度改动后画布实时重绘。"),
        ],
        "highlights": [
            {"box": (18, 280, 177, 265), "label": "1", "color": GREEN},
            {"box": (1010, 360, 330, 180), "label": "2"},
            {"box": (1010, 640, 330, 105), "label": "3", "color": BLUE},
        ],
    },
    {
        "raw": "05-table-inspector.png",
        "out": "05-参数表样式可控.png",
        "badge": "05",
        "title": "参数表样式可控",
        "subtitle": "材料及性能参数不再被蓝色锁死，表格数据和颜色都能独立配置。",
        "notes": [
            ("1", "参数表是固定成品图", "切换后仍是固定类别，只更新当前成品图图层样式。"),
            ("2", "参数行可编辑", "不同 SKU 的规格字段可以逐项修改，批量套版时自动承载。"),
            ("3", "表格配色可统一", "表头、斑马纹、边框、文字色可单独调，也可由 AI 主题统一控制。"),
        ],
        "highlights": [
            {"box": (18, 280, 177, 265), "label": "1", "color": GREEN},
            {"box": (1010, 510, 330, 130), "label": "2"},
            {"box": (1010, 640, 330, 170), "label": "3", "color": BLUE},
        ],
    },
]


if __name__ == "__main__":
    outputs = [
        make_slide(slide["raw"], slide["out"], slide["badge"], slide["title"], slide["subtitle"], slide["notes"], slide["highlights"])
        for slide in SLIDES
    ]
    for output in outputs:
        print(output)
