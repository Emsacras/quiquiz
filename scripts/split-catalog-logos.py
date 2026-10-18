"""Découpe la planche d’icônes catalogue en PNG individuels."""
from __future__ import annotations

from collections import deque
from pathlib import Path
from PIL import Image

SRC = Path(
    r"C:\Users\user\.cursor\projects\c-QuiQuiz\assets"
    r"\c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"5f6a292816cc582a033a0216546c0eee_images_356d68db-0148-492d-ac77-f04d010b2387-c9355bfb-b0eb-49c7-96e3-58c2535a78c0.png"
)
OUT = Path(__file__).resolve().parents[1] / "public" / "assets" / "catalog"

NAMES = [
    "biologie",
    "animaux",
    "oiseaux",
    "oiseaux-france",
    "oiseaux-royaume-uni",
    "reptiles",
    "poissons",
    "insectes",
    "mammiferes",
    "bebes-animaux",
    "plantes",
    "plantes-france",
    "arbres",
    "fruits-legumes",
    "feuilles-arbres",
    "champignons",
    "geographie",
    "pays-monde-quiz",
    "capitales",
    "drapeaux",
    "sciences-terre",
    "rochers-mineraux",
    "nuages",
    "fossiles",
    "france",
    "monde",
    "royaume-uni",
]

ROWS = 3
COLS = 9


def is_bg_seed(r: int, g: int, b: int) -> bool:
    """Pixels de fond (carte claire ou letterbox noir) pour seed du flood-fill."""
    if r < 28 and g < 28 and b < 40:
        return True
    # Fond carte bleuté uniquement — pas le blanc des nuages / drapeau FR.
    if r >= 205 and g >= 218 and b >= 230 and (b - r) >= 8 and (g - r) >= 3:
        return True
    return False


def flood_clear_background(im: Image.Image) -> Image.Image:
    """Rend transparent le fond connecté aux bords — préserve blancs intérieurs."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        r, g, b, _a = px[x, y]
        if is_bg_seed(r, g, b):
            q.append((x, y))
            seen[y * w + x] = 1

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            i = ny * w + nx
            if seen[i]:
                continue
            r, g, b, a = px[nx, ny]
            if a == 0:
                seen[i] = 1
                continue
            # continuer dans le fond clair / noir uniquement
            if is_bg_seed(r, g, b):
                seen[i] = 1
                q.append((nx, ny))
            else:
                seen[i] = 1  # bord de l’icône : stop
    return im


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA")
    gray = sheet.convert("L")
    mask = gray.point(lambda p: 255 if p > 18 else 0)
    bbox = mask.getbbox()
    content = sheet.crop(bbox)
    cw, ch = content.size
    print(f"content {cw}x{ch}")

    OUT.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(NAMES):
        row, col = divmod(i, COLS)
        # insets : évite les voisins + coupe le libellé sous l’icône
        x0 = int((col + 0.07) * cw / COLS)
        x1 = int((col + 0.93) * cw / COLS)
        y0 = int((row + 0.03) * ch / ROWS)
        y1 = int((row + 0.70) * ch / ROWS)
        cell = content.crop((x0, y0, x1, y1))
        icon = flood_clear_background(cell)
        trim = icon.getbbox()
        if trim:
            icon = icon.crop(trim)
        icon.thumbnail((192, 192), Image.Resampling.LANCZOS)
        icon.save(OUT / f"{name}.png", optimize=True)
        print(f"wrote {name}.png {icon.size}")

    # preview gris
    preview = Image.new("RGBA", (COLS * 100, ROWS * 100), (210, 210, 210, 255))
    for i, name in enumerate(NAMES):
        row, col = divmod(i, COLS)
        icon = Image.open(OUT / f"{name}.png")
        icon.thumbnail((88, 88), Image.Resampling.LANCZOS)
        px0 = col * 100 + (100 - icon.size[0]) // 2
        py0 = row * 100 + (100 - icon.size[1]) // 2
        preview.alpha_composite(icon, (px0, py0))
    preview.convert("RGB").save(Path("scripts/_icons-preview.png"))
    print("done")


if __name__ == "__main__":
    main()
