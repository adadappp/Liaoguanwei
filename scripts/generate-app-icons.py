"""从原有书本图形生成应用图标；桌面图标外圈与圆角区域透明。"""
from pathlib import Path
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "icons"
OUTPUT.mkdir(exist_ok=True)
SCALE = 4
SIZE = 512


def transform(point):
    # 去掉原图 66px 黑色留边，将白色圆角块铺满图标主体。
    return tuple(round((8 + (value - 66) / 380 * 496) * SCALE) for value in point)


def draw_icon(maskable=False):
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), "#f5f5f7" if maskable else (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    if not maskable:
        draw.rounded_rectangle((8 * SCALE, 8 * SCALE, 504 * SCALE, 504 * SCALE), radius=117 * SCALE, fill="#f5f5f7")
    for path in [
        [(256, 205), (233, 188), (204, 180), (170, 185), (170, 324), (201, 319), (229, 323), (256, 340)],
        [(256, 205), (279, 188), (308, 180), (342, 185), (342, 324), (311, 319), (283, 323), (256, 340)],
    ]:
        draw.line([transform(point) for point in path], fill="#111113", width=round(13 / 380 * 496 * SCALE), joint="curve")
    draw.line([transform((256, 205)), transform((256, 340))], fill="#111113", width=round(13 / 380 * 496 * SCALE))
    return image


icon = draw_icon()
for size in [192, 512]:
    rendered = icon.resize((size, size), Image.Resampling.LANCZOS)
    rendered.save(OUTPUT / f"icon-{size}-v2.png")
    rendered.save(OUTPUT / f"icon-{size}.png")

maskable = draw_icon(maskable=True)
maskable.resize((512, 512), Image.Resampling.LANCZOS).save(OUTPUT / "icon-maskable-512-v2.png")
maskable.resize((512, 512), Image.Resampling.LANCZOS).save(OUTPUT / "icon-maskable-512.png")
maskable.resize((180, 180), Image.Resampling.LANCZOS).save(OUTPUT / "apple-touch-icon-v2.png")
maskable.resize((180, 180), Image.Resampling.LANCZOS).save(OUTPUT / "apple-touch-icon.png")
for name in ["app-transparent-v2.ico", "app.ico"]:
    icon.resize((256, 256), Image.Resampling.LANCZOS).save(OUTPUT / name, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

print("Transparent application icons generated")
