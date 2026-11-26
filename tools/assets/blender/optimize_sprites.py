"""Resize and palette-compress Blender's transparent character frames."""
from pathlib import Path
from PIL import Image
import hashlib
root=Path(__file__).resolve().parents[3]
src=root/'tools/assets/blender/source/sprites'
out=root/'apps/web/public/assets/room'
total=0
for mood in ('idle','happy'):
    for frame in (0,1):
        im=Image.open(src/f'dayu-{mood}-{frame}.png').convert('RGBA')
        # Crop with a consistent safe margin; preserve the full hair silhouette.
        box=im.getchannel('A').getbbox()
        im=im.crop((max(0,box[0]-8),max(0,box[1]-8),min(im.width,box[2]+8),min(im.height,box[3]+8)))
        im.thumbnail((320,400),Image.Resampling.LANCZOS)
        canvas=Image.new('RGBA',(320,400),(0,0,0,0))
        canvas.alpha_composite(im,((320-im.width)//2,400-im.height))
        alpha=canvas.getchannel('A')
        rgb=canvas.convert('RGB').quantize(colors=192,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE).convert('P')
        # Reserve one transparent palette entry without introducing dark fringes.
        palette=(rgb.getpalette() + [0] * 768)[:765]+[0,0,0]
        rgb.putpalette(palette)
        mask=Image.eval(alpha,lambda v:255 if v<16 else 0)
        rgb.paste(255,mask)
        rgb.info['transparency']=255
        path=out/f'dayu-{mood}-{frame}.png'
        rgb.save(path,optimize=True,transparency=255)
        # Reopen: Pillow may shorten the palette; index 255 must really decode to alpha zero.
        with Image.open(path) as check:
            rgba = check.convert('RGBA')
            assert rgba.getpixel((0, 0))[3] == 0, f'{path.name}: transparent corner is opaque'
            assert rgba.getchannel('A').getextrema() == (0, 255)
        total+=path.stat().st_size
        assert rgb.size == (320,400)
        assert rgb.mode == 'P' and 'transparency' in rgb.info
        print(path.name,path.stat().st_size)
if total>512*1024:raise RuntimeError(f'Sprite budget exceeded: {total}')
print('SPRITE_TOTAL_BYTES',total)
