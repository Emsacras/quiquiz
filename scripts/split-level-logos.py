"""Découpe la planche difficultés (fond noir) en 4 PNG, sans le texte."""
from __future__ import annotations

from pathlib import Path
from PIL import Image

SRC = Path(
    r"C:\Users\user\.cursor\projects\c-QuiQuiz\assets"
    r"\c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"5f6a292816cc582a033a0216546c0eee_images_"
    r"a117a7bd-a0b5-43de-a098-2beffe27b3f1-49c4d8a2-5b4d-44da-961a-e2cb02d17400.png"
)
OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "levels"
NAMES = ["facile", "moyen", "difficile", "melange"]


def black_to_transparent(im: Image.Image, thresh: int = 28) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r < thresh and g < thresh and b < thresh:
                px[x, y] = (0, 0, 0, 0)
    return im


def content_bbox(im: Image.Image, pad: int = 8) -> tuple[int, int, int, int]:
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 20:
                if x < minx:
                    minx = x
                if y < miny:
                    miny = y
                if x > maxx:
                    maxx = x
                if y > maxy:
                    maxy = y
    if maxx < 0:
        return (0, 0, w, h)
    return (
        max(0, minx - pad),
        max(0, miny - pad),
        min(w, maxx + 1 + pad),
        min(h, maxy + 1 + pad),
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC).convert("RGBA")
    w, h = sheet.size
    # Couper le bandeau de texte en bas (~22 % bas)
    icons = sheet.crop((0, 0, w, int(h * 0.78)))
    icons = black_to_transparent(icons)
    cell_w = icons.width // 4
    for i, name in enumerate(NAMES):
        cell = icons.crop((i * cell_w, 0, (i + 1) * cell_w if i < 3 else icons.width, icons.height))
        cell = black_to_transparent(cell)
        box = content_bbox(cell, pad=10)
        cropped = cell.crop(box)
        # Carré centré, taille uniforme
        side = max(cropped.width, cropped.height)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        ox = (side - cropped.width) // 2
        oy = (side - cropped.height) // 2
        canvas.paste(cropped, (ox, oy), cropped)
        out = OUT / f"{name}.png"
        canvas.save(out, "PNG")
        print(f"{name}: {canvas.size} -> {out}")


if __name__ == "__main__":
    main()
