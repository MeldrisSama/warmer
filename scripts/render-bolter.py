"""Export reusable Bolter v4 film with pixel-art skill; see scripts/art/README.md."""

import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, sys.argv[1])
import pixel_art_video as video

scratch, gun_ref, bolt_ref, eagle_ref, output = map(Path, sys.argv[2:])
W, H, FPS = 320, 180, 30
NEAR = Image.Resampling.NEAREST

gun_pal = Image.open(gun_ref)
assert len(gun_pal.getcolors()) <= 32
gun_img = gun_pal.convert("RGBA").resize((330, 297), NEAR)
gun_img.putalpha(Image.frombytes("L", gun_img.size, bytes(
    0 if b > 125 and b > r * 1.5 and b > g * 1.55 else 255 for r, g, b, _ in gun_img.get_flattened_data())))
gun = gun_img.crop(gun_img.getbbox())
assert 215 < gun.width < 265 and 145 < gun.height < 175

bolt_pal = Image.open(bolt_ref)
reference = [rgb for _, rgb in bolt_pal.convert("RGB").getcolors() if rgb[0] > 2 * rgb[2] and rgb[1] > 22]
def reference_gold(target):
    return min(reference, key=lambda rgb: sum((value - goal) ** 2 for value, goal in zip(rgb, target)))
bronze = [reference_gold(rgb) for rgb in (
    (60, 35, 12), (104, 60, 15), (150, 89, 20), (189, 124, 25),
    (221, 159, 41), (250, 197, 67), (255, 225, 115), (255, 243, 166))]
steel = [(14, 13, 16), (26, 21, 22), (42, 32, 32), (63, 48, 42),
         (88, 69, 55), (116, 94, 69), (146, 122, 88), (180, 152, 104)]

eagle = Image.open(eagle_ref).convert("L")
assert eagle.size == (96, 49)
Image.new("RGB", (640, 360), (11, 14, 19)).save(scratch / "base.png")

engraving = Image.new("L", (87, 56))

def ease(start, end, time):
    x = min(1.0, max(0.0, (time - start) / (end - start)))
    return x * x * (3 - 2 * x)

def radius_at(u):
    if u < .03:
        return .77
    if u < .14:
        return .89
    if u < .71:
        return 1
    return max(.045, max(0, 1 - ((u - .71) / .29) ** 1.6) ** .66)

def wrapped(angle):
    return (angle + math.pi) % math.tau - math.pi

def paint_bolt(canvas, cx, cy, length, tilt, roll, clip_left):
    thick = length * .193
    layer = Image.new("RGBA", (length, math.ceil(thick * 2) + 2))
    data = layer.load()
    mid = layer.height // 2
    for x in range(length):
        u = x / (length - 1)
        radius = thick * radius_at(u)
        rim = .024 < u < .071 or .141 < u < .174 or .686 < u < .722
        nose = u > .777
        metal = steel if nose or (u < .282 and not rim) else bronze
        ink_range = .315 <= u < .665
        for y in range(max(0, mid - int(radius)), min(layer.height, mid + int(radius) + 1)):
            dy = (y - mid) / radius
            alpha = math.asin(dy)
            highlight = max(0, math.cos(alpha + .52))
            shade = int(1.2 + highlight * 4.6 + 1.3 * highlight ** 12)
            shade += (1 if rim else 0) - (1 if .728 < u < .75 or .114 < u < .128 else 0)
            if x % 11 == 3 and (x * 31 + y * 19) % 47 < 6:
                shade -= 1
            if abs(dy) > .94 or x == 0 or x == length - 1:
                color = (25, 15, 20)
            else:
                shade = min(7, max(0, shade))
                color = metal[shade]
                if ink_range:
                    surface_angle = wrapped(alpha + roll)
                    ink = eagle
                    if abs(surface_angle) > math.pi / 2:
                        surface_angle = wrapped(surface_angle - math.pi)
                        ink = engraving
                    if abs(surface_angle) < .72:
                        pixels = ink.load()
                        tx = int((u - .315) * ink.width / .35)
                        ty = int((surface_angle / 1.5 + .5) * ink.height)
                        if pixels[tx, ty]:
                            shadow = bronze[1] if ink is eagle else (42, 24, 18)
                            color = shadow if highlight > .40 else bronze[0]
                        elif ty > 1 and pixels[tx, ty - 1]:
                            color = bronze[min(7, shade + 2)]
            data[x, y] = (*color, 255)
    layer = layer.rotate(tilt, resample=NEAR, expand=True)
    x = round(cx - layer.width / 2)
    y = round(cy - layer.height / 2)
    clip = max(0, round(clip_left) - x)
    if clip < layer.width:
        layer = layer.crop((clip, 0, layer.width, layer.height))
        canvas.paste(layer, (x + clip, y), layer)

def init(rng, _w, _h):
    return [(rng.randrange(W), rng.randrange(H), rng.uniform(.25, 1.3), rng.random()) for _ in range(87)]

def scene(draw, grains, time, _w, _h):
    t = time
    gun_zoom = 1 + .53 * ease(.12, 1.39, t)
    fire = 1.43
    age = max(0, t - fire)
    tracking = ease(.11, .55, age)
    speed = ease(.11, .54, age)
    zoom = 1 + 3.68 * ease(.28, 1.46, age)
    kick = math.exp(-age * 10) * math.sin(44 * age) if age else 0
    gun_muzzle = 268 - 99 * ease(.12, 1.39, t)
    nose_world = gun_muzzle + 303 * age + 105 * age**2
    bolt_world = nose_world - 23.5
    shift = (bolt_world - 193) * tracking
    world_shift = shift
    muzzle_x = 193 + (gun_muzzle - shift - 193) * zoom
    muzzle_y = 75 + 13 * ease(.12, 1.39, t) + 3 * kick
    recoil = 28 * (1 - math.exp(-age * 76)) * math.exp(-age * 9)
    barrel_x = muzzle_x - recoil * zoom
    canvas = Image.new("RGB", (W, H), (11, 14, 19))
    d = ImageDraw.Draw(canvas)
    # Narrow bay lighting in parallax layers.
    for y, color in ((24,(18,23,29)), (31,(14,18,24)), (140,(16,20,25)), (154,(22,23,28))):
        d.line((0,y,W,y), fill=color)
    for i in range(5):
        x = int(i * 79 + 33 - .34 * world_shift) % 395 - 10
        d.line((x, 25, x - 17, 136), fill=(17, 22, 27), width=2)
        d.line((x-5, 32, x-10, 60), fill=(27, 31, 37))
    for x0, y, rate, value in grains:
        x = int(x0 - (8*t + world_shift) * rate) % W
        width = 1 + int((11 + 5 * zoom) * speed * value**2)
        color = (int(25 + 47 * value), int(30 + 26 * value), int(36 + 15 * value))
        d.line((x, y, x - width, y + (1 if y > 90 else -1)), fill=color)

    if barrel_x > -8:
        new_size = tuple(round(dim * .88 * gun_zoom * zoom) for dim in gun.size)
        held = gun.resize(new_size, NEAR)
        dx = round(barrel_x - held.width)
        dy = round(muzzle_y - held.height * .39 + recoil * .16)
        canvas.paste(held, (dx, dy), held)

    if 0 < age < .75:
        for index, (x0, y0, rate, v) in enumerate(grains[:28]):
            if age > .20 + v * .5:
                continue
            x = round(barrel_x + (24 + 80 * v) * age + x0 % 12)
            y = round(muzzle_y + (y0 % 25 - 12) * age * 4)
            color = (254, 143, 48) if age < .3 else (115, 50, 25)
            d.line((x, y, x - 2 - index % 5, y), fill=color)

    if age > 0:
        length = round(47 * zoom)
        cx = 193 + (bolt_world - shift - 193) * zoom
        cy = muzzle_y + tracking * (1.5 * math.sin(t * 3.4) + .55 * math.sin(t * 8.1))
        tilt = .52 * math.sin(t * 5.6) + .24 * math.sin(t * 9.2)
        tick = 1.2 * math.sin(83*t) + .7*math.sin(51*t)
        tail_x = round(cx - (length - 1) / 2)
        tail_y = round(cy)
        ignition = ease(.16, .30, age)
        flame = round(ignition * zoom * (29 + 2 * tick))
        height = max(2, round(ignition * zoom * (3.5 + .6 * tick)))
        if flame > 3:
            for index, (x0,y0,rate,value) in enumerate(grains[:53]):
                dist = (t * (96 + rate*290) + x0) % (flame * 2.55)
                spread = (.17 + value * .1) * dist + 2
                x = round(tail_x - dist)
                y = round(tail_y + (y0 / H - .5) * spread * 2 + .07 * dist)
                color = (169, 60, 26) if dist > flame*.72 else (252, 130, 41)
                d.line((x,y,x-2-index%6,y+1), fill=color)
                if index % 13 == 0 and dist < flame * 1.15:
                    video._pixel_cross(d, x, y, (247, 171, 71), arm=1)
            x, y, f, h = tail_x, tail_y, flame, height
            d.polygon([(x+3,y-h//2),(x-f//3,y-h),(x-f,y-h*3//2),
                       (x-f*4//5,y-h//3),(x-f,y+h*3//2),(x-f//3,y+h),(x+3,y+h//2)], fill=(117,29,23))
            d.polygon([(x+4,y-h//2),(x-f//4,y-h*3//4),(x-f*4//5,y-h),
                       (x-f*2//3,y-h//3),(x-f*6//7,y+h),(x-f//4,y+h*3//4),(x+4,y+h//2)], fill=(239,81,24))
            d.polygon([(x+6,y-h//3),(x-f//4,y-h//2),(x-f*3//4,y-h//3),
                       (x-f*4//5,y+h//2),(x-f//3,y+h//2),(x+6,y+h//3)], fill=(255,175,55))
            d.polygon([(x+7,y-h//4),(x-f//3,y-h//3),(x-f*2//3,y+1),
                       (x-f//4,y+h//3),(x+7,y+h//4)], fill=(255,238,145))
            for index, fraction in enumerate((.16,.33,.58)):
                diamond = round(x - f * fraction)
                spread = max(2, h//3 - index)
                d.polygon([(diamond-8,y),(diamond,y-spread),(diamond+8,y),(diamond,y+spread)],
                          fill=(255,253,217))
        roll = -1.05 + .92 * age - .58 * max(0, age - 3.9)**1.7
        roll += .075 * math.sin(age * 2.8) + .026 * math.sin(age * 7.7)
        paint_bolt(canvas, cx, cy, length, tilt, roll, barrel_x)

    # The expanding cloud occludes both bolt and exhaust during launch.
    if 0 < age < .44:
        x, y = round(barrel_x), round(muzzle_y)
        decay = 1 - ease(.17, .44, age)
        pressure = round(19 + 127 * age)
        d.ellipse((x-pressure//3, y-pressure, x+pressure//3, y+pressure),
                  outline=(round(173*decay+26), round(55*decay+14), 27))
        blast = Image.new("RGBA", (W,H))
        flame_draw = ImageDraw.Draw(blast)
        front = round(max(x + 104, cx + length / 2 + 26))
        radius = round(30 + 17 * ease(0, .09, age) - 18 * ease(.25, .44, age))
        center = round(x + (front-x) * .52)
        for level, color in ((1.0,(184,51,25)), (.83,(244,98,30)),
                             (.61,(255,173,59)), (.36,(255,231,138)), (.20,(255,249,204))):
            h = round(radius * level)
            tip = round(front - (front-x) * (1-level) * .21)
            flame_draw.polygon([
                (x-13,y-3), (x+2,y-h//2), (x+20,y-h), (center-13,y-h*3//4),
                (center+4,y-h), (tip-29,y-h*2//3), (tip-11,y-h//2),
                (tip,y-4), (tip-8,y+8), (tip-30,y+h//3),
                (center+17,y+h*4//5), (center-8,y+h*2//3),
                (x+19,y+h), (x+4,y+h//2), (x-13,y+6)], fill=(*color,255))
        reveal = ease(.235, .435, age)
        if reveal > 0:
            alpha = blast.getchannel("A")
            cloud = alpha.load()
            cutoff = round(reveal * 256)
            for py in range(max(0,y-radius),min(H,y+radius+1)):
                for px in range(max(0,x-13),min(W,front+1)):
                    grain = ((px*43 + py*71 + (px//4 ^ py//3)*113) & 255)
                    if grain < cutoff:
                        cloud[px,py] = 0
            blast.putalpha(alpha)
        canvas.paste(blast, (0,0), blast)

    draw._image.paste(canvas.resize((640,360), NEAR))

video.SCENES["bolter"] = ["bolter"]
video._LAYERS["bolter"] = (init, scene)
video.pixel_art_video(scratch / "base.png", str(output), scene="bolter", duration=7,
                      fps=FPS, seed=4022, export_gif=False)
