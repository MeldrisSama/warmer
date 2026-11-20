"""Export Speed Freeks MP4 and motion JSON: <pixel-art/scripts> <scratch> <output.mp4>."""
import math
import random
import sys
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(sys.argv[2]); ROOT.mkdir(parents=True, exist_ok=True)
SKILL = Path(sys.argv[1])
sys.path.insert(0, str(SKILL))
from pixel_art import pixel_art
import pixel_art_video as video

W, H, FPS = 480, 270, 30
DETACH, IMPACT, SETTLE = 3.30, 4.40, 4.98
panel_frames = {}
NEAR = Image.Resampling.NEAREST
duration = 8
output = Path(sys.argv[3])
source = Image.open(Path(__file__).parent/'art'/'speedfreaks-vehicle.png').convert('RGBA')
# Restore olive greens before the deliberately small 16-bit palette conversion.
graded=source.copy()
pixels=graded.load()
for left,top,right,bottom in [(300,25,680,275),(105,320,650,550),(790,380,1130,600),(1120,600,1370,905)]:
    for py in range(top,bottom):
        for px in range(left,right):
            r,g,b,a=pixels[px,py]
            if r>65 and .56*r<g<1.12*r and g>b*1.5 and a>200:
                pixels[px,py]=(round(r*.63),min(255,round(g*1.2)),round(b*.8),a)
graded.save(ROOT/'vehicle-graded.png')
converted = pixel_art(ROOT/'vehicle-graded.png', ROOT/'vehicle-pixel.png', preset='snes', block=6, palette=64, contrast=1.08, color=1)
car = converted.convert('RGBA').resize((384,256),NEAR)
car.putalpha(source.getchannel('A').resize(car.size,NEAR).point(lambda v:255 if v>=205 else 0))
# The old barrel cluster is replaced by cylinders revolving around a fixed axle.
ImageDraw.Draw(car).rectangle((225,49,280,80),fill=(0,0,0,0))
car.save(ROOT/'vehicle-sprite.png')

# One detachable panel, extracted from that same vehicle. The departure leaves a dark frame.
panel=car.transform((224,124),Image.Transform.QUAD,(91,153,80,177,164,193,176,157),resample=NEAR)
panel_mask=Image.new('L',panel.size)
ImageDraw.Draw(panel_mask).polygon([(6,0),(215,2),(223,14),(219,111),(209,123),(16,120),(0,108),(3,19)],fill=255)
panel.putalpha(panel_mask)
pd=ImageDraw.Draw(panel)
pd.line((10,2,214,4),fill=(148,123,87),width=2)
pd.line((3,106,17,118,208,122),fill=(42,33,24),width=3)
for bx,by in [(12,13),(210,15),(17,109),(207,108)]:
    pd.ellipse((bx-4,by-4,bx+4,by+4),fill=(28,24,17),outline=(131,107,69))
panel.save(ROOT/'loose-panel.png')
back=panel.copy()
bd=ImageDraw.Draw(back)
bd.polygon([(6,0),(215,2),(223,14),(219,111),(209,123),(16,120),(0,108),(3,19)],fill=(57,45,31,255))
bd.line((12,10,210,112),fill=(94,73,43,255),width=5)
bd.line((14,112,210,12),fill=(25,25,20,255),width=5)
back.putalpha(panel_mask)
missing=car.copy()
md=ImageDraw.Draw(missing)
md.polygon([(94,149),(179,154),(165,195),(78,180)],fill=(27,25,18))
md.line((94,151,165,191),fill=(59,57,42),width=3)
md.line((176,155,83,178),fill=(65,60,44),width=3)
md.line((84,179,165,193),fill=(87,69,45),width=2)

# Fixed projected wheel bounds; tyre blocks and sidewall details move over them.
wheels=[]
for cx,cy,rx,ry in [(38,182,35,45),(204,209,43,43),(356,200,22,35)]:
    box=(cx-rx,cy-ry,cx+rx,cy+ry)
    patch=car.crop(box).resize((96,96),NEAR)
    mask=Image.new('L',(rx*2,ry*2))
    ImageDraw.Draw(mask).ellipse((0,0,rx*2-1,ry*2-1),fill=255)
    wheels.append((cx,cy,rx,ry,patch,mask))

rng=random.Random(4034)
grains=[(rng.random(),rng.random(),rng.random(),rng.random()) for _ in range(1400)]
debris=[(rng.random(),rng.random(),rng.random(),rng.random()) for _ in range(110)]


def ease(a,b,t):
    p=min(1,max(0,(t-a)/(b-a)))
    return p*p*(3-2*p)


def warp_plane(texture, quad):
    # Inverse projective mapping: a real vertical tumble, including foreshortening.
    rows=[]
    for (x,y),(u,v) in zip(quad,[(0,0),(223,0),(223,123),(0,123)]):
        rows.append([x,y,1,0,0,0,-u*x,-u*y,u])
        rows.append([0,0,0,x,y,1,-v*x,-v*y,v])
    for column in range(8):
        pivot=max(range(column,8),key=lambda r:abs(rows[r][column]))
        rows[column],rows[pivot]=rows[pivot],rows[column]
        factor=rows[column][column]
        if abs(factor)<1e-8:return Image.new('RGBA',(W,H))
        rows[column]=[v/factor for v in rows[column]]
        for r in range(8):
            if r==column:continue
            factor=rows[r][column]
            rows[r]=[a-factor*b for a,b in zip(rows[r],rows[column])]
    return texture.transform((W,H),Image.Transform.PERSPECTIVE,tuple(rows[r][8] for r in range(8)),resample=NEAR)


def attached_quad(t):
    x=round(82+math.sin(t*1.7)*3+ease(3.1,4.8,t)*610)
    y=round(11+math.sin(t*18)*1.8+math.sin(t*31)*.85)
    recoil=-1 if int(t*FPS)%5 in (0,1,3) else 0
    return [(x+recoil+u*.88,y+v*.88) for u,v in [(91,153),(176,157),(164,193),(80,177)]]


def flying_quad(t):
    p=min(1,max(0,(t-DETACH)/(IMPACT-DETACH)))
    launch=attached_quad(DETACH)
    start_x=sum(q[0] for q in launch)/4
    start_y=sum(q[1] for q in launch)/4
    kick=math.sin(p*math.pi)*math.exp(-p*2.5)
    cx=start_x+(240-start_x)*p-68*kick
    cy=start_y+(139-start_y)*p-62*kick
    width=86+374*p**2.45
    if t>=IMPACT:
        age=t-IMPACT
        width*=1+.12*math.exp(-age*12)*math.cos(age*38)
    height=width*124/224
    theta=p*math.tau*3
    co,si=math.cos(theta),math.sin(theta)
    roll=-.10*(1-p)
    quad=[]
    for u,v in [(-.5,-.5),(.5,-.5),(.5,.5),(-.5,.5)]:
        xx,yy=u*width,v*height
        z=yy*si
        factor=360/(360+z)
        xx,yy=xx*factor,yy*co*factor
        quad.append((cx+xx*math.cos(roll)-yy*math.sin(roll),cy+xx*math.sin(roll)+yy*math.cos(roll)))
    blend=ease(DETACH,DETACH+.065,t)
    quad=[(a[0]+(b[0]-a[0])*blend,a[1]+(b[1]-a[1])*blend) for a,b in zip(launch,quad)]
    return quad,co>=0,cx,cy


def background(t):
    im=Image.new('RGB',(W,H))
    d=ImageDraw.Draw(im)
    for y in range(H):
        if y<114:
            p=y/114
            c=tuple(round(a+(b-a)*p) for a,b in zip((76,68,55),(158,132,91)))
        else:
            p=(y-114)/(H-114)
            c=tuple(round(a+(b-a)*p) for a,b in zip((132,104,65),(71,53,34)))
        d.line((0,y,W,y),fill=c)
    # Distant ruined industrial silhouettes and scaffold forts, kept in parallax.
    for layer in range(2):
        distance=114-layer*7
        speed=1.4+layer*2.5
        rr=random.Random(40+layer)
        for i in range(22):
            x=round((i*43-t*speed) % 946)-40
            height=rr.randrange(8,43)
            color=(95-layer*12,83-layer*11,61-layer*9)
            d.rectangle((x,distance-height,x+rr.randrange(5,17),distance),fill=color)
            d.line((x+2,distance-height-9,x+2,distance),fill=color,width=2)
            if i%3==0:
                d.line((x-4,distance-height+5,x+24,distance-height-1),fill=color,width=2)
                d.line((x+19,distance-height-6,x+19,distance+2),fill=color,width=2)
    # Uneven distant dunes, then perspective-ground granular streaks.
    d.polygon([(0,122),(48,115),(94,119),(173,112),(240,117),(310,113),(405,121),(480,115),(480,133),(0,133)],fill=(136,109,70))
    for x0,y0,v,phase in grains:
        depth=y0**.58
        y=round(123+depth*147)
        speed=36+depth*235
        x=round((x0*520-t*speed)%520)-20
        color=tuple(round(c+(v-.5)*(18+depth*28)) for c in (117-depth*35,90-depth*30,55-depth*18))
        length=1+round(depth*depth*(4+v*12))
        d.line((x,y,x-length,y+round(depth*.8)),fill=color)
    return im


def vehicle(t):
    sprite=missing.copy() if duration>3 and t>=DETACH else car.copy()
    d=ImageDraw.Draw(sprite)
    # A wheel's projected outline never rotates. Rubber blocks travel over its
    # cylindrical tread and spokes turn in the fixed, foreshortened side plane.
    for cx,cy,rx,ry,_,_ in wheels:
        fx,fy=cx-rx*.24,cy+ry*.08
        ax,ay=rx*.57,-ry*.18
        face_rx,face_ry=rx*.69,ry*.91
        # Avoid stroboscopic aliasing: 15 identical blocks at 2.1 rev/s nearly
        # repeated at each 30-fps frame. The new pitch advances visibly per frame.
        phase=t*math.tau*.73
        def point(theta,s):
            return (round(fx+face_rx*math.cos(theta)+ax*s),round(fy+face_ry*math.sin(theta)+ay*s))
        d.ellipse((round(fx-face_rx),round(fy-face_ry),round(fx+face_rx),round(fy+face_ry)),fill=(40,35,26,255),outline=(84,66,43,255),width=2)
        d.ellipse((round(fx-rx*.43),round(fy-ry*.61),round(fx+rx*.43),round(fy+ry*.61)),fill=(95,70,42,255),outline=(20,22,18,255),width=2)
        d.ellipse((round(fx-rx*.34),round(fy-ry*.50),round(fx+rx*.34),round(fy+ry*.50)),fill=(31,29,23,255))
        dirt=random.Random(round(cx)*17)
        for speck in range(145):
            angle=dirt.random()*math.tau+phase
            r=math.sqrt(dirt.random())
            px=round(fx+face_rx*r*math.cos(angle))
            py=round(fy+face_ry*r*math.sin(angle))
            shade=dirt.choice([(48,40,28,255),(67,52,33,255),(92,70,42,255),(35,31,24,255)])
            d.line((px,py,px+(1 if speck%3==0 else 0),py),fill=shade)
        for segment in range(33):
            theta=-1.6+segment*.095
            light=max(0,-math.sin(theta)*.7+math.cos(theta)*.2)
            shade=round(26+light*17)
            poly=[point(theta,0),point(theta,1),point(theta+.10,1),point(theta+.10,0)]
            d.polygon(poly,fill=(shade+4,shade,round(shade*.74),255))
        blocks=[]
        for k in range(11):
            theta=(phase+k*math.tau/11+math.pi)%math.tau-math.pi
            if not -1.52<theta<1.30: continue
            light=max(0,-math.sin(theta)*.75+math.cos(theta)*.25)
            shade=round(39+light*29)
            poly=[point(theta,0),point(theta,1),point(theta+.27,1),point(theta+.27,0)]
            blocks.append((theta,poly,(shade+8,shade,round(shade*.73),255)))
        for theta,poly,color in blocks:
            d.polygon(poly,fill=color)
            d.line((poly[0],poly[1]),fill=(112,91,62,255),width=1)
            d.line((poly[3],poly[2]),fill=(29,25,20,255),width=1)
        for k in range(6):
            angle=phase+k*math.tau/6
            outer=(round(fx+rx*.34*math.cos(angle)),round(fy+ry*.47*math.sin(angle)))
            inner=(round(fx+rx*.12*math.cos(angle)),round(fy+ry*.16*math.sin(angle)))
            d.line((inner,outer),fill=(116,85,46,255),width=2)
        for angle,r in [(phase+.2,.78),(phase+2.4,.84),(phase+4.7,.90)]:
            a=(round(fx+face_rx*r*math.cos(angle)),round(fy+face_ry*r*math.sin(angle)))
            b=(round(fx+face_rx*r*math.cos(angle+.13)),round(fy+face_ry*r*math.sin(angle+.13)))
            d.line((a,b),fill=(138,111,70,255),width=1)
        d.ellipse((round(fx-3),round(fy-4),round(fx+3),round(fy+4)),fill=(99,72,42,255),outline=(35,29,21,255))
    # Three minigun barrels: same fixed axle, orbiting front and rear end points.
    trails=Image.new('RGBA',sprite.size)
    td=ImageDraw.Draw(trails)
    for delay,opacity in [(.045,45),(.025,80)]:
        for k in range(3):
            angle=(t-delay)*math.tau*2+k*math.tau/3
            ox,oy=math.sin(angle)*3,math.cos(angle)*9
            td.line((round(224+ox),round(64+oy),round(275+ox),round(64+oy)),fill=(145,132,103,opacity),width=5)
    sprite=Image.alpha_composite(sprite,trails)
    d=ImageDraw.Draw(sprite)
    for band_x in (242,262):
        d.ellipse((band_x-3,51,band_x+3,77),fill=(79,75,58,255),outline=(22,23,19,255))
    barrels=[]
    for k in range(3):
        angle=t*math.tau*2+k*math.tau/3
        offset_x=math.sin(angle)*3
        offset_y=math.cos(angle)*9
        barrels.append((math.sin(angle),offset_x,offset_y))
    for depth,ox,oy in sorted(barrels):
        start=(round(220+ox),round(64+oy))
        end=(round(273+ox),round(64+oy))
        shade=round(74+depth*13)
        d.line((start,end),fill=(24,23,19,255),width=6)
        d.line((start[0],start[1]-1,end[0]-1,end[1]-1),fill=(shade+18,shade+10,shade-3,255),width=3)
        for vx in range(230,269,7):
            d.line((round(vx+ox),round(64+oy-1),round(vx+ox+2),round(64+oy-1)),fill=(27,25,20,255),width=1)
        d.ellipse((end[0]-2,end[1]-3,end[0]+2,end[1]+3),fill=(139,121,87,255))
        d.ellipse((end[0]-1,end[1]-2,end[0]+1,end[1]+2),fill=(17,18,15,255))
    return sprite


def flash(d,x,y,t,direction=(1,0),power=1):
    dx,dy=direction
    size=math.hypot(dx,dy)
    dx,dy=dx/size,dy/size
    rng=random.Random(int(t*30)+912+(50 if dx<0 else 0))
    reach=rng.randrange(74,112)*power
    height=rng.randrange(14,25)*power
    def point(u,v):
        return (round(x+dx*u-dy*v),round(y+dy*u+dx*v))
    flame=[(-3,-3),(7,-height*.35),(17,-height),(reach*.35,-height*.55),
           (reach*.62,-height*.92),(reach*.73,-height*.22),(reach,-height*.10),
           (reach*.83,height*.13),(reach*.74,height*.64),(reach*.53,height*.31),
           (reach*.37,height*.96),(14,height*.55),(0,5)]
    d.polygon([point(u,v) for u,v in flame],fill=(190,56,19))
    for su,sv,color in [(.92,.75,(255,137,33)),(.78,.48,(255,205,73)),(.53,.22,(255,247,217))]:
        d.polygon([point(u*su,v*sv) for u,v in flame],fill=color)
    # Jagged hot bloom and unburnt sparks share the barrel's local coordinate frame.
    for i in range(9):
        angle=rng.uniform(-math.pi,math.pi)
        start=point(7+math.cos(angle)*4,math.sin(angle)*3)
        end=point(7+math.cos(angle)*rng.uniform(12,24),math.sin(angle)*height*rng.uniform(.5,1.3))
        d.line((start,end),fill=(255,205,73),width=2 if i%3 else 1)
    d.line((point(-2,0),point(23,0)),fill=(255,247,217),width=3)
    for i in range(11):
        u=rng.uniform(reach*.25,reach*1.18)
        v=rng.uniform(-height*1.3,height*1.3)
        d.line((point(u,v),point(u+rng.uniform(3,9),v*.98)),fill=(255,205,73),width=1)


def draw_scene(t):
    frame=background(t)
    # Tracking camera: one fixed three-quarter projection, independent suspension bob.
    scale=.88
    bounce=math.sin(t*18)*1.8+math.sin(t*31)*.85
    departure=ease(3.1,4.8,t) if duration>3 else 0
    x=round(82+math.sin(t*1.7)*3+departure*610)
    y=round(11+bounce)
    tire_y=y+round(235*scale)
    # Dust trailing behind the rear wheels, porous edges rather than cartoon circles.
    dust=Image.new('RGBA',(W,H))
    dd=ImageDraw.Draw(dust)
    for seed in range(180):
        age=(t*1.6+seed*.017)%1.8
        rr=random.Random(seed+300)
        px=x+38*scale-age*(47+rr.random()*58+departure*290)
        py=tire_y-8-age*(22+rr.random()*43)+math.sin(seed*2.1)*10
        radius=6+age*(16+rr.random()*21)
        opacity=round((1-age/1.8)*135)
        poly=[]
        for k in range(9):
            a=k*math.tau/9
            r=radius*(.65+rr.random()*.4)
            poly.append((round(px+math.cos(a)*r),round(py+math.sin(a)*r*.6)))
        # Composite each porous puff, so old low-alpha puffs cannot erase the plume.
        rradius=math.ceil(radius)+2
        puff=Image.new('RGBA',(rradius*2+1,rradius*2+1))
        pd=ImageDraw.Draw(puff)
        pd.polygon([(round(xx-px+rradius),round(yy-py+rradius)) for xx,yy in poly],fill=(167,133,88,opacity))
        dust.alpha_composite(puff,(round(px)-rradius,round(py)-rradius))
    frame=Image.alpha_composite(frame.convert('RGBA'),dust)
    # Diesel smoke from the left exhaust, behind the crew and vehicle.
    exhaust=Image.new('RGBA',(W,H))
    for k in range(17):
        age=(t+k*.073)%1.25
        rr=random.Random(k+1100)
        radius=round(3+age*12)
        px=round(x+64*scale-age*(28+rr.random()*20))
        py=round(y+74*scale-age*(22+rr.random()*12))
        puff=Image.new('RGBA',(radius*2+1,radius*2+1))
        ImageDraw.Draw(puff).ellipse((0,0,radius*2,radius*2),fill=(42,40,34,round((1-age/1.25)*95)))
        exhaust.alpha_composite(puff,(px-radius,py-radius))
    frame=Image.alpha_composite(frame,exhaust)
    # A broken soft-edged tyre shadow anchors the vehicle to the rough ground.
    shadow=Image.new('RGBA',(W,H))
    sd=ImageDraw.Draw(shadow)
    sd.ellipse((x+20,tire_y-12,x+319,tire_y+13),fill=(28,22,15,130))
    for cx,cy,rx,ry,_,_ in wheels:
        bottom=y+(cy+ry)*scale
        sd.ellipse((round(x+(cx-rx)*scale),round(bottom-3),round(x+(cx+rx)*scale),round(bottom+5)),fill=(26,21,15,160))
    frame=Image.alpha_composite(frame,shadow)
    sprite=vehicle(t).resize((round(384*scale),round(256*scale)),NEAR)
    firing=int(t*FPS)%5 in (0,1,3)
    # One-pixel recoil of the complete rig preserves all attachment points.
    recoil=-1 if firing else 0
    frame.alpha_composite(sprite,(x+recoil,y))
    d=ImageDraw.Draw(frame)
    active=min(range(3),key=lambda k:math.cos(t*math.tau*2+k*math.tau/3))
    fire_angle=t*math.tau*2+active*math.tau/3
    muzzle_x=round(x+(273+math.sin(fire_angle)*3)*scale)
    muzzle_y=round(y+(64+math.cos(fire_angle)*9)*scale)
    fumes=Image.new('RGBA',(W,H))
    for origin_x,origin_y,direction in [(muzzle_x,muzzle_y,(1,0)),(round(x+12*scale),round(y+84*scale),(-1,-.24))]:
        for k in range(7):
            age=(t+k*.071)%.48
            radius=round(2+age*10)
            px=round(origin_x+direction[0]*(3+age*18))
            py=round(origin_y+direction[1]*(3+age*18)-age*20)
            puff=Image.new('RGBA',(radius*2+1,radius*2+1))
            ImageDraw.Draw(puff).ellipse((0,0,radius*2,radius*2),fill=(128,122,98,round((1-age/.48)*100)))
            fumes.alpha_composite(puff,(px-radius,py-radius))
    frame=Image.alpha_composite(frame,fumes)
    d=ImageDraw.Draw(frame)
    if firing: flash(d,muzzle_x,muzzle_y,t,(1,0),1.12)
    if int(t*FPS)%17<2: flash(d,round(x+12*scale),round(y+84*scale),t,(-1,-.24),.95)
    # Ejected cases follow short ballistic arcs from the gun, in the same projection.
    for i in range(9):
        age=(t+i*.11)%1
        bx=round(x+222*scale-age*39)
        by=round(y+57*scale-27*age+35*age*age)
        d.line((bx,by,bx+2,by+1),fill=(181,135,56),width=1)
    # Front spindrift crosses only the lower tyres; projectile-sized pebbles stay dark.
    for u,v,speed,phase in debris:
        age=(t*2.4+phase)%1
        ex=x+(38 if u<.4 else 215)*scale
        px=round(ex-age*(30+speed*65))
        py=round(tire_y-4-age*(24+v*60)+age*age*83)
        if py>=tire_y+12: continue
        color=(185,144,84,round((1-age)*190)) if v>.3 else (69,49,29,255)
        d.line((px,py,px+1+round(speed*2),py-1),fill=color,width=1)
    # Grit through the camera foreground and fast ground-level streaks.
    for i in range(65):
        rr=random.Random(850+i)
        phase=rr.random()
        depth=rr.random()
        px=round((phase*600-t*(170+depth*300))%600)-60
        py=round(160+depth*110)
        d.line((px,py,px+round(6+depth*20),py-1),fill=(163,126,75,90))
    quad=attached_quad(t)
    front=True
    if duration>3 and t>=DETACH:
        quad,front,cx,cy=flying_quad(t)
        frame=Image.alpha_composite(frame,warp_plane(panel if front else back,quad))
        d=ImageDraw.Draw(frame)
        if t<DETACH+.22:
            age=t-DETACH
            for i in range(26):
                rr=random.Random(3000+i)
                vx,vy=rr.uniform(-170,150),rr.uniform(-190,90)
                px=round(cx+vx*age);py=round(cy+vy*age+age*age*140)
                d.line((px,py,px+rr.choice([-3,3]),py+2),fill=(242,192,82),width=1)
        if IMPACT<=t<IMPACT+.32:
            age=t-IMPACT
            for i in range(78):
                rr=random.Random(900+i)
                side=-1 if i%2 else 1
                px=round(cx+side*(207+age*rr.uniform(90,260)))
                py=round(cy+rr.uniform(-110,110)+age*rr.uniform(-210,210))
                d.line((px,py,px+side*7,py+5),fill=(242,192,82),width=1)
    # Camera shake affects the complete view and settles after the impact for legible names.
    settle=1-ease(IMPACT,SETTLE,t) if duration>3 else 1
    age=max(0,t-IMPACT)
    shock=math.exp(-age*10)*18 if duration>3 and t>=IMPACT else 0
    sx=round(settle*(3.4*math.sin(t*24)+1.3*math.sin(t*57))+shock*(.75*math.cos(age*61)+.4*math.sin(age*113)))
    sy=round(settle*(2.2*math.sin(t*33)+1.1*math.sin(t*71))-shock*.9*math.cos(age*72))
    frame=ImageChops.offset(frame,sx,sy)
    panel_frames[round(t*FPS)]={'quad':[[round((xx+sx)*256/W,4),round((yy+sy)*144/H,4)] for xx,yy in quad],'front':front}
    return frame.convert('RGB')


# One shared SNES palette for sky, sand and sprite; logical frame is only 256x144.
atlas=Image.new('RGB',(480,810))
for i,t in enumerate((.25,1.2,2.4)): atlas.paste(draw_scene(t),(0,i*270))
atlas.save(ROOT/'scene-palette-source.png')
scene_palette=pixel_art(ROOT/'scene-palette-source.png',ROOT/'scene-palette.png',preset='snes',block=2,palette=24,contrast=1,color=1)
colors=scene_palette.getpalette()[:24*3]
colors += [v for rgb in [(51,69,31),(73,91,36),(105,124,50),(143,153,68),(255,137,33),(242,192,82),(255,230,155),(255,247,217)] for v in rgb]
scene_palette.putpalette(colors+[0]*(768-len(colors)))


def pixel_frame(t):
    return draw_scene(t).resize((256,144),NEAR).quantize(palette=scene_palette,dither=Image.Dither.NONE).convert('RGB').resize((1024,576),NEAR)


base=pixel_frame(0)
base.save(ROOT/'base.png')


def init(rng,w,h): return None


def draw(d,effects,t,w,h):
    frame=pixel_frame(t)
    d._image.paste(frame)
    if round(t*FPS) in (12,40,75): frame.save(ROOT/f'check-{round(t*FPS)}.png')


video.SCENES['speedfreaks']=['speedfreaks']
video._LAYERS['speedfreaks']=(init,draw)
video.pixel_art_video(ROOT/'base.png',str(output),scene='speedfreaks',duration=duration,fps=FPS,seed=4034,export_gif=False)
output.with_suffix('.json').write_text(json.dumps({'fps':FPS,'frames':[panel_frames[i] for i in range(duration*FPS)]},separators=(',',':')),encoding='utf-8')
print(output)
