"""Découpe la planche d’icônes catalogue (fond noir) en PNG individuels."""
from __future__ import annotations

from collections import deque
from pathlib import Path
from PIL import Image

SRC = Path(
    r"C:\Users\user\.cursor\projects\c-QuiQuiz\assets"
    r"\c__Users_user_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"5f6a292816cc582a033a0216546c0eee_images_"
    r"44698994-b268-4fe9-9624-f8ab8936a157-fc77b53a-dcd7-4838-a201-883b21b99212.png"
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


def is_ink(r: int, g: int, b: int, a: int = 255) -> bool:
    if a < 20:
        return False
    return not (r < 30 and g < 30 and b < 38)


def find_blobs(im: Image.Image) -> list[tuple[int, int, int, int]]:
    """Bbox des composantes non-noires (une par icône)."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    boxes: list[tuple[int, int, int, int, int]] = []

    def idx(x: int, y: int) -> int:
        return y * w + x

    for y in range(h):
        for x in range(w):
            i = idx(x, y)
            if seen[i]:
                continue
            r, g, b, a = px[x, y]
            if not is_ink(r, g, b, a):
                seen[i] = 1
                continue
            q = deque([(x, y)])
            seen[i] = 1
            minx = maxx = x
            miny = maxy = y
            count = 0
            while q:
                cx, cy = q.popleft()
                count += 1
                if cx < minx:
                    minx = cx
                if cx > maxx:
                    maxx = cx
                if cy < miny:
                    miny = cy
                if cy > maxy:
                    maxy = cy
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    j = idx(nx, ny)
                    if seen[j]:
                        continue
                    nr, ng, nb, na = px[nx, ny]
                    if is_ink(nr, ng, nb, na):
                        seen[j] = 1
                        q.append((nx, ny))
                    else:
                        seen[j] = 1
            if count < 400:
                continue
            bw, bh = maxx - minx + 1, maxy - miny + 1
            if bw < 20 or bh < 20:
                continue
            if bw > w * 0.35 or bh > h * 0.45:
                continue
            boxes.append((minx, miny, maxx + 1, maxy + 1, count))

    # Regrouper fragments proches (drapeau + oiseau, couronne + carte…)
    boxes.sort(key=lambda b: (b[1], b[0]))
    merged: list[list[int]] = []
    for x0, y0, x1, y1, count in boxes:
        placed = False
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        for m in merged:
            mx0, my0, mx1, my1, mc = m
            mcx, mcy = (mx0 + mx1) / 2, (my0 + my1) / 2
            # même case si centres proches
            if abs(cx - mcx) < 70 and abs(cy - mcy) < 90:
                m[0] = min(mx0, x0)
                m[1] = min(my0, y0)
                m[2] = max(mx1, x1)
                m[3] = max(my1, y1)
                m[4] = mc + count
                placed = True
                break
        if not placed:
            merged.append([x0, y0, x1, y1, count])

    # Tri lecture + garder les 27 plus grosses si trop
    merged.sort(key=lambda b: b[4], reverse=True)
    if len(merged) > 27:
        merged = merged[:27]
    # 3 rangées de 9 : tri par centre Y, puis gauche→droite dans chaque rangée
    by_y = sorted(merged, key=lambda b: (b[1] + b[3]) / 2)
    ordered = []
    for start in (0, 9, 18):
        row = by_y[start : start + 9]
        row.sort(key=lambda b: b[0])
        ordered.extend(row)
    return [(a, b, c, d) for a, b, c, d, _ in ordered]


def export_icon(sheet: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    pad = 6
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(sheet.size[0], x1 + pad)
    y1 = min(sheet.size[1], y1 + pad)
    cell = sheet.crop((x0, y0, x1, y1)).convert("RGBA")
    px = cell.load()
    w, h = cell.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and not is_ink(r, g, b, a):
                px[x, y] = (0, 0, 0, 0)
    trim = cell.getbbox()
    if trim:
        cell = cell.crop(trim)
    cell.thumbnail((256, 256), Image.Resampling.LANCZOS)
    return cell


def main() -> None:
    sheet = Image.open(SRC).convert("RGBA")
    boxes = find_blobs(sheet)
    print(f"found {len(boxes)} icons")
    for i, b in enumerate(boxes):
        print(i, b)

    if len(boxes) != 27:
        raise SystemExit(f"Attendu 27, obtenu {len(boxes)}")

    OUT.mkdir(parents=True, exist_ok=True)
    for name, box in zip(NAMES, boxes):
        icon = export_icon(sheet, box)
        icon.save(OUT / f"{name}.png", optimize=True)
        print(f"wrote {name}.png {icon.size}")

    preview = Image.new("RGBA", (9 * 110, 3 * 110), (220, 220, 220, 255))
    for i, name in enumerate(NAMES):
        row, col = divmod(i, 9)
        icon = Image.open(OUT / f"{name}.png")
        icon.thumbnail((96, 96), Image.Resampling.LANCZOS)
        preview.alpha_composite(
            icon,
            (col * 110 + (110 - icon.size[0]) // 2, row * 110 + (110 - icon.size[1]) // 2),
        )
    preview.convert("RGB").save(Path("scripts/_icons-preview.png"))
    print("done")


if __name__ == "__main__":
    main()
