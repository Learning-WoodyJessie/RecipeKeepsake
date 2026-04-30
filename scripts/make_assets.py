"""
Generate app icon (1024×1024) and splash screen (2732×2732) from existing assets.

Usage:
    pip install Pillow
    python -m scripts.make_assets

Output:
    web/assets/icon.png     — 1024×1024 square icon for both iOS and Android
    web/assets/splash.png   — 2732×2732 splash for both platforms

These files are then processed by:
    npx capacitor-assets generate
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "web" / "assets"
BG_COLOR = (250, 246, 240, 255)  # #FAF6F0 — warm cream


def _paste_centered(canvas: Image.Image, layer: Image.Image, max_w: int, max_h: int) -> None:
    """Scale layer to fit within max_w × max_h, paste centered on canvas."""
    lw, lh = layer.size
    scale = min(max_w / lw, max_h / lh)
    new_size = (int(lw * scale), int(lh * scale))
    layer = layer.resize(new_size, Image.LANCZOS)
    x = (canvas.width - layer.width) // 2
    y = (canvas.height - layer.height) // 2
    if layer.mode == "RGBA":
        canvas.paste(layer, (x, y), layer)
    else:
        canvas.paste(layer, (x, y))


def make_icon() -> Path:
    """1024×1024 — App Store / Play Store icon."""
    img = Image.new("RGBA", (1024, 1024), BG_COLOR)

    logo_path = ASSETS / "landing-logo.png"
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        _paste_centered(img, logo, max_w=700, max_h=350)
    else:
        # Fallback: draw a simple text placeholder
        d = ImageDraw.Draw(img)
        d.text((200, 460), "RK", fill=(196, 128, 106, 255))

    out = ASSETS / "icon.png"
    img.convert("RGB").save(out, "PNG")
    print(f"✅ Icon saved:   {out}  ({img.width}×{img.height})")
    return out


def make_splash() -> Path:
    """2732×2732 — Splash screen for all device sizes."""
    img = Image.new("RGBA", (2732, 2732), BG_COLOR)

    logo_path = ASSETS / "landing-logo.png"
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
        _paste_centered(img, logo, max_w=900, max_h=450)

    out = ASSETS / "splash.png"
    img.convert("RGB").save(out, "PNG")
    print(f"✅ Splash saved: {out}  ({img.width}×{img.height})")
    return out


if __name__ == "__main__":
    try:
        make_icon()
        make_splash()
        print("\nNext: npx capacitor-assets generate --iconBackgroundColor '#FAF6F0' --splashBackgroundColor '#FAF6F0'")
    except ImportError:
        print("❌ Pillow not installed. Run: pip install Pillow")
