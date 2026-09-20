"""Encode authored 60 fps cursor motion over real browser captures. Requires Pillow and FFmpeg."""
import json
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from PIL import Image, ImageDraw

capture_dir = Path(sys.argv[1])
assets = Path(__file__).resolve().parent
frames = json.loads((capture_dir / 'frames.json').read_text())


@lru_cache(maxsize=16)
def normalized(path):
    crop = json.loads(Path(str(path) + '.json').read_text())
    with Image.open(path) as source:
        image = source.crop((crop['x'], crop['y'], crop['x'] + crop['width'], crop['y'] + crop['height']))
        image = image.convert('RGB').resize((1280, 800), Image.Resampling.LANCZOS)
    # Both bottom corners must reach the green caption, never a black surrounding canvas.
    for point in [(3, 797), (1276, 797)]:
        red, green, blue = image.getpixel(point)
        assert green > red + 4 and green > blue + 2, f'Incomplete canvas in {path}'
    return image


for path in sorted({entry['path'] for entry in frames}):
    normalized(path)

for sidecar in (assets / 'screenshots').glob('*.crop.json'):
    path = Path(str(sidecar).removesuffix('.crop.json'))
    # The screenshot has the same crop metadata format as the raw captures.
    path.with_suffix('.png.json').write_text(sidecar.read_text())
    normalized(str(path)).save(path)
    path.with_suffix('.png.json').unlink()
    sidecar.unlink()

cursor = Image.new('RGBA', (112, 128))
draw = ImageDraw.Draw(cursor)
points = [(x * 4, y * 4) for x, y in [(3, 2), (3, 25), (9, 19), (14, 29), (19, 26), (14, 17), (23, 17)]]
draw.polygon(points, fill='white')
draw.line(points + [points[0]], fill='#111111', width=8, joint='curve')
cursor = cursor.resize((24, 29), Image.Resampling.LANCZOS)

video = assets / 'animation/x-anti-slop-demo.mp4'
command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
           '-s', '1280x800', '-r', '60', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium',
           '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(video)]
with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
    for index, frame in enumerate(frames):
        image = normalized(frame['path']).convert('RGBA')
        if 'ring' in frame:
            ring = Image.new('RGBA', image.size)
            radius = 16 * (.5 + frame['ring'])
            x, y = frame['x'], frame['y']
            ImageDraw.Draw(ring).ellipse((x - radius, y - radius, x + radius, y + radius),
                                        outline=(174, 234, 192, int(255 * (1 - frame['ring']))), width=2)
            image.alpha_composite(ring)
        image.alpha_composite(cursor, (round(frame['x']), round(frame['y'])))
        encoder.stdin.write(image.convert('RGB').tobytes())
        if index % 600 == 0:
            print(f'Encoded {index}/{len(frames)} frames', flush=True)
    encoder.stdin.close()
    if encoder.wait() != 0:
        raise RuntimeError('Video encoding failed')

metadata = json.loads((capture_dir / 'recording.json').read_text())
metadata['framing']['allCaptureFramesVerified'] = True
metadata['motion']['cursorComposited'] = True
metadata['motion']['maxStepPixels'] = max(((a['x'] - b['x']) ** 2 + (a['y'] - b['y']) ** 2) ** .5 for a, b in zip(frames, frames[1:]))
(assets / 'animation/recording.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(f'Wrote {video}: {len(frames)} frames at 60 fps', flush=True)
