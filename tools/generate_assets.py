#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
校练（Xiaolian）微信小程序 · 视觉素材生成脚本
====================================================================

一次运行即可重建 mini-program/assets/ 下的全部 PNG 视觉素材，并输出审阅用预览图
与素材清单。脚本幂等：可重复运行，直接覆盖同名文件。

【运行命令】（Windows / 本仓库约定解释器，已安装 Pillow 12.x）
    C:/Users/LENOVO/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe D:/dsh--workplace/Xiaolian/tools/generate_assets.py

【生成内容】
    1. mini-program/assets/icons/tab-*.png            8 张 81x81 透明底 tabBar 图标
       （plan / checkin / feedback / diet，各含常态 #8A94A6 与选中态 #FF6B2C，
         同一图标两种状态仅颜色不同，4px 圆角线性风格）
    2. mini-program/assets/demo/<action>/frame-1..4.png  6 动作 x 4 帧 = 24 张 480x480
       （squat / plank / glute_bridge / high_knees / jumping_jack / wall_sit，
         深色描边 + 橙色运动服色块 + 深色头部 + 蓝色动作弧线箭头 + 浅灰椭圆地面阴影，
         四帧姿态递进，供前端 image 逐帧切换）
    3. mini-program/assets/demo/placeholder.png      480x480 图文要点占位图
    4. mini-program/assets/images/share-cover.png    500x400 品牌分享封面
    5. tools/_assets_preview.png                     全部图标 + 关键帧 + 占位图 + 封面的审阅拼图
    6. tools/assets_manifest.json                    生成文件清单 / 尺寸 / 用途（供前端核对引用）

【设计令牌】
    主色 #FF6B2C / 深色 #172033 / 灰 #8A94A6 / 绿 #12B76A / 蓝 #2F5BEA / 底 #F4F6FA

【自检】
    - 每个 PNG 生成后用 Pillow 重新打开，校验格式 PNG、尺寸、RGBA 透明通道；
    - 校验 tabBar 图标同组常态/选中态 alpha 通道完全一致（仅颜色不同）；
    - 校验透明素材内容未被画布裁切；
    - 校验全部生成 PNG 总计 <= 2MB。

输出目录均相对本脚本位置自动定位（Xiaolian/tools/ -> Xiaolian/）。
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------------------------------------------------------------------------
# 路径
# ---------------------------------------------------------------------------
SCRIPT = Path(__file__).resolve()
ROOT = SCRIPT.parents[1]                      # Xiaolian/
TOOLS_DIR = SCRIPT.parent                     # Xiaolian/tools/
ASSETS_DIR = ROOT / "mini-program" / "assets"
ICON_DIR = ASSETS_DIR / "icons"
DEMO_DIR = ASSETS_DIR / "demo"
IMAGE_DIR = ASSETS_DIR / "images"

PREVIEW_PATH = TOOLS_DIR / "_assets_preview.png"
MANIFEST_PATH = TOOLS_DIR / "assets_manifest.json"

RUN_COMMAND = (
    "C:/Users/LENOVO/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe "
    "D:/dsh--workplace/Xiaolian/tools/generate_assets.py"
)

# ---------------------------------------------------------------------------
# 设计令牌 / 尺寸
# ---------------------------------------------------------------------------
ICON_SIZE = 81
DEMO_SIZE = 480
COVER_SIZE = (500, 400)
PLACEHOLDER_SIZE = (480, 480)

SS_ICON = 4      # 图标超采样倍数
SS_FIG = 3       # 关键帧超采样倍数
SS_FLAT = 2      # 占位图 / 分享封面 / 预览拼图超采样倍数

HEAD_R = 27
HEAD_NECK = 38
TORSO = 102
THIGH = 74
SHIN = 68
UPPER_ARM = 62
FORE_ARM = 58

LIMB_OUTER = 16
LIMB_INNER = 10
TORSO_OUTER = 40
TORSO_INNER = 32
SHOE_WIDTH = 19
ARROW_WIDTH = 7
ARROW_HEAD_LEN = 22
ARROW_HEAD_HALF = 12


def hex_rgba(value: str, alpha: int = 255) -> tuple:
    value = value.lstrip("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        alpha,
    )


INK = hex_rgba("172033")             # 深色（描边 / 头部 / 鞋）
ORANGE = hex_rgba("FF6B2C")          # 主色（运动服）
ORANGE_DEEP = hex_rgba("D8561E")     # 远侧肢体（同色系加深，做层次）
GRAY = hex_rgba("8A94A6")
BLUE = hex_rgba("2F5BEA")
GREEN = hex_rgba("12B76A")
BG = hex_rgba("F4F6FA")
WHITE = (255, 255, 255, 255)
PANEL = (255, 255, 255, 255)
WALL = hex_rgba("D9DFE8")
SHADOW = (138, 148, 166, 72)
ARROW = hex_rgba("3F69E6")
COVER_BG = INK
COVER_MUTED = hex_rgba("AEB8C9")
COVER_FOOT = hex_rgba("8A94A6")
BULLET_LINE = hex_rgba("DCE3EE")
SILHOUETTE = hex_rgba("C4CEDA")
PANEL_BORDER = hex_rgba("E6EBF3")

# ---------------------------------------------------------------------------
# 字体（封面 / 预览需要中文；找不到中文字体时退化为纯英文，不画方框）
# ---------------------------------------------------------------------------
_FONT_BOLD_CANDIDATES = [
    Path("C:/Windows/Fonts/msyhbd.ttc"),
    Path("C:/Windows/Fonts/msyh.ttc"),
    Path("C:/Windows/Fonts/simhei.ttf"),
    Path("C:/Windows/Fonts/Deng.ttf"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
]
_FONT_REG_CANDIDATES = [
    Path("C:/Windows/Fonts/msyh.ttc"),
    Path("C:/Windows/Fonts/msyhbd.ttc"),
    Path("C:/Windows/Fonts/simhei.ttf"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
]

_FONT_CACHE: dict = {}


def get_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    key = (int(size), bool(bold))
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    candidates = _FONT_BOLD_CANDIDATES if bold else _FONT_REG_CANDIDATES
    font = None
    for path in candidates:
        if path.exists():
            try:
                font = ImageFont.truetype(str(path), int(size))
                break
            except OSError:
                continue
    if font is None:
        try:
            font = ImageFont.load_default(size=int(size))
        except TypeError:  # 老版本 Pillow
            font = ImageFont.load_default()
    _FONT_CACHE[key] = font
    return font


def font_has_cjk() -> bool:
    try:
        mask = get_font(28, True).getmask("校")
        return mask.getbbox() is not None
    except Exception:
        return False


CJK_OK = font_has_cjk()


def label(zh: str, en: str) -> str:
    return zh if CJK_OK else en


# ---------------------------------------------------------------------------
# 通用绘制工具
# ---------------------------------------------------------------------------
def line_round(draw: ImageDraw.ImageDraw, pts, fill, width: float) -> None:
    """圆角端点的折线；width 为设备像素（调用方负责缩放）。"""
    pts = [(float(x), float(y)) for x, y in pts]
    if len(pts) < 2:
        return
    w = max(1, int(round(width)))
    draw.line(pts, fill=fill, width=w, joint="curve")
    r = w / 2.0
    for p in (pts[0], pts[-1]):
        draw.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)


def resize_rgba(img: Image.Image, size: tuple) -> Image.Image:
    """按预乘 alpha 方式缩放，避免半透明边缘发黑（RGBa 模式）。"""
    return img.convert("RGBa").resize(tuple(size), Image.LANCZOS).convert("RGBA")


def quad_bezier(p0, c, p1, steps: int = 40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1.0 - t
        x = mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0]
        y = mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1]
        pts.append((x, y))
    return pts


def _unit(v):
    n = math.hypot(v[0], v[1])
    if n < 1e-9:
        return (1.0, 0.0)
    return (v[0] / n, v[1] / n)


def draw_curved_arrow(draw, T, spec, w) -> None:
    """动作弧线箭头：p0 -> 控制点 c -> p1，末端实心箭头。"""
    p0 = T(spec["p0"])
    c = T(spec["c"])
    p1 = T(spec["p1"])
    pts = quad_bezier(p0, c, p1, 44)
    line_round(draw, pts, ARROW, w(ARROW_WIDTH))
    # 箭头方向（用曲线末端切线）
    tangent = _unit((pts[-1][0] - pts[-5][0], pts[-1][1] - pts[-5][1]))
    head_len = w(ARROW_HEAD_LEN)
    half = w(ARROW_HEAD_HALF)
    base = (p1[0] - tangent[0] * head_len, p1[1] - tangent[1] * head_len)
    perp = (-tangent[1], tangent[0])
    left = (base[0] + perp[0] * half, base[1] + perp[1] * half)
    right = (base[0] - perp[0] * half, base[1] - perp[1] * half)
    draw.polygon([p1, left, right], fill=ARROW)
    # 起点小圆点，增强"滑动"感
    r = w(4.2)
    draw.ellipse([p0[0] - r, p0[1] - r, p0[0] + r, p0[1] + r], fill=ARROW)


def ik2(base, end, l1, l2, bend_dir, label_="IK"):
    """二连杆 IK：返回关节（膝/肘）坐标，关节向 bend_dir 方向弯曲。"""
    bx, by = base
    dx, dy = end[0] - bx, end[1] - by
    d = math.hypot(dx, dy)
    maxd = l1 + l2 - 0.4
    mind = abs(l1 - l2) + 0.4
    if d < 1e-6:
        ux, uy = 1.0, 0.0
        d = mind
    else:
        ux, uy = dx / d, dy / d
    if d > maxd + 0.01 or d < mind - 0.01:
        raise ValueError(
            "IK 不可达 %s: base=(%.1f,%.1f) end=(%.1f,%.1f) d=%.2f 允许[%.2f, %.2f]"
            % (label_, bx, by, end[0], end[1], d, mind, maxd)
        )
    a = (l1 * l1 - l2 * l2 + d * d) / (2.0 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    cx, cy = bx + ux * a, by + uy * a
    px, py = -uy, ux
    sign = 1.0 if (px * bend_dir[0] + py * bend_dir[1]) >= 0 else -1.0
    return (cx + sign * px * h, cy + sign * py * h)


def body_points(pelvis, torso_deg: float, head_deg: float | None = None):
    """由骨盆位置 + 躯干/头部相对竖直方向的倾角，推出颈点与头部中心。"""
    if head_deg is None:
        head_deg = torso_deg
    t = math.radians(torso_deg)
    h = math.radians(head_deg)
    neck = (pelvis[0] + math.sin(t) * TORSO, pelvis[1] - math.cos(t) * TORSO)
    head = (neck[0] + math.sin(h) * HEAD_NECK, neck[1] - math.cos(h) * HEAD_NECK)
    return neck, head


# ===========================================================================
# 1) tabBar 图标（81x81，透明底，4px 圆角线性风格）
# ===========================================================================
def _icon_canvas() -> tuple:
    size = ICON_SIZE * SS_ICON
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def _icon_helpers(draw, color):
    s = SS_ICON

    def P(x, y):
        return (x * s, y * s)

    def stroke(pts, width=4.0):
        line_round(draw, [P(x, y) for x, y in pts], color, width * s)

    def rect(box, radius, width=4.0):
        draw.rounded_rectangle(
            [P(box[0], box[1]), P(box[2], box[3])],
            radius=radius * s,
            outline=color,
            width=max(1, int(round(width * s))),
        )

    def dot(cx, cy, r):
        draw.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], fill=color)

    return stroke, rect, dot


def draw_icon_plan(color):
    """计划：日历 + 顶部挂钩 + 2x2 日期点。"""
    img, draw = _icon_canvas()
    stroke, rect, dot = _icon_helpers(draw, color)
    rect((21, 25, 60, 63), 6, 4)
    stroke([(23, 36), (58, 36)], 4)
    stroke([(30, 18), (30, 28)], 4)
    stroke([(51, 18), (51, 28)], 4)
    for cx in (34, 47):
        for cy in (46, 55):
            dot(cx, cy, 2.4)
    return img


def draw_icon_checkin(color):
    """打卡：圆环 + 对勾。"""
    img, draw = _icon_canvas()
    stroke, rect, dot = _icon_helpers(draw, color)
    s = SS_ICON
    draw.ellipse(
        [19.5 * s, 19.5 * s, 61.5 * s, 61.5 * s],
        outline=color,
        width=max(1, int(round(4 * s))),
    )
    stroke([(30.5, 41), (37.5, 48), (52, 32)], 4.5)
    return img


def draw_icon_feedback(color):
    """反馈：圆角对话气泡 + 三点。"""
    img, draw = _icon_canvas()
    stroke, rect, dot = _icon_helpers(draw, color)
    rect((18, 20, 63, 52), 12, 4)
    stroke([(30, 52), (30, 63), (42, 52)], 4)
    for cx in (31, 40.5, 50):
        dot(cx, 36, 2.6)
    return img


def draw_icon_diet(color):
    """饮食：苹果（果身 + 果柄 + 叶片）。"""
    img, draw = _icon_canvas()
    stroke, rect, dot = _icon_helpers(draw, color)
    s = SS_ICON
    draw.ellipse(
        [22 * s, 30 * s, 59 * s, 67 * s],
        outline=color,
        width=max(1, int(round(4 * s))),
    )
    stroke([(40.5, 30), (43, 21)], 4)
    # 叶片：两段二次贝塞尔闭环描边
    a = (42.5, 25.0)
    b = (56.0, 16.0)
    leaf1 = quad_bezier(a, (46.0, 13.0), b, steps=18)
    leaf2 = quad_bezier(b, (56.0, 29.0), a, steps=18)
    stroke(leaf1 + leaf2[1:], 3.6)
    return img


ICON_SPECS = [
    ("plan", label("计划", "Plan"), draw_icon_plan),
    ("checkin", label("打卡", "Check-in"), draw_icon_checkin),
    ("feedback", label("反馈", "Feedback"), draw_icon_feedback),
    ("diet", label("饮食", "Diet"), draw_icon_diet),
]


def build_icons() -> list:
    records = []
    for kind, cn, drawer in ICON_SPECS:
        for state, color in (("normal", GRAY), ("active", ORANGE)):
            hi = drawer(color)
            img = resize_rgba(hi, (ICON_SIZE, ICON_SIZE))
            suffix = "" if state == "normal" else "-active"
            filename = "tab-%s%s.png" % (kind, suffix)
            path = ICON_DIR / filename
            size = save_png(img, path)
            records.append(
                {
                    "path": "mini-program/assets/icons/" + filename,
                    "appPath": "assets/icons/" + filename,
                    "width": ICON_SIZE,
                    "height": ICON_SIZE,
                    "bytes": size,
                    "type": "tabbar-icon",
                    "usage": "tabBar「%s」%s（%s）"
                    % (cn, "常态图标" if state == "normal" else "选中态图标",
                       "#8A94A6" if state == "normal" else "#FF6B2C"),
                }
            )
    return records


# ===========================================================================
# 2) 动作关键帧（480x480，透明底火柴人）
# ===========================================================================
def pose(view, pelvis, torso_deg, head_deg, ankles, wrists, toes,
         knee=None, elbow=None, arrows=(), shift=(0, 0), wall_x=None):
    neck, head = body_points(pelvis, torso_deg, head_deg)
    if knee is None:
        knee = {"L": (1, 0), "R": (1, 0)} if view == "side" else {"L": (-1, 0), "R": (1, 0)}
    if elbow is None:
        elbow = {"L": (-1, 0), "R": (-1, 0)} if view == "side" else {"L": (-1, 0), "R": (1, 0)}
    return {
        "view": view,
        "pelvis": pelvis,
        "neck": neck,
        "head": head,
        "ankles": ankles,
        "wrists": wrists,
        "toes": toes,
        "knee_bend": knee,
        "elbow_bend": elbow,
        "arrows": list(arrows),
        "shift": shift,
        "wall_x": wall_x,
    }


def arrow(p0, c, p1):
    return {"p0": p0, "c": c, "p1": p1}


def _hips_shoulders(view, pelvis, neck):
    if view == "side":
        hips = {"L": (pelvis[0] + 6, pelvis[1]), "R": (pelvis[0] - 10, pelvis[1])}
        shoulders = {"L": (neck[0] + 10, neck[1] + 11), "R": (neck[0] - 8, neck[1] + 11)}
    else:
        hips = {"L": (pelvis[0] - 16, pelvis[1]), "R": (pelvis[0] + 16, pelvis[1])}
        shoulders = {"L": (neck[0] - 27, neck[1] + 10), "R": (neck[0] + 27, neck[1] + 10)}
    return hips, shoulders


def validate_pose(name: str, p: dict) -> None:
    hips, shoulders = _hips_shoulders(p["view"], p["pelvis"], p["neck"])
    for side in ("L", "R"):
        ik2(hips[side], p["ankles"][side], THIGH, SHIN, p["knee_bend"][side],
            label_="%s 膝%s" % (name, side))
        ik2(shoulders[side], p["wrists"][side], UPPER_ARM, FORE_ARM,
            p["elbow_bend"][side], label_="%s 肘%s" % (name, side))


# ---------------------------- 深蹲 / squat ----------------------------
SQUAT_POSES = [
    # 1 站姿
    pose("side", (240, 286), 5, 5,
         ankles={"L": (250, 424), "R": (238, 424)},
         wrists={"L": (256, 294), "R": (238, 292)},
         toes={"L": (278, 430), "R": (266, 430)},
         arrows=[arrow((172, 286), (146, 316), (166, 352))]),
    # 2 半蹲（下蹲）
    pose("side", (222, 316), 20, 20,
         ankles={"L": (250, 424), "R": (238, 424)},
         wrists={"L": (330, 256), "R": (312, 250)},
         toes={"L": (278, 430), "R": (266, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (0, 1), "R": (0, 1)},
         arrows=[arrow((168, 300), (140, 340), (163, 380))]),
    # 3 蹲到底
    pose("side", (206, 344), 30, 30,
         ankles={"L": (250, 424), "R": (238, 424)},
         wrists={"L": (344, 272), "R": (328, 266)},
         toes={"L": (278, 430), "R": (266, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (0, 1), "R": (0, 1)},
         arrows=[arrow((172, 322), (146, 360), (168, 398))]),
    # 4 站起（回到半程，箭头向上）
    pose("side", (226, 300), 15, 15,
         ankles={"L": (250, 424), "R": (238, 424)},
         wrists={"L": (322, 248), "R": (308, 244)},
         toes={"L": (278, 430), "R": (266, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (0, 1), "R": (0, 1)},
         arrows=[arrow((168, 392), (150, 350), (170, 306))]),
]

# ---------------------------- 平板支撑 / plank ----------------------------
PLANK_SHIFT = (15, 0)
PLANK_POSES = [
    # 1 跪姿撑地（起始）
    pose("side", (215, 360), 56.7, 56.7,
         ankles={"L": (120, 420), "R": (104, 420)},
         wrists={"L": (312, 424), "R": (296, 424)},
         toes={"L": (98, 428), "R": (82, 428)},
         knee={"L": (0, 1), "R": (0, 1)},
         elbow={"L": (1, 0), "R": (1, 0)},
         arrows=[arrow((150, 330), (165, 285), (195, 245))],
         shift=PLANK_SHIFT),
    # 2 一腿后伸、一膝着地（过渡）
    pose("side", (212, 352), 59.4, 59.4,
         ankles={"L": (80, 380), "R": (110, 418)},
         wrists={"L": (312, 424), "R": (296, 424)},
         toes={"L": (60, 390), "R": (88, 426)},
         knee={"L": (0, 1), "R": (0, 1)},
         elbow={"L": (1, 0), "R": (1, 0)},
         arrows=[arrow((170, 290), (120, 300), (80, 315))],
         shift=PLANK_SHIFT),
    # 3 双腿后伸、髋部偏高
    pose("side", (205, 330), 70.3, 70.3,
         ankles={"L": (107, 424), "R": (91, 424)},
         wrists={"L": (314, 424), "R": (298, 424)},
         toes={"L": (85, 430), "R": (69, 430)},
         knee={"L": (0, 1), "R": (0, 1)},
         elbow={"L": (1, 0), "R": (1, 0)},
         arrows=[arrow((165, 240), (185, 275), (215, 300))],
         shift=PLANK_SHIFT),
    # 4 标准平板（身体一条线，保持）
    pose("side", (211, 354), 60.7, 60.7,
         ankles={"L": (95, 424), "R": (79, 424)},
         wrists={"L": (312, 424), "R": (296, 424)},
         toes={"L": (73, 430), "R": (57, 430)},
         knee={"L": (0, 1), "R": (0, 1)},
         elbow={"L": (1, 0), "R": (1, 0)},
         arrows=[arrow((140, 250), (200, 244), (280, 252))],
         shift=PLANK_SHIFT),
]

# ---------------------------- 臀桥 / glute_bridge ----------------------------
GB_SHIFT = (-12, 0)
GB_ARMS = {"L": (0, 1), "R": (0, 1)}
GLUTE_BRIDGE_POSES = [
    # 1 仰卧屈膝准备
    pose("side", (204, 404), 90, 82.4,
         ankles={"L": (158, 424), "R": (142, 424)},
         wrists={"L": (212, 426), "R": (196, 428)},
         toes={"L": (132, 428), "R": (116, 428)},
         knee={"L": (0, -1), "R": (0, -1)},
         elbow=GB_ARMS,
         arrows=[arrow((160, 350), (145, 315), (165, 280))],
         shift=GB_SHIFT),
    # 2 髋部抬离地面
    pose("side", (209, 367), 107.7, 84,
         ankles={"L": (158, 424), "R": (142, 424)},
         wrists={"L": (206, 426), "R": (190, 428)},
         toes={"L": (132, 428), "R": (116, 428)},
         knee={"L": (0, -1), "R": (0, -1)},
         elbow=GB_ARMS,
         arrows=[arrow((150, 340), (135, 305), (155, 270))],
         shift=GB_SHIFT),
    # 3 髋部继续抬高
    pose("side", (218, 347), 119.1, 82.9,
         ankles={"L": (158, 424), "R": (142, 424)},
         wrists={"L": (203, 426), "R": (187, 428)},
         toes={"L": (132, 428), "R": (116, 428)},
         knee={"L": (0, -1), "R": (0, -1)},
         elbow=GB_ARMS,
         arrows=[arrow((145, 320), (130, 285), (150, 250))],
         shift=GB_SHIFT),
    # 4 顶峰（肩-髋-膝成一线）
    pose("side", (228, 332), 128.5, 81.2,
         ankles={"L": (158, 424), "R": (142, 424)},
         wrists={"L": (202, 426), "R": (186, 428)},
         toes={"L": (132, 428), "R": (116, 428)},
         knee={"L": (0, -1), "R": (0, -1)},
         elbow=GB_ARMS,
         arrows=[arrow((210, 290), (200, 255), (225, 220))],
         shift=GB_SHIFT),
]

# ---------------------------- 高抬腿 / high_knees ----------------------------
HIGH_KNEES_POSES = [
    # 1 近侧膝高抬、远侧支撑
    pose("side", (240, 286), 8, 8,
         ankles={"L": (306, 318), "R": (246, 424)},
         wrists={"L": (222, 282), "R": (296, 246)},
         toes={"L": (328, 326), "R": (272, 430)},
         knee={"L": (0, -1), "R": (1, 0)},
         elbow={"L": (-1, 0), "R": (1, 0)},
         arrows=[arrow((340, 340), (355, 305), (340, 270))]),
    # 2 过渡：近腿落下、远腿抬起
    pose("side", (240, 288), 8, 8,
         ankles={"L": (272, 424), "R": (238, 380)},
         wrists={"L": (296, 252), "R": (214, 278)},
         toes={"L": (296, 428), "R": (260, 386)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (1, 0), "R": (-1, 0)},
         arrows=[arrow((330, 360), (345, 330), (330, 295))]),
    # 3 远侧膝高抬、近侧支撑
    pose("side", (240, 286), 8, 8,
         ankles={"L": (252, 424), "R": (288, 318)},
         wrists={"L": (300, 246), "R": (210, 280)},
         toes={"L": (276, 430), "R": (310, 326)},
         knee={"L": (1, 0), "R": (0, -1)},
         elbow={"L": (1, 0), "R": (-1, 0)},
         arrows=[arrow((330, 340), (348, 305), (335, 268))]),
    # 4 过渡：远腿落下、近腿抬起（回落）
    pose("side", (240, 288), 8, 8,
         ankles={"L": (270, 370), "R": (242, 424)},
         wrists={"L": (298, 252), "R": (218, 276)},
         toes={"L": (276, 388), "R": (266, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (1, 0), "R": (-1, 0)},
         arrows=[arrow((335, 290), (350, 320), (335, 350))]),
]

# ---------------------------- 开合跳 / jumping_jack ----------------------------
JUMPING_JACK_POSES = [
    # 1 站直、双臂下垂、双脚并拢
    pose("front", (240, 286), 0, 0,
         ankles={"L": (226, 424), "R": (254, 424)},
         wrists={"L": (198, 300), "R": (282, 300)},
         toes={"L": (218, 432), "R": (262, 432)},
         knee={"L": (-1, 0), "R": (1, 0)},
         elbow={"L": (-1, 0), "R": (1, 0)},
         arrows=[arrow((150, 330), (140, 290), (155, 250))]),
    # 2 双臂斜上举、双脚打开
    pose("front", (240, 288), 0, 0,
         ankles={"L": (206, 424), "R": (274, 424)},
         wrists={"L": (136, 110), "R": (344, 110)},
         toes={"L": (196, 432), "R": (284, 432)},
         knee={"L": (-1, 0), "R": (1, 0)},
         elbow={"L": (-1, 0), "R": (1, 0)},
         arrows=[arrow((150, 250), (120, 210), (100, 175))]),
    # 3 双臂头顶 V 字、双脚大开（顶点）
    pose("front", (240, 292), 0, 0,
         ankles={"L": (186, 424), "R": (294, 424)},
         wrists={"L": (165, 92), "R": (315, 92)},
         toes={"L": (174, 430), "R": (306, 430)},
         knee={"L": (-1, 0), "R": (1, 0)},
         elbow={"L": (-1, 0), "R": (1, 0)},
         arrows=[arrow((355, 260), (375, 215), (355, 165))]),
    # 4 双臂斜下放、双脚回收（回落）
    pose("front", (240, 288), 0, 0,
         ankles={"L": (214, 424), "R": (266, 424)},
         wrists={"L": (132, 278), "R": (348, 278)},
         toes={"L": (204, 432), "R": (276, 432)},
         knee={"L": (-1, 0), "R": (1, 0)},
         elbow={"L": (-1, 0), "R": (1, 0)},
         arrows=[arrow((155, 245), (145, 285), (160, 325))]),
]

# ---------------------------- 靠墙静蹲 / wall_sit ----------------------------
WALL_X = 166
WALL_SIT_POSES = [
    # 1 靠墙站立
    pose("side", (190, 286), 0, 0,
         ankles={"L": (226, 424), "R": (210, 424)},
         wrists={"L": (206, 296), "R": (188, 294)},
         toes={"L": (252, 430), "R": (236, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (-1, 0), "R": (-1, 0)},
         arrows=[arrow((320, 250), (338, 295), (320, 340))],
         wall_x=WALL_X),
    # 2 贴墙下滑（半程）
    pose("side", (190, 330), 0, 0,
         ankles={"L": (252, 424), "R": (240, 424)},
         wrists={"L": (262, 258), "R": (246, 254)},
         toes={"L": (278, 430), "R": (266, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (0, 1), "R": (0, 1)},
         arrows=[arrow((322, 262), (340, 315), (322, 368))],
         wall_x=WALL_X),
    # 3 大腿平行地面（静蹲位置）
    pose("side", (190, 352), 0, 0,
         ankles={"L": (284, 424), "R": (272, 424)},
         wrists={"L": (280, 266), "R": (264, 262)},
         toes={"L": (310, 430), "R": (298, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (0, 1), "R": (0, 1)},
         arrows=[arrow((330, 275), (348, 320), (330, 370))],
         wall_x=WALL_X),
    # 4 起身至半程
    pose("side", (190, 336), 0, 0,
         ankles={"L": (262, 424), "R": (250, 424)},
         wrists={"L": (268, 272), "R": (252, 268)},
         toes={"L": (288, 430), "R": (276, 430)},
         knee={"L": (1, 0), "R": (1, 0)},
         elbow={"L": (0, 1), "R": (0, 1)},
         arrows=[arrow((320, 380), (340, 335), (322, 288))],
         wall_x=WALL_X),
]

DEMO_ACTIONS = [
    ("squat", "深蹲", "Squat", SQUAT_POSES),
    ("plank", "平板支撑", "Plank", PLANK_POSES),
    ("glute_bridge", "臀桥", "Glute Bridge", GLUTE_BRIDGE_POSES),
    ("high_knees", "高抬腿", "High Knees", HIGH_KNEES_POSES),
    ("jumping_jack", "开合跳", "Jumping Jack", JUMPING_JACK_POSES),
    ("wall_sit", "靠墙静蹲", "Wall Sit", WALL_SIT_POSES),
]


def render_frame(p: dict) -> Image.Image:
    S = SS_FIG
    L = DEMO_SIZE * S
    img = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    sx, sy = p.get("shift", (0, 0))

    def T(pt):
        return ((pt[0] + sx) * S, (pt[1] + sy) * S)

    def w(value):
        return max(1, int(round(value * S)))

    # --- 地面投影（先在独立图层画椭圆再高斯模糊，得到柔和浅灰阴影） ---
    contact = []
    for side in ("L", "R"):
        for pt in (p["ankles"][side], p["toes"][side], p["wrists"][side]):
            if pt[1] >= 398:
                contact.append(pt)
    if p["head"][1] >= 380:
        contact.append(p["head"])
    xs = [pt[0] for pt in contact] or [p["pelvis"][0]]
    cx = (min(xs) + max(xs)) / 2.0
    hw = min((max(xs) - min(xs)) / 2.0 + 34.0, 158.0)
    shadow = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse(
        [(cx - hw + sx) * S, (426 + sy) * S, (cx + hw + sx) * S, (446 + sy) * S],
        fill=SHADOW,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=7 * S))
    img = Image.alpha_composite(img, shadow)
    d = ImageDraw.Draw(img)

    # --- 靠墙静蹲的墙 ---
    if p.get("wall_x") is not None:
        wx = p["wall_x"] + sx
        line_round(d, [T((wx, 108)), T((wx, 424))], WALL, w(9))

    view = p["view"]
    hips, shoulders = _hips_shoulders(view, p["pelvis"], p["neck"])
    knees = {
        side: ik2(hips[side], p["ankles"][side], THIGH, SHIN,
                  p["knee_bend"][side], label_="膝" + side)
        for side in ("L", "R")
    }
    elbows = {
        side: ik2(shoulders[side], p["wrists"][side], UPPER_ARM, FORE_ARM,
                  p["elbow_bend"][side], label_="肘" + side)
        for side in ("L", "R")
    }

    def draw_leg(side, inner_color):
        chain = [hips[side], knees[side], p["ankles"][side]]
        line_round(d, [T(pt) for pt in chain], INK, w(LIMB_OUTER))
        line_round(d, [T(pt) for pt in chain], inner_color, w(LIMB_INNER))
        # 深色运动鞋
        line_round(d, [T(p["ankles"][side]), T(p["toes"][side])], INK, w(SHOE_WIDTH))

    def draw_arm(side, inner_color):
        chain = [shoulders[side], elbows[side], p["wrists"][side]]
        line_round(d, [T(pt) for pt in chain], INK, w(LIMB_OUTER))
        line_round(d, [T(pt) for pt in chain], inner_color, w(LIMB_INNER))

    def draw_torso():
        line_round(d, [T(p["neck"]), T(p["pelvis"])], INK, w(TORSO_OUTER))
        line_round(d, [T(p["neck"]), T(p["pelvis"])], ORANGE, w(TORSO_INNER))

    def draw_head():
        hx, hy = T(p["head"])
        r = HEAD_R * S
        d.ellipse([hx - r, hy - r, hx + r, hy + r], fill=INK)
        # 橙色运动头带（保持在头部圆内）
        band_top = hy - r * 0.58
        band_h = r * 0.30
        half_x = r * 0.80
        d.rounded_rectangle(
            [hx - half_x, band_top, hx + half_x, band_top + band_h],
            radius=band_h * 0.5,
            fill=ORANGE,
        )

    if view == "side":
        draw_leg("R", ORANGE_DEEP)      # 远侧腿
        draw_arm("R", ORANGE_DEEP)      # 远侧手臂
        draw_torso()
        draw_leg("L", ORANGE)           # 近侧腿
        draw_arm("L", ORANGE)           # 近侧手臂
        draw_head()
    else:
        draw_leg("L", ORANGE)
        draw_leg("R", ORANGE)
        draw_torso()
        draw_arm("L", ORANGE)
        draw_arm("R", ORANGE)
        draw_head()

    for spec in p["arrows"]:
        draw_curved_arrow(d, T, spec, w)

    return resize_rgba(img, (DEMO_SIZE, DEMO_SIZE))


def build_demo_frames() -> list:
    records = []
    for action_id, cn, en, poses in DEMO_ACTIONS:
        validate_pose(action_id, poses[0])  # 统一在渲染前校验一次
        for i, p in enumerate(poses):
            validate_pose("%s#%d" % (action_id, i + 1), p)
        out_dir = DEMO_DIR / action_id
        for i, p in enumerate(poses):
            img = render_frame(p)
            filename = "frame-%d.png" % (i + 1)
            path = out_dir / filename
            size = save_png(img, path)
            records.append(
                {
                    "path": "mini-program/assets/demo/%s/%s" % (action_id, filename),
                    "appPath": "assets/demo/%s/%s" % (action_id, filename),
                    "width": DEMO_SIZE,
                    "height": DEMO_SIZE,
                    "bytes": size,
                    "type": "demo-frame",
                    "usage": "%s（%s）第 %d 帧关键帧" % (cn, en, i + 1),
                }
            )
    return records


# ===========================================================================
# 3) 占位图（480x480：人物剪影 + 三点提示）
# ===========================================================================
def build_placeholder() -> list:
    S = SS_FLAT
    size = PLACEHOLDER_SIZE[0] * S
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def P(x, y):
        return (x * S, y * S)

    # 浅灰圆角底面板
    d.rounded_rectangle(
        [P(40, 40), P(440, 440)],
        radius=56 * S,
        fill=(244, 246, 250, 255),
        outline=(228, 234, 243, 255),
        width=max(1, int(round(2 * S))),
    )
    # 人物剪影：头 + 颈 + 肩胸
    d.ellipse([P(204, 120), P(276, 192)], fill=SILHOUETTE)
    d.rounded_rectangle([P(222, 178), P(258, 240)], radius=17 * S, fill=SILHOUETTE)
    d.rounded_rectangle([P(158, 224), P(322, 336)], radius=64 * S, fill=SILHOUETTE)
    # 三点提示：彩色圆点 + 浅灰短横线
    bullet_colors = [ORANGE, GREEN, BLUE]
    bullet_widths = [190, 158, 210]
    for i, (color, line_w) in enumerate(zip(bullet_colors, bullet_widths)):
        cy = 372 + i * 24
        d.ellipse([P(148 - 6, cy - 6), P(148 + 6, cy + 6)], fill=color)
        d.rounded_rectangle(
            [P(170, cy - 5), P(170 + line_w, cy + 5)],
            radius=5 * S,
            fill=BULLET_LINE,
        )
    out = resize_rgba(img, PLACEHOLDER_SIZE)
    path = DEMO_DIR / "placeholder.png"
    size_bytes = save_png(out, path)
    return [
        {
            "path": "mini-program/assets/demo/placeholder.png",
            "appPath": "assets/demo/placeholder.png",
            "width": PLACEHOLDER_SIZE[0],
            "height": PLACEHOLDER_SIZE[1],
            "bytes": size_bytes,
            "type": "placeholder",
            "usage": "暂无视频时以图文要点呈现的动作占位图（人物剪影 + 三点提示）",
        }
    ]


# ===========================================================================
# 4) 分享封面（500x400 品牌封面）
# ===========================================================================
def draw_star_figure(d, S, cx, cy, scale, color, headband_color):
    """封面里的白色开合跳小人（简化版，无描边）。"""

    def P(x, y):
        return ((cx + (x - 240) * scale) * S, (cy + (y - 240) * scale) * S)

    def line(pts, width):
        line_round(d, [P(*pt) for pt in pts], color, max(1, int(round(width * scale * S))))

    head = P(240, 150)
    r = 21 * scale * S
    d.ellipse([head[0] - r, head[1] - r, head[0] + r, head[1] + r], fill=color)
    # 深色头带（呼应品牌深色）
    band_top = head[1] - r * 0.58
    band_h = r * 0.30
    half_x = r * 0.80
    d.rounded_rectangle(
        [head[0] - half_x, band_top, head[0] + half_x, band_top + band_h],
        radius=band_h * 0.5,
        fill=headband_color,
    )
    line([(240, 182), (240, 286)], 15)                     # 躯干
    line([(240, 196), (161, 96)], 12)                      # 左臂斜上
    line([(240, 196), (319, 96)], 12)                      # 右臂斜上
    line([(240, 286), (176, 404)], 12)                     # 左腿
    line([(240, 286), (304, 404)], 12)                     # 右腿


def build_share_cover() -> list:
    S = SS_FLAT
    W, H = COVER_SIZE
    img = Image.new("RGBA", (W * S, H * S), COVER_BG)
    d = ImageDraw.Draw(img)

    def P(x, y):
        return (x * S, y * S)

    def rr(box, radius, fill=None, outline=None, width=1):
        d.rounded_rectangle(
            [P(box[0], box[1]), P(box[2], box[3])],
            radius=radius * S,
            fill=fill,
            outline=outline,
            width=max(1, int(round(width * S))),
        )

    def txt(x, y, s, size, color, bold=True, anchor="la"):
        d.text(P(x, y), s, font=get_font(size * S, bold), fill=color, anchor=anchor)

    # 背景装饰：深色圆 + 品牌橙圆
    d.ellipse([P(258, -62), P(562, 242)], fill=hex_rgba("1E2942"))
    d.ellipse([P(262, 56), P(522, 316)], fill=ORANGE)
    # 顶部三个品牌色圆点
    for i, color in enumerate((ORANGE, GREEN, BLUE)):
        cx = 52 + i * 20
        d.ellipse([P(cx - 5, 58 - 5), P(cx + 5, 58 + 5)], fill=color)

    # 白色开合跳小人（位于橙色圆内）
    draw_star_figure(d, S, cx=392, cy=196, scale=0.52, color=WHITE,
                     headband_color=INK)

    # 左侧文字
    if CJK_OK:
        txt(48, 96, "校 练", 86, WHITE, True)
        rr((50, 206, 190, 214), 4, fill=ORANGE)
        txt(50, 232, "XIAOLIAN", 30, ORANGE, True)
        txt(50, 282, "科学训练 · 每日坚持", 18, COVER_MUTED, False)
        txt(50, 344, "校练 · 让每一次训练都有计划", 14, COVER_FOOT, False)
    else:
        txt(48, 96, "XIAOLIAN", 72, WHITE, True)
        rr((50, 196, 190, 204), 4, fill=ORANGE)
        txt(50, 222, "CAMPUS FITNESS", 22, ORANGE, True)
        txt(50, 262, "TRAIN SMART · STAY CONSISTENT", 16, COVER_MUTED, False)
        txt(50, 344, "Xiaolian · Plan Every Workout", 14, COVER_FOOT, False)

    out = resize_rgba(img, COVER_SIZE)
    path = IMAGE_DIR / "share-cover.png"
    size_bytes = save_png(out, path)
    return [
        {
            "path": "mini-program/assets/images/share-cover.png",
            "appPath": "assets/images/share-cover.png",
            "width": COVER_SIZE[0],
            "height": COVER_SIZE[1],
            "bytes": size_bytes,
            "type": "share-cover",
            "usage": "分享卡片品牌封面（深色 #172033 + 主色 #FF6B2C，含「校练 / XIAOLIAN」）",
        }
    ]


# ===========================================================================
# 5) 保存 / 校验 / 清单 / 预览
# ===========================================================================
def save_png(img: Image.Image, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    return path.stat().st_size


def reopen_check(entry: dict, errors: list) -> None:
    path = ROOT / entry["path"]
    if not path.exists():
        errors.append("缺失文件: " + entry["path"])
        return
    try:
        with Image.open(path) as im:
            im.load()
            fmt = im.format
            width, height = im.size
            mode = im.mode
            alpha_min, alpha_max = im.getchannel("A").getextrema() if "A" in im.getbands() else (None, None)
            bbox = im.getchannel("A").getbbox() if "A" in im.getbands() else None
    except Exception as exc:  # noqa: BLE001
        errors.append("无法打开 %s: %s" % (entry["path"], exc))
        return
    if fmt != "PNG":
        errors.append("%s 格式不是 PNG: %s" % (entry["path"], fmt))
    if (width, height) != (entry["width"], entry["height"]):
        errors.append(
            "%s 尺寸不符: 实际 %dx%d, 期望 %dx%d"
            % (entry["path"], width, height, entry["width"], entry["height"])
        )
    if mode != "RGBA":
        errors.append("%s 模式非 RGBA: %s" % (entry["path"], mode))
        return
    actual_bytes = path.stat().st_size
    if actual_bytes != entry["bytes"]:
        errors.append("%s 字节数不一致: %d vs %d" % (entry["path"], actual_bytes, entry["bytes"]))
    if entry["type"] in ("tabbar-icon", "demo-frame", "placeholder"):
        if alpha_max == 0:
            errors.append("%s 完全透明（无可见内容）" % entry["path"])
        if alpha_min == 255:
            errors.append("%s 无透明通道信息（缺少透明背景）" % entry["path"])
        if bbox is not None:
            if entry["type"] == "demo-frame":
                if bbox[0] <= 1 or bbox[1] <= 1 or bbox[2] >= width - 1 or bbox[3] >= height - 1:
                    errors.append("%s 内容疑似被画布裁切: bbox=%s" % (entry["path"], bbox))
    else:
        # 分享封面 / 预览图：不透明图，alpha 应全 255
        if alpha_min != 255 or alpha_max != 255:
            errors.append("%s 预期为不透明图，alpha=%s" % (entry["path"], (alpha_min, alpha_max)))


def check_icon_pairs(icon_entries: list, errors: list) -> None:
    """同一图标的常态/选中态必须 alpha 完全一致（仅颜色不同）。"""
    pairs = {}
    for entry in icon_entries:
        name = entry["path"].rsplit("/", 1)[-1]
        if name.endswith("-active.png"):
            pairs.setdefault(name[: -len("-active.png")], {})["active"] = entry
        else:
            pairs.setdefault(name[: -len(".png")], {})["normal"] = entry
    expected = {"tab-%s" % kind for kind, _, _ in ICON_SPECS}
    if set(pairs) != expected:
        errors.append("图标命名不完整: %s" % sorted(set(pairs) ^ expected))
        return
    for key in sorted(pairs):
        pair = pairs[key]
        if "normal" not in pair or "active" not in pair:
            errors.append("图标缺少状态: " + key)
            continue
        a = Image.open(ROOT / pair["normal"]["path"]).convert("RGBA")
        b = Image.open(ROOT / pair["active"]["path"]).convert("RGBA")
        if a.getchannel("A").tobytes() != b.getchannel("A").tobytes():
            errors.append("%s 常态/选中态形状不一致（alpha 通道不同）" % key)
        if a.getchannel("A").getbbox() is None:
            errors.append("%s 无可见内容" % key)


def build_manifest(records: list, preview_entry: dict, total_png_bytes: int) -> dict:
    def count(kind):
        return len([r for r in records if r["type"] == kind])

    tab_bar = {}
    for kind, cn, _ in ICON_SPECS:
        tab_bar[kind] = {
            "text": cn,
            "iconPath": "assets/icons/tab-%s.png" % kind,
            "selectedIconPath": "assets/icons/tab-%s-active.png" % kind,
        }
    demo = {}
    for action_id, cn, en, poses in DEMO_ACTIONS:
        demo[action_id] = {
            "name": cn,
            "nameEn": en,
            "frames": 4,
            "files": [
                "assets/demo/%s/frame-%d.png" % (action_id, i + 1) for i in range(4)
            ],
        }
    files = records + [preview_entry]
    return {
        "project": "校练 Xiaolian 微信小程序",
        "generatedBy": "Xiaolian/tools/generate_assets.py",
        "runCommand": RUN_COMMAND,
        "designTokens": {
            "primary": "#FF6B2C",
            "ink": "#172033",
            "gray": "#8A94A6",
            "green": "#12B76A",
            "blue": "#2F5BEA",
            "background": "#F4F6FA",
        },
        "summary": {
            "pngFiles": len(files),
            "tabBarIcons": count("tabbar-icon"),
            "demoActions": len(DEMO_ACTIONS),
            "demoFrames": count("demo-frame"),
            "placeholder": count("placeholder"),
            "shareCovers": count("share-cover"),
            "preview": 1,
            "totalPngBytes": total_png_bytes,
            "totalPngKB": round(total_png_bytes / 1024.0, 1),
            "limitBytes": 2 * 1024 * 1024,
            "withinLimit": total_png_bytes <= 2 * 1024 * 1024,
        },
        "tabBar": tab_bar,
        "demo": demo,
        "other": {
            "placeholder": "assets/demo/placeholder.png",
            "shareCover": "assets/images/share-cover.png",
        },
        "files": files,
    }


# ---------------------------- 预览拼图 ----------------------------
PREVIEW_W, PREVIEW_H = 1600, 1180


def build_preview(icon_entries: list, frame_entries: list,
                  placeholder_entry: dict, cover_entry: dict,
                  preview_entry_placeholder: dict) -> dict:
    S = SS_FLAT
    img = Image.new("RGBA", (PREVIEW_W * S, PREVIEW_H * S), BG)
    d = ImageDraw.Draw(img)

    def P(x, y):
        return (x * S, y * S)

    def rr(box, radius, fill=None, outline=None, width=1):
        d.rounded_rectangle(
            [P(box[0], box[1]), P(box[2], box[3])],
            radius=radius * S,
            fill=fill,
            outline=outline,
            width=max(1, int(round(width * S))),
        )

    def txt(x, y, s, size, color, bold=True, anchor="la"):
        d.text(P(x, y), s, font=get_font(size * S, bold), fill=color, anchor=anchor)

    def paste_sized(rel_path, box, max_size):
        """等比缩放后贴到 box 左上角（box 为逻辑坐标）。"""
        im = Image.open(ROOT / rel_path).convert("RGBA")
        w, h = max_size
        ratio = min(w / im.width, h / im.height)
        target = (max(1, int(round(im.width * ratio))), max(1, int(round(im.height * ratio))))
        im = resize_rgba(im, target)
        img.alpha_composite(im, (box[0] * S, box[1] * S))
        return target

    # 标题区
    txt(44, 26, label("校练 · 视觉素材预览", "XIAOLIAN · ASSET PREVIEW"), 36, INK, True)
    txt(1556, 34, "XIAOLIAN / ASSET PREVIEW", 15, GRAY, True, anchor="ra")
    txt(
        44, 78,
        label(
            "8 个 tabBar 图标  ·  6 个动作 × 4 帧关键帧  ·  占位图  ·  分享封面  ·  由 tools/generate_assets.py 生成",
            "8 tabBar icons  ·  6 exercises x 4 keyframes  ·  placeholder  ·  share cover  ·  generated by tools/generate_assets.py",
        ),
        14, GRAY, False,
    )

    # 01 tabBar 图标
    rr((40, 110, 1560, 292), 20, fill=PANEL)
    txt(68, 128, label("01  TabBar 图标  ·  81×81  ·  透明底  ·  常态 #8A94A6 / 选中 #FF6B2C",
                       "01  TabBar icons  ·  81x81  ·  transparent  ·  normal #8A94A6 / active #FF6B2C"),
        17, INK, True)
    icons = []
    for kind, cn, _ in ICON_SPECS:
        icons.append(("tab-%s.png" % kind, "assets/icons/tab-%s.png" % kind,
                      cn, label("常态", "Normal")))
        icons.append(("tab-%s-active.png" % kind, "assets/icons/tab-%s-active.png" % kind,
                      cn, label("选中", "Active")))
    cell_w = 178
    start_x = 40 + (1520 - cell_w * 8) // 2
    for i, (filename, rel, cn, state_text) in enumerate(icons):
        cxx = start_x + i * cell_w + cell_w // 2
        im = Image.open(ROOT / "mini-program" / rel).convert("RGBA")
        im = resize_rgba(im, (108 * S, 108 * S))
        img.alpha_composite(im, ((cxx - 54) * S, 158 * S))
        txt(cxx, 274, "%s · %s" % (cn, state_text), 13, INK, True, anchor="ma")
        txt(cxx, 292 - 4, filename, 10, GRAY, False, anchor="ma")

    # 02 动作关键帧
    rr((40, 310, 1560, 952), 20, fill=PANEL)
    txt(68, 328, label(
        "02  动作示范关键帧  ·  480×480  ·  6 个动作 × 4 帧  ·  深色描边 + 橙色运动服 + 动作弧线箭头 + 地面阴影",
        "02  Exercise keyframes  ·  480x480  ·  6 exercises x 4 frames  ·  dark outline + orange kit + motion arrow + floor shadow",
    ), 17, INK, True)
    frame_size = 145
    block_w = 720
    for row in range(3):
        row_y = 372 + row * 188
        for block in range(2):
            idx = row * 2 + block
            if idx >= len(DEMO_ACTIONS):
                continue
            action_id, cn, en, poses = DEMO_ACTIONS[idx]
            bx = 68 + block * 760
            txt(bx, row_y + 2, cn, 20, INK, True)
            txt(bx, row_y + 32, en, 12, GRAY, True)
            txt(bx, row_y + 52, label("4 帧", "4 frames"), 12, GRAY, False)
            for i in range(4):
                fx = bx + 120 + i * 151
                rel = "mini-program/assets/demo/%s/frame-%d.png" % (action_id, i + 1)
                im = Image.open(ROOT / rel).convert("RGBA")
                im = resize_rgba(im, (frame_size * S, frame_size * S))
                img.alpha_composite(im, (fx * S, (row_y + 4) * S))
                # 帧底板 + 描边，便于在白色面板上分辨透明边界
                img_frame_box = None  # noqa: F841  (占位说明：透明底直接贴，无需底板)
                txt(fx + frame_size // 2, row_y + 152, str(i + 1), 12, GRAY, False, anchor="ma")

    # 03 占位图与分享封面
    rr((40, 972, 1560, 1140), 20, fill=PANEL)
    txt(68, 990, label("03  占位图与分享封面", "03  Placeholder & share cover"), 17, INK, True)
    paste_sized(placeholder_entry["path"], (68, 1012), (100, 100))
    txt(182, 1024, "placeholder.png", 14, INK, True)
    txt(182, 1046, label("480×480 · 暂无视频时以图文要点占位（人物剪影 + 三点提示）",
                         "480x480 · placeholder for text/image key points (silhouette + 3 bullets)"),
        12, GRAY, False)
    paste_sized(cover_entry["path"], (720, 1012), (126, 100))
    txt(862, 1024, "share-cover.png", 14, INK, True)
    txt(862, 1046, label("500×400 · 分享卡片品牌封面（含「校练 / XIAOLIAN」）",
                         "500x400 · brand share cover (Xiaolian / XIAOLIAN)"),
        12, GRAY, False)
    total_kb = preview_entry_placeholder["totalPngKB"]
    txt(1180, 1024, label("共 %d 个 PNG 素材" % preview_entry_placeholder["pngFiles"],
                          "%d PNG files" % preview_entry_placeholder["pngFiles"]),
        13, INK, True)
    txt(1180, 1046, label("PNG 压缩优化 · 合计约 %.1f KB（上限 2048 KB）" % total_kb,
                          "PNG optimized · about %.1f KB (limit 2048 KB)" % total_kb),
        12, GRAY, False)
    txt(1180, 1068, label("脚本幂等，可重复运行覆盖", "Script is idempotent / re-runnable"),
        12, GRAY, False)

    txt(44, 1150, label(
        "生成脚本：tools/generate_assets.py  ·  本图仅用于审阅，不随小程序发布",
        "Script: tools/generate_assets.py  ·  preview only, not shipped",
    ), 12, GRAY, False)

    out = resize_rgba(img, (PREVIEW_W, PREVIEW_H))
    size_bytes = save_png(out, PREVIEW_PATH)
    return {
        "path": "tools/_assets_preview.png",
        "appPath": None,
        "width": PREVIEW_W,
        "height": PREVIEW_H,
        "bytes": size_bytes,
        "type": "preview",
        "usage": "审阅用拼图：tabBar 图标 + 全部动作关键帧 + 占位图 + 分享封面（不随小程序发布）",
    }


# ===========================================================================
# main
# ===========================================================================
def main() -> int:
    for directory in (ICON_DIR, DEMO_DIR, IMAGE_DIR):
        directory.mkdir(parents=True, exist_ok=True)

    print("[校练] 生成视觉素材 ->", ASSETS_DIR)
    icon_entries = build_icons()
    print("  · tabBar 图标: %d 个" % len(icon_entries))
    frame_entries = build_demo_frames()
    print("  · 动作关键帧: %d 个（%d 动作 × 4 帧）"
          % (len(frame_entries), len(DEMO_ACTIONS)))
    placeholder_entries = build_placeholder()
    print("  · 占位图: 1 个 -> assets/demo/placeholder.png")
    cover_entries = build_share_cover()
    print("  · 分享封面: 1 个 -> assets/images/share-cover.png")

    records = icon_entries + frame_entries + placeholder_entries + cover_entries
    errors: list = []

    # 全部素材重新打开校验（尺寸 / PNG / 透明通道 / 裁切）
    for entry in records:
        reopen_check(entry, errors)
    check_icon_pairs(icon_entries, errors)

    png_bytes = sum(entry["bytes"] for entry in records) if not errors else 0
    summary_for_preview = {
        "totalPngKB": round(png_bytes / 1024.0, 1),
        "pngFiles": len(records) + 1,  # + 预览图
    }

    preview_entry = build_preview(
        icon_entries, frame_entries,
        placeholder_entries[0], cover_entries[0], summary_for_preview,
    )
    reopen_check(preview_entry, errors)

    total_png_bytes = sum(
        (ROOT / entry["path"]).stat().st_size for entry in records + [preview_entry]
    )
    if total_png_bytes > 2 * 1024 * 1024:
        errors.append(
            "全部 PNG 总计 %.1f KB，超过 2MB 上限"
            % (total_png_bytes / 1024.0)
        )

    manifest = build_manifest(records, preview_entry, total_png_bytes)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    print()
    print("  汇总: %d 个 PNG（图标 %d + 关键帧 %d + 占位图 1 + 封面 1 + 预览 1）"
          % (len(records) + 1, len(icon_entries), len(frame_entries)))
    print("  大小: %.1f KB / 2048 KB" % (total_png_bytes / 1024.0))
    print("  预览:", PREVIEW_PATH)
    print("  清单:", MANIFEST_PATH)

    if errors:
        print("\n[校验失败]")
        for err in errors:
            print("  !", err)
        return 1
    print("\n[校验通过] PNG 格式 / 尺寸 / 透明通道 / 图标双态一致性 / 未裁切 / 总大小 全部 OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
