"""
Generates the Khairiyat app icon.  Run: python scripts/make-icon.py

The mark is the app's own visual language, not a new invention:
  - the concentric rings are the NFC tap target from app/(caregiver)/tag-setup.tsx
  - the filled disc with a cream check is DoseRing's `confirmed` state, using the
    exact tick geometry from components/ui/DoseRing.tsx

So the icon is the moment the product exists for: a tap on a pill box that
turns into a confirmation somebody in another city can see.

Two outputs, because Android uses them differently:
  icon.png           full bleed, cream background baked in (legacy launcher)
  adaptive-icon.png  transparent, mark kept inside the adaptive safe zone

The previous logo was a 1254x1254 PNG with NO alpha channel, used as the
adaptive foreground. An opaque square foreground gets masked down to the centre
66/108 of the canvas, so the launcher cropped away the outer third and the
declared backgroundColor never showed at all.
"""

from PIL import Image, ImageDraw

SS = 4  # supersample factor, for antialiasing
SIZE = 1024

PINE = (47, 107, 79)     # theme accent   #2F6B4F
CREAM = (250, 249, 245)  # theme onAccent #FAF9F5

# Android masks an adaptive foreground down to the centre 66/108 of the canvas.
SAFE = 66 / 108


def rgba(color, alpha):
    return (color[0], color[1], color[2], int(round(255 * alpha)))


def ring(draw, cx, cy, diameter, width, fill):
    r = diameter / 2.0
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=fill, width=int(round(width)))


def disc(draw, cx, cy, diameter, fill):
    r = diameter / 2.0
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill)


def check(draw, cx, cy, box, color):
    """DoseRing's tick: M7 12.5 L10.5 16 L17 8.5 in a 24-unit box, round caps."""
    s = box / 24.0
    ox, oy = cx - box / 2.0, cy - box / 2.0
    pts = [
        (7 * s + ox, 12.5 * s + oy),
        (10.5 * s + ox, 16 * s + oy),
        (17 * s + ox, 8.5 * s + oy),
    ]

    w = 2.9 * s  # a shade heavier than the 2.4 used in-app, so it holds at 48dp
    draw.line(pts, fill=color, width=int(round(w)))

    # Round caps and joins — PIL's line primitive has neither.
    r = w / 2.0
    for (x, y) in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color)


def faded(n, alpha, paint):
    """
    ImageDraw writes RGBA straight into the pixel instead of compositing, so a
    translucent colour punches a hole through whatever is underneath rather than
    tinting it. Draw the shape opaque on its own layer, scale the alpha channel,
    and composite that.
    """
    layer = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    paint(ImageDraw.Draw(layer))
    layer.putalpha(layer.getchannel("A").point(lambda a: int(round(a * alpha))))
    return layer


def build(transparent: bool, path: str):
    n = SIZE * SS
    c = n / 2.0

    # The adaptive foreground draws its mark smaller, so nothing the launcher
    # mask crops away was ever load-bearing.
    span = (SAFE * n) if transparent else (n * 0.80)

    img = Image.new("RGBA", (n, n), (0, 0, 0, 0) if transparent else rgba(CREAM, 1.0))

    # Two ripples fading outward — the tap, not only its result.
    #
    # The outer one stops at 0.96 rather than filling the span: launcher masks
    # vary, and a ripple sliced off mid-arc reads as a rendering fault, not as
    # a design. The disc carries most of the weight so the mark still holds at
    # 48dp, where the ripples collapse to a thin halo.
    for diameter, width, alpha in ((0.96, 0.034, 0.22), (0.79, 0.040, 0.45)):
        img = Image.alpha_composite(
            img,
            faded(
                n,
                alpha,
                lambda d, dm=diameter, wm=width: ring(
                    d, c, c, span * dm, span * wm, rgba(PINE, 1.0)
                ),
            ),
        )

    d = ImageDraw.Draw(img)
    disc_d = span * 0.60
    disc(d, c, c, disc_d, rgba(PINE, 1.0))
    check(d, c, c, disc_d * 0.86, rgba(CREAM, 1.0))

    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(path)
    print(f"{path}: {img.size} mode={img.mode} alpha={img.getchannel('A').getextrema()}")


if __name__ == "__main__":
    build(transparent=False, path="assets/icon.png")
    build(transparent=True, path="assets/adaptive-icon.png")
