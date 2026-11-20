
"""Re-export the reusable silent Warp film using the pixel-art skill (see art/README.md)."""
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, sys.argv[1])
import pixel_art_video as video

scratch, source, output = map(Path, sys.argv[2:5])
W, H = 320, 180
FPS = 30
base_color = (8, 3, 17)
near = Image.Resampling.NEAREST
portal = Image.open(source)
assert len(portal.getcolors()) <= 32
sprite = portal.convert("RGB").resize((256, 256), near)
Image.new("RGB", (W * 2, H * 2)).save(scratch / "base.png")

def ease(start, end, t):
    x = min(1.0, max(0.0, (t - start) / (end - start)))
    return x * x * (3.0 - 2.0 * x)

def make_effects(rng, _width, _height):
    arcs = []
    for when in (.60, .78, .97, 1.12, 1.29, 1.45, 1.55, 1.69, 1.84, 1.96,
                 2.11, 2.26, 2.38, 2.49, 2.60, 2.70, 2.81, 2.94, 3.06, 3.23):
        angle = rng.uniform(0, math.tau)
        bend = rng.uniform(-.36, .36)
        reach = rng.uniform(1.26, 1.57)
        steps = [
            (.74 + (reach - .74) * index / 8,
             angle + bend * index / 8 + rng.uniform(-.12, .12))
            for index in range(9)
        ]
        arcs.append((when, rng.uniform(.10, .21), steps, rng.choice((-1, 1))))
    sparks = [(rng.uniform(0, math.tau), rng.uniform(.63, 1.64), rng.random())
              for _ in range(60)]
    return arcs, sparks

def draw_warp(draw, effects, t, _width, _height):
    arcs, sparks = effects
    opening = ease(.04, 1.45, t)
    zoom = ease(2.34, 3.58, t)
    settle = 1 - ease(3.02, 3.58, t)
    drift = .55 * math.sin(25 * t) + .45 * math.sin(41 * t)
    scale = (.025 + .81 * opening) * math.exp(1.39 * zoom)
    sx = scale * (1 + .034 * drift * settle)
    sy = scale * (.47 + .53 * opening) * (1 - .043 * drift * settle)
    cx = W / 2 + (3 * math.sin(6 * t) + 1.6 * math.sin(19 * t)) * settle
    cy = H / 2 + (2.5 * math.sin(8 * t) + 1.3 * math.sin(27 * t)) * settle
    angle = t * .59 + .58 * zoom + .065 * math.sin(t * 8) * settle
    co, si = math.cos(angle), math.sin(angle)
    a, b = co / sx, si / sx
    d, e = -si / sy, co / sy
    warp = sprite.transform((W, H), Image.Transform.AFFINE,
                            (a, b, 128 - a * cx - b * cy, d, e, 128 - d * cx - e * cy),
                            resample=near)
    if zoom > .1:
        warp = warp.point([round(value * (1 - .60 * zoom)) for value in range(256)] * 3)
    canvas = ImageChops.lighter(Image.new("RGB", (W, H), base_color), warp)
    pixels = ImageDraw.Draw(canvas)

    radius = 104 * scale
    for bearing, distance, phase in sparks:
        theta = bearing + angle * (.9 + phase / 2)
        r = radius * distance + (t * (7 + 8 * phase) % 19)
        x, y = round(cx + math.cos(theta) * r), round(cy + math.sin(theta) * r * .90)
        if opening > .16 and math.sin(t * 11 + phase * 70) > .13 + zoom * .45:
            color = (148, 68, 214) if phase > .38 else (86, 37, 151)
            if phase > .9:
                video._pixel_cross(pixels, x, y, color, arm=1)
            else:
                pixels.point((x, y), fill=color)

    for when, life, steps, side in arcs:
        age = (t - when) / life
        if not 0 <= age < 1:
            continue
        arc_angle = angle * .67
        def point(distance, heading):
            theta = heading + arc_angle
            return round(cx + radius * distance * math.cos(theta)), round(cy + radius * distance * math.sin(theta))
        path = [point(distance, heading) for distance, heading in steps]
        branch = [path[4], point(1.14, steps[4][1] + side * .18),
                  point(1.39, steps[4][1] + side * .21),
                  point(1.54, steps[4][1] + side * .31)]
        pixels.line(path, fill=(93, 31, 180), width=4)
        pixels.line(branch, fill=(115, 56, 204), width=2)
        pixels.line(path, fill=(239, 217, 255) if age < .58 else (164, 102, 249))
        pixels.line(branch, fill=(221, 170, 255) if age < .58 else (149, 87, 236))
        video._pixel_cross(pixels, *path[3], (228, 190, 255), arm=2)

    draw._image.paste(canvas.resize((640, 360), near))

video.SCENES["warp"] = ["warp"]
video._LAYERS["warp"] = (make_effects, draw_warp)
video.pixel_art_video(scratch / "base.png", str(output), scene="warp",
                      duration=6, fps=FPS, seed=403000, export_gif=False)
