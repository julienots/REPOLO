# Icônes et écrans de démarrage de l'application Android, générés depuis l'icône du jeu.
from PIL import Image, ImageDraw, ImageFont
import os, glob
ROOT = os.path.join(os.path.dirname(__file__), '..')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
src = Image.open(os.path.join(ROOT, 'client', 'assets', 'icons', 'icon-512.png')).convert('RGBA')
mask = Image.open(os.path.join(ROOT, 'client', 'assets', 'icons', 'icon-maskable-512.png')).convert('RGBA')
for d, s in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    folder = os.path.join(RES, f'mipmap-{d}')
    src.resize((s, s), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher.png'))
    rnd = src.resize((s, s), Image.LANCZOS)
    m = Image.new('L', (s, s), 0); ImageDraw.Draw(m).ellipse([0, 0, s - 1, s - 1], fill=255)
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0)); out.paste(rnd, (0, 0), m)
    out.save(os.path.join(folder, 'ic_launcher_round.png'))
    fg = int(s * 108 / 48)
    mask.resize((fg, fg), Image.LANCZOS).save(os.path.join(folder, 'ic_launcher_foreground.png'))
with open(os.path.join(RES, 'values', 'ic_launcher_background.xml'), 'w') as f:
    f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0D0F12</color>\n</resources>\n')
font = None
for cand in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf']:
    if os.path.exists(cand): font = cand; break
for path in glob.glob(os.path.join(RES, 'drawable*', 'splash.png')):
    w, h = Image.open(path).size
    img = Image.new('RGB', (w, h), (13, 15, 18))
    d = ImageDraw.Draw(img)
    ic = src.resize((min(w, h) // 3, min(w, h) // 3), Image.LANCZOS)
    img.paste(ic, ((w - ic.width) // 2, int(h * 0.42 - ic.height / 2)), ic)
    if font:
        f = ImageFont.truetype(font, max(12, min(w, h) // 14))
        t = 'OPÉRATION PANIQUE'
        tw = d.textlength(t, font=f)
        d.text(((w - tw) / 2, h * 0.68), t, fill=(243, 234, 216), font=f)
    img.save(path)
print('ressources Android générées')
