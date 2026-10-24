# Génère les icônes PWA (PNG) sans dépendance externe autre que Pillow.
from PIL import Image, ImageDraw, ImageFilter
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'client', 'assets', 'icons')
os.makedirs(OUT, exist_ok=True)

def icon(size, maskable=False):
    img = Image.new('RGBA', (size, size), (13, 15, 18, 255))
    d = ImageDraw.Draw(img)
    s = size / 512
    pad = 60 * s if maskable else 0
    # faisceau de lampe
    beam = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam)
    bd.polygon([(256 * s, 300 * s), (40 * s + pad, 60 * s + pad), (472 * s - pad, 60 * s + pad)], fill=(255, 214, 140, 120))
    beam = beam.filter(ImageFilter.GaussianBlur(18 * s))
    img.alpha_composite(beam)
    # yeux dans le noir
    for ex in (205, 307):
        d.ellipse([(ex - 22) * s, (170 - 14) * s, (ex + 22) * s, (170 + 14) * s], fill=(255, 245, 230, 255))
        d.ellipse([(ex - 7) * s, (170 - 9) * s, (ex + 7) * s, (170 + 9) * s], fill=(20, 10, 10, 255))
    # personnage (combinaison orange)
    d.ellipse([186 * s, 300 * s, 326 * s, 440 * s], fill=(230, 126, 34, 255))
    d.rounded_rectangle([206 * s, 330 * s, 306 * s, 372 * s], radius=16 * s, fill=(40, 60, 80, 255))
    d.ellipse([216 * s, 338 * s, 246 * s, 364 * s], fill=(160, 210, 255, 255))
    # bandeau
    d.rectangle([0, 456 * s, size, 500 * s], fill=(240, 163, 46, 255))
    for i in range(-2, 14):
        x = i * 44 * s
        d.polygon([(x, 500 * s), (x + 22 * s, 456 * s), (x + 44 * s, 456 * s), (x + 22 * s, 500 * s)], fill=(17, 17, 17, 255))
    return img

icon(192).save(os.path.join(OUT, 'icon-192.png'))
icon(512).save(os.path.join(OUT, 'icon-512.png'))
icon(512, maskable=True).save(os.path.join(OUT, 'icon-maskable-512.png'))
print('icônes générées dans', os.path.normpath(OUT))
