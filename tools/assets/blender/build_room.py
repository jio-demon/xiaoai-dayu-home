"""大肥鱼「奶油海盐小屋」原创 Blender 母版（Blender 4.x / 5.x）。

用法（项目根目录）：
  blender --background --python tools/assets/blender/build_room.py -- --all
  blender --background --python tools/assets/blender/build_room.py -- --mood night --render
所有家具与纹理由本脚本原创生成；只导入项目自己的 character.glb。
"""
import bpy, math, os, sys, json, random
from pathlib import Path

from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
L = json.loads((HERE / 'layout.json').read_text(encoding='utf-8'))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS and ARGS.index(name)+1 < len(ARGS) else default
OUT = Path(arg('--outdir', str(ROOT / 'apps/web/public/assets/room')))
DOCS = ROOT / 'docs/screenshots'
MOOD = arg('--mood', 'day')
random.seed(27)

def collection(name):
    c = bpy.data.collections.new(name); bpy.context.scene.collection.children.link(c); return c

def move_to(obj, col):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    col.objects.link(obj); return obj

def material(name, color, roughness=.78, metallic=0, texture=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Metallic'].default_value = metallic
    if texture:
        im = bpy.data.images.load(str(texture), check_existing=True)
        node = m.node_tree.nodes.new('ShaderNodeTexImage'); node.image = im
        m.node_tree.links.new(node.outputs['Color'], b.inputs['Base Color'])
    m.diffuse_color = (*color, 1)
    return m

def assign(o, m):
    o.data.materials.append(m); return o

def smooth(o):
    if o.type == 'MESH':
        for p in o.data.polygons: p.use_smooth = True
    return o

def bevel(o, width=.04, segments=3):
    mod = o.modifiers.new('Soft crafted edges', 'BEVEL'); mod.width = width; mod.segments = segments
    mod = o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL'); mod.keep_sharp = True
    return o

def box(name, loc, size, mat, col, radius=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(o, mat)
    if radius: bevel(o, min(radius, min(size)*.24))
    return move_to(o, col)

def uv(name, loc, scale, mat, col, seg=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc)
    o = bpy.context.object; o.name=name; o.scale=scale; assign(o,mat); smooth(o); return move_to(o,col)

def cyl(name, loc, r1, r2, depth, mat, col, vertices=24):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2, depth=depth, location=loc)
    o=bpy.context.object; o.name=name; assign(o,mat); bevel(o,.012,2); smooth(o); return move_to(o,col)

def rod(name, a, b, radius, mat, col):
    a,b=Vector(a),Vector(b); o=cyl(name,(a+b)/2,radius,radius,(b-a).length,mat,col,12)
    o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler(); return o

def curve(name, points, radius, mat, col):
    data=bpy.data.curves.new(name,'CURVE'); data.dimensions='3D'; data.resolution_u=12; data.bevel_depth=radius; data.bevel_resolution=3
    sp=data.splines.new('POLY'); sp.points.add(len(points)-1)
    for p,v in zip(sp.points,points): p.co=(*v,1)
    o=bpy.data.objects.new(name,data); col.objects.link(o); data.materials.append(mat); return o

def plane(name, loc, size, mat, col, vertical=True):
    bpy.ops.mesh.primitive_plane_add(size=1,location=loc)
    o=bpy.context.object;o.name=name;o.scale=(size[0],size[1],1)
    o.rotation_euler.x=math.pi/2
    assign(o,mat);return move_to(o,col)

def text(name, body, loc, size, mat, col):
    data=bpy.data.curves.new(name,'FONT');data.body=body;data.size=size;data.align_x='CENTER';data.extrude=.0005
    o=bpy.data.objects.new(name,data);col.objects.link(o);o.location=loc;o.rotation_euler=(math.pi/2,0,0);data.materials.append(mat);return o

def whale(name, center, size, col, body_mat, belly_mat, eye_mat):
    x,y,z=center;s=size
    uv(name+'_body',(x,y,z),(s*.50,s*.31,s*.29),body_mat,col)
    uv(name+'_belly',(x,y-s*.22,z-s*.09),(s*.39,s*.13,s*.13),belly_mat,col)
    for side in (-1,1):
        o=uv(name+'_tail',(x+side*s*.49,y+s*.03,z+s*.03),(s*.20,s*.12,s*.055),body_mat,col,16,8);o.rotation_euler.z=side*.48
    uv(name+'_eye',(x+s*.24,y-s*.265,z+s*.06),(s*.024,s*.018,s*.024),eye_mat,col,12,8)

def make_texture(kind, path):
    """用 Blender 自带 numpy 生成原创像素，再经 Blender Image API 存 PNG。"""
    import numpy as np
    n=512; yy,xx=np.mgrid[:n,:n].astype(float)
    if kind=='wood':
        row=(yy//64).astype(int); offset=(row%2)*128; bx=(xx+offset)%256
        tone=((row*17+(xx//256)*11)%13)-6
        grain=3*np.sin(yy*1.15+np.sin(xx*.024)*2)+2*np.sin(yy*.31+xx*.009)
        seam=(bx<1.4)|(yy%64<1.2)
        rgb=np.stack([213+tone+grain,188+tone+grain,151+tone+grain],axis=-1);rgb[seam]*=.86
    elif kind=='wall':
        noise=np.random.default_rng(5).normal(0,1.15,(n,n,1));rgb=np.array([238,229,212])+noise
    elif kind=='bedding':
        checks=(((xx//64)+(yy//64))%2)*8
        weave=1.5*np.sin(xx*math.pi/2)+1.2*np.sin(yy*math.pi/2)
        seam=((xx%64<3)|(xx%64>60)|(yy%64<3)|(yy%64>60))*12
        rgb=np.stack([155+checks+weave+seam,184+checks+weave+seam,199+checks+weave+seam],axis=-1)
    elif kind=='curtain':
        fold=17*np.sin(xx/19);weave=2*np.sin(yy*math.pi/2)
        rgb=np.stack([138+fold+weave,163+fold+weave,175+fold+weave],axis=-1)
    else:
        rgb=np.zeros((n,n,3));rgb[:]=(232,221,199)
        r=np.sqrt((xx-256)**2+(yy-256)**2)
        rgb[(r>237)&(r<242)]=(198,185,158);rgb[(r>223)&(r<228)]=(247,240,223)
        body=((xx-230)/143)**2+((yy-247)/87)**2<1
        tail=(xx>350)&(xx<445)&(abs(yy-239)<(xx-350)*.55+12)
        rgb[body|tail]=(145,175,191)
        belly=((xx-211)/106)**2+((yy-280)/40)**2<1;rgb[belly]=(220,232,232)
        eye=(xx-145)**2+(yy-229)**2<49;rgb[eye]=(64,90,105)
        rgb[(yy.astype(int)%8==0)&(r<230)]*=.98
    rgba=np.ones((n,n,4),dtype=np.float32);rgba[:,:,:3]=np.clip(rgb[::-1],0,255)/255
    image=bpy.data.images.new('Original_'+kind,width=n,height=n,alpha=True)
    image.colorspace_settings.name='sRGB';image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw=str(path);image.file_format='PNG';image.save();bpy.data.images.remove(image)

def build():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):
        if c.name!='Collection' and c.users==0:bpy.data.collections.remove(c)
    OUT.mkdir(parents=True,exist_ok=True);DOCS.mkdir(parents=True,exist_ok=True)
    texdir=HERE/'source';texdir.mkdir(exist_ok=True)
    for kind in ('wood','wall','bedding','rug','curtain'):make_texture(kind,texdir/(kind+'.png'))
    cols={k:collection(k) for k in ('Architecture','Bed_and_linen','Window_and_curtains','Desk_corner','Storage_and_plants','Decor','Character','Lighting','Camera')}
    A,B,W,D,S,R,C,LI,CA=[cols[k] for k in cols]
    def tm(kind,color):return material('Baked_'+kind,color,texture=texdir/(kind+'.png'))
    wood=tm('wood',(.65,.48,.30));wallmat=tm('wall',(.88,.82,.71));bedding=tm('bedding',(.42,.58,.67));rugmat=tm('rug',(.78,.72,.61));curtainmat=tm('curtain',(.42,.58,.67))
    oak=material('Light natural oak',(.57,.39,.22));pale=material('Pale oak',(.72,.56,.36));cream=material('Warm cream',(.91,.84,.71));linen=material('Unbleached linen',(.82,.77,.67));blue=material('Mist sea salt',(.35,.53,.63));brass=material('Brushed champagne brass',(.52,.36,.16),.35,.55);dark=material('Soft charcoal',(.055,.075,.085));green=material('Sage leaves',(.22,.34,.18));potmat=material('Clay rose',(.52,.30,.20));white=material('Porcelain',(.93,.89,.80));soil=material('Potting soil',(.10,.065,.035))
    box('Floor | 8 x 6 m',(0,0,-.065),(8,6,.13),wood,A,.015)
    wx,wz=L['window']['x'],-L['window']['z'];wy=L['window']['y']
    for name,loc,size in (('Back wall left',((-4+wx-1.2)/2,3.055,1.6),(wx+2.8,.11,3.2)),('Back wall right',((wx+1.2+4)/2,3.055,1.6),(4-wx-1.2,.11,3.2)),('Window lower wall',(wx,3.055,(wy-.8)/2),(2.4,.11,wy-.8)),('Window upper wall',(wx,3.055,(wy+.8+3.2)/2),(2.4,.11,3.2-wy-.8))):
        box(name,loc,size,wallmat,A,.005)
    box('Left wall',(-4.055,0,1.6),(.11,6,3.2),wallmat,A,.01)
    box('Right wall',(4.055,0,1.6),(.11,6,3.2),wallmat,A,.01)
    box('Ceiling',(0,0,3.255),(8.22,6,.11),wallmat,A,.01)
    box('Back skirting',(0,2.97,.08),(8,.08,.16),cream,A,.015)
    box('Left skirting',(-3.97,0,.08),(.08,6,.16),cream,A,.015)
    box('Back picture rail',(0,2.973,.91),(8,.045,.035),pale,A,.008)
    box('Left picture rail',(-3.973,0,.91),(.045,6,.035),pale,A,.008)
    box('Right skirting',(3.97,0,.08),(.08,6,.16),cream,A,.015)
    box('Right picture rail',(3.973,0,.91),(.045,6,.035),pale,A,.008)
    box('Left ceiling cornice',(-3.97,0,3.17),(.055,6,.065),cream,A,.008)
    box('Right ceiling cornice',(3.97,0,3.17),(.055,6,.065),cream,A,.008)
    box('Back ceiling cornice',(0,2.97,3.17),(8,.055,.065),cream,A,.008)
    # Window coordinates are web x,z -> Blender x,-z.
    wx,wz=L['window']['x'],-L['window']['z'];wy=L['window']['y']
    sky=material('Daylight outside',(.48,.70,.85),.9)
    sb=next(n for n in sky.node_tree.nodes if n.type=='BSDF_PRINCIPLED');sb.inputs['Emission Color'].default_value=(.48,.70,.85,1);sb.inputs['Emission Strength'].default_value=.35
    plane('Sky beyond window',(wx,3.18,wy),(2.4,1.6),sky,W)
    for x in (-1.23,1.23):box('Window jamb',(wx+x,wz-.055,wy),(.11,.12,1.76),cream,W,.025)
    for z in (-.83,.83):box('Window rail',(wx,wz-.055,wy+z),(2.56,.12,.11),cream,W,.025)
    box('Window mullion',(wx,wz-.075,wy),(.055,.08,1.6),pale,W,.008)
    box('Window crossbar',(wx,wz-.075,wy+.03),(2.4,.08,.045),pale,W,.008)
    box('Deep window sill',(wx,wz-.13,wy-.9),(2.7,.32,.09),pale,W,.03)
    rod('Curtain pole',(wx-1.62,wz-.23,wy+1.01),(wx+1.62,wz-.23,wy+1.01),.025,brass,W)
    for side in (-1,1):
        verts=[];faces=[];nx,nz=18,12
        for iz in range(nz+1):
            z=wy-1.04+iz/nz*2.05
            for ix in range(nx+1):
                u=ix/nx; x=wx+side*1.43+(u-.5)*.63
                y=wz-.25-.055*math.sin(u*math.pi*6)-.025*math.sin(iz/nz*math.pi)
                verts.append((x,y,z))
        for iz in range(nz):
            for ix in range(nx):
                a=iz*(nx+1)+ix;faces.append((a,a+1,a+nx+2,a+nx+1))
        me=bpy.data.meshes.new('Pleated curtain');me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new('Mist-blue pleated curtain',me);W.objects.link(o);assign(o,curtainmat);smooth(o)
        solid=o.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.008
        sheer=material('Cream sheer '+str(side),(.96,.91,.79),.95);sheer.surface_render_method='DITHERED';sheer.diffuse_color=(.96,.91,.79,.45)
        bs=next(n for n in sheer.node_tree.nodes if n.type=='BSDF_PRINCIPLED');bs.inputs['Alpha'].default_value=.45
        plane('Cream sheer',(wx+side*.96,wz-.17,wy+.02),(.45,1.72),sheer,W)
        box('Linen curtain tie',(wx+side*1.43,wz-.32,wy-.35),(.52,.07,.055),linen,W,.02)
    bx,bz=L['bed']['x'],-L['bed']['z']
    box('Upholstered bed base',(bx,bz,.27),(1.82,2.76,.35),linen,B,.11)
    box('Oak bed plinth',(bx,bz,.09),(1.67,2.58,.13),oak,B,.035)
    box('Mattress',(bx,bz,.53),(1.72,2.62,.24),cream,B,.10)
    box('Rounded upholstered headboard',(bx,bz+1.37,.72),(1.88,.17,1.04),linen,B,.085)
    for dx in (-.58,0,.58):box('Headboard stitched seam',(bx+dx,bz+1.273,.77),(.012,.015,.74),pale,B,.004)
    box('Sea-salt quilt',(bx,bz-.37,.69),(1.76,1.84,.16),bedding,B,.075)
    box('Turned-down linen sheet',(bx,bz+.43,.79),(1.77,.30,.075),linen,B,.035)
    box('Folded mist throw',(bx,bz-.92,.795),(1.79,.43,.055),blue,B,.025)
    for dx in (-.43,.43):
        o=box('Plump pillow',(bx+dx,bz+.91,.735),(.73,.48,.19),cream,B,.085);o.rotation_euler.z=-dx*.09
    whale('Bedside whale', (bx-.43,bz+.56,.94),.54,B,blue,linen,dark)
    nx,nz=-3.55,2.28
    box('Bedside cabinet',(nx,nz,.32),(.62,.58,.56),pale,B,.045)
    box('Bedside drawer',(nx,nz-.30,.43),(.52,.035,.20),cream,B,.015)
    uv('Drawer knob',(nx,nz-.33,.43),(.025,.02,.025),brass,B,12,8)
    cyl('Bedside lamp foot',(nx,nz,.65),.13,.13,.05,brass,B)
    rod('Bedside lamp stem',(nx,nz,.66),(nx,nz,1.0),.018,brass,B)
    cyl('Bedside linen shade',(nx,nz,1.02),.23,.14,.28,linen,B,32)
    dx,dz=L['desk']['x'],-L['desk']['z']
    box('Rounded oak desktop',(dx,dz,.79),(2.15,.9,.10),pale,D,.04)
    for x in (-.92,.92):
        for y in (-.32,.32):box('Desk leg',(dx+x,dz+y,.375),(.075,.075,.75),oak,D,.012)
    box('Desk drawer unit',(dx+.68,dz,.61),(.52,.68,.25),cream,D,.025)
    box('Brass drawer pull',(dx+.68,dz-.36,.62),(.17,.035,.025),brass,D,.01)
    mx,mz=dx-.22,dz+.18
    box('Monitor foot',(mx,mz,.86),(.36,.22,.035),dark,D,.015)
    box('Monitor stand',(mx,mz,.99),(.065,.065,.24),brass,D,.01)
    box('Monitor case',(mx,mz,1.35),(1.05,.065,.65),dark,D,.035)
    screen=material('Whale wallpaper',(.12,.28,.40),.5)
    ss=next(n for n in screen.node_tree.nodes if n.type=='BSDF_PRINCIPLED');ss.inputs['Emission Color'].default_value=(.12,.28,.40,1);ss.inputs['Emission Strength'].default_value=.4
    plane('Monitor display',(mx,mz-.037,1.35),(.96,.55),screen,D)
    whale('Screen whale',(mx,mz-.045,1.34),.43,D,blue,cream,dark)
    text('Screen greeting','hello, dayu',(mx,mz-.05,1.13),.047,cream,D)
    box('Keyboard',(dx-.22,dz-.24,.86),(.57,.19,.035),linen,D,.015)
    for i,m in enumerate((blue,cream,potmat)):box('Desk book',(dx+.62,dz+.17,.87+i*.047),(.30,.23,.045),m,D,.008)
    cyl('Tea mug',(dx+.48,dz-.23,.94),.065,.055,.15,white,D)
    bpy.ops.mesh.primitive_torus_add(major_radius=.045,minor_radius=.012,major_segments=16,minor_segments=8,location=(dx+.55,dz-.23,.95))
    o=bpy.context.object;o.name='Mug handle';assign(o,white);move_to(o,D)
    lx,lz=3.12,2.39
    cyl('Lamp base',(lx,lz,.865),.14,.14,.05,brass,D)
    rod('Lamp stem',(lx,lz,.88),(lx,lz,1.28),.018,brass,D)
    cyl('Warm linen lampshade',(lx,lz,1.32),.22,.12,.23,linen,D,32)
    glow=material('Amber practical glow',(1,.63,.25),.5);gb=next(n for n in glow.node_tree.nodes if n.type=='BSDF_PRINCIPLED');gb.inputs['Emission Color'].default_value=(1,.63,.25,1);gb.inputs['Emission Strength'].default_value=2
    uv('Lamp bulb',(lx,lz,1.23),(.055,.055,.04),glow,D,12,8)
    cx,cz=2.13,1.48
    box(' Upholstered chair seat',(cx,cz,.48),(.58,.53,.12),blue,D,.06)
    box('Upholstered chair back',(cx,cz-.23,.77),(.58,.10,.46),blue,D,.06)
    for x in (-.22,.22):
        for y in (-.19,.19):box('Chair oak leg',(cx+x,cz+y,.22),(.045,.045,.44),oak,D,.008)
    cyl('Whale rug',(0,-.7,.018),1.3,1.3,.025,rugmat,R,64)
    rug_obj=bpy.data.objects['Whale rug'];rug_obj.scale.y=.82
    for loop in rug_obj.data.loops:
        co=rug_obj.data.vertices[loop.vertex_index].co
        rug_obj.data.uv_layers.active.data[loop.index].uv=(co.x/2.6+.5,co.y/2.6+.5)
    wx,wz=3.65,-.9
    box('Wardrobe carcass',(wx,wz,1.11),(.66,1.55,2.18),pale,S,.045)
    for y in (-.38,.38):
        box('Cream wardrobe door',(wx-.35,wz+y,1.13),(.035,.70,1.99),cream,S,.02)
        uv('Wardrobe brass handle',(wx-.39,wz+y*.22,1.1),(.025,.025,.04),brass,S,12,8)
    sx,sz=-3.8,-1.7
    box('Bookcase back',(-3.68,sz,.78),(.12,1.3,1.52),pale,S,.015)
    for z in (.12,.62,1.12,1.57):box('Bookcase shelf',(-3.83,sz,z),(.43,1.34,.065),oak,S,.012)
    for y in (-.64,.64):box('Bookcase side',(-3.83,sz+y,.81),(.43,.065,1.5),pale,S,.012)
    for row in range(2):
        for i,m in enumerate((blue,cream,potmat,green,blue,cream)):
            h=.24+(i%3)*.045;box('Lived-in book',(-3.87,sz+.48-i*.12,.16+row*.5+h/2),(.25,.09,h),m,S,.006)
    rx,rz=-3.84,-1.98
    box('Cream radio', (rx,rz,1.70),(.27,.36,.18),cream,S,.025)
    o=cyl('Radio speaker',(rx-.145,rz+.045,1.70),.058,.058,.012,dark,S,20);o.rotation_euler.y=math.pi/2
    uv('Radio dial',(rx-.15,rz-.105,1.71),(.015,.023,.023),brass,S,12,8)
    px,pz=-3.35,-2.5
    cyl('Plant pot',(px,pz,.17),.20,.145,.34,potmat,S,32)
    cyl('Soil',(px,pz,.343),.175,.175,.012,soil,S,24)
    for i in range(9):
        a=i*math.tau/9;h=.57+(i%3)*.09
        o=uv('Sage leaf',(px+math.cos(a)*.13,pz+math.sin(a)*.13,h),(.09,.045,.31),green,S,16,8);o.rotation_euler=(math.sin(a)*.45,math.cos(a)*.45,a)
    box('Picture frame',(1.0,2.965,2.12),(.75,.055,.91),oak,R,.015)
    plane('Ocean print paper',(1.0,2.932,2.12),(.65,.81),cream,R)
    whale('Art whale',(1.0,2.922,2.18),.40,R,blue,linen,dark)
    text('Art caption','SLOW DAYS',(1.0,2.92,1.82),.057,dark,R)
    box('Bedside floating shelf',(-2.75,2.84,2.12),(1.45,.24,.065),pale,R,.02)
    for i,m in enumerate((blue,cream,potmat,green)):box('Bedside book',(-3.18+i*.11,2.84,2.29),(.09,.16,.27+i%2*.05),m,R,.006)
    cyl('Small ceramic vase',(-2.35,2.84,2.28),.06,.09,.25,cream,R,20)
    rod('Dried stem',(-2.35,2.84,2.38),(-2.31,2.84,2.71),.007,green,R)
    for i in range(3):uv('Dried leaf',(-2.33+i*.018,2.84,2.52+i*.065),(.065,.018,.025),green,R,12,8)
    pts=[]
    for i in range(49):
        u=i/48;pts.append((-3.45+u*6.88,2.91,2.96-math.sin(u*math.pi)*.13))
    curve('Fairy light cable',pts,.006,oak,R)
    for i in range(9):
        u=i/8;uv('Fairy light',(-3.45+u*6.88,2.90,2.94-math.sin(u*math.pi)*.13),(.027,.027,.027),glow,R,12,8)
    # Actual project character, not a proxy. Ground at z=0 and face the camera (+Y).
    charpath=ROOT/'apps/web/public/assets/character.glb'
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(charpath))
    imported=[o for o in bpy.data.objects if o not in before]
    roots=[o for o in imported if o.parent not in imported]
    bpy.context.view_layer.update()
    points=[o.matrix_world@Vector(v.co) for o in imported if o.type=='MESH' for v in o.data.vertices]
    lo=Vector((min(p.x for p in points),min(p.y for p in points),min(p.z for p in points)))
    hi=Vector((max(p.x for p in points),max(p.y for p in points),max(p.z for p in points)))
    scale=1.35/(hi.z-lo.z)
    holder=bpy.data.objects.new('Dayu | actual GLB',None);C.objects.link(holder)
    for o in roots:o.parent=holder
    holder.scale=(scale,scale,scale);holder.location=(-lo.x*scale+.1,-lo.y*scale-.75,-lo.z*scale)
    holder.rotation_euler.z=L['faceYaw']
    for o in imported:
        if o.type=='MESH':o.name='Dayu_'+o.name
    # Lighting and photographic composition.
    scene=bpy.context.scene
    try:scene.render.engine='BLENDER_EEVEE'
    except TypeError as e:print('Available engines:',e);raise
    scene.eevee.taa_render_samples=64
    scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.20
    world=bpy.data.worlds.new('Cream daylight world');scene.world=world;world.use_nodes=True
    next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Color'].default_value=(.72,.80,.88,1);next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value=.45
    def area(name,loc,target,power,color,size):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size
        o=bpy.data.objects.new(name,data);LI.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
    sun=area('Large sunny window key',(-.7,2.0,3.7),(0,-.5,.4),390,(1,.82,.59),3.0)
    fill=area('Soft room bounce',(1,-4,4),(0,0,.8),180,(.87,.91,1),4)
    practical=area('Desk amber pool',(3.12,2.35,1.22),(2.3,1.4,.7),24,(1,.64,.30),.3)
    bedside=area('Bedside amber pool',(-3.55,2.25,1.0),(-2.7,1,.6),18,(1,.65,.32),.3)
    camdata=bpy.data.cameras.new('Room presentation camera');cam=bpy.data.objects.new('Room presentation camera',camdata);CA.objects.link(cam)
    # Web camera is outside the open front; portrait lens keeps all furniture readable.
    cam.location=(.2,-8.7,4.25);target=Vector((0,.1,1.40));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.lens=35;scene.camera=cam
    scene['design']='Cream Sea-Salt Cottage | original geometry | shared 8x6 layout'
    scene['web_layout']=json.dumps(L)
    scene['character_height_m']=1.35
    scene['runtime_note']='Web uses matching procedural geometry; exported room GLB is interchange only.'
    if MOOD=='night':
        sun.data.energy=12;sun.data.color=(.45,.60,1);fill.data.energy=28;fill.data.color=(.52,.65,1);practical.data.energy=1400;bedside.data.energy=1000
        for lamp_name,lamp_loc in (('Desk practical point',(3.12,2.25,1.18)),('Bedside practical point',(-3.55,2.18,1.0))):
            ld=bpy.data.lights.new(lamp_name,'POINT');ld.energy=45;ld.color=(1,.62,.28);ld.shadow_soft_size=.45
            lo=bpy.data.objects.new(lamp_name,ld);LI.objects.link(lo);lo.location=lamp_loc
        next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND').inputs['Strength'].default_value=.08
        sb.inputs['Base Color'].default_value=(.025,.06,.14,1);sb.inputs['Emission Color'].default_value=(.025,.06,.14,1);scene.view_settings.exposure=.35
        # Rain streaks outside the glass, visible through the central opening.
        rainmat=material('Rain silver blue',(.42,.60,.78),.4)
        for i in range(45):
            x=wx-1.05+((i*7)%45)/45*2.1;z=wy-.69+((i*13)%45)/45*1.38
            curve('Rain outside',[(x,3.14,z),(x-.025,3.14,z+.10)],.002,rainmat,W)
    bpy.ops.object.select_all(action='DESELECT')
    return scene

def save_and_export(scene):
    # Pack source textures into editable blend so it does not depend on absolute paths.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'dayu_room.blend'),compress=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type in {'MESH','CURVE','FONT'} and not any(c.name in {'Character','Lighting','Camera'} for c in o.users_collection):o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(HERE/'dayu_room_light.glb'),export_format='GLB',use_selection=True,export_apply=True,export_materials='EXPORT',export_cameras=False,export_lights=False)
    bpy.ops.object.select_all(action='DESELECT')

def render(scene,name,width,height):
    scene.render.resolution_x=width;scene.render.resolution_y=height
    scene.render.filepath=str(DOCS/name)
    bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    scene=build()
    if '--all' in ARGS or '--save' in ARGS:save_and_export(scene)
    if '--render' in ARGS or '--all' in ARGS:
        render(scene,'room-day.png' if MOOD=='day' else 'room-rain-night.png',1920,1080)
        render(scene,'room-device-800x480.png' if MOOD=='day' else 'room-rain-night-800x480.png',800,480)
    print('DAYU_ROOM_OK',MOOD,str(HERE/'dayu_room.blend'))
