import os, shutil, sys
from PIL import Image
SRC='/home/user/microsoft/microsoft-rocketbox/Assets'; DST=sys.argv[1]
pick={'Adults':['Male_Adult_01','Male_Adult_02','Male_Adult_03','Male_Adult_04','Male_Adult_05','Male_Adult_06','Female_Adult_01','Female_Adult_02','Female_Adult_03','Female_Adult_04','Female_Adult_05','Female_Adult_06'],
 'Professions':['Police_Male_01','Police_Male_02','Police_Female_01','Medical_Male_01','Medical_Female_01','Fire_Male_01','Fire_Female_01','Military_Male_01','Military_Male_02','Military_Female_01','Security_Male_01','Business_Male_01','Business_Female_01','Sports_Male_01','Sports_Female_01']}
for grp,names in pick.items():
  for n in names:
    src=f'{SRC}/Avatars/{grp}/{n}'; d=f'{DST}/av/{n}'; os.makedirs(d,exist_ok=True)
    shutil.copy(f'{src}/Export/{n}.fbx', d)
    for t in os.listdir(f'{src}/Textures'):
      if not t.lower().endswith('.tga'): continue
      im=Image.open(f'{src}/Textures/{t}'); base=t[:-4]
      if 'opacity' in t: im.convert('RGBA').resize((min(1024,im.width),)*2).save(f'{d}/{base}.png', optimize=True)
      elif 'specular' in t: im.convert('RGB').resize((512,512)).save(f'{d}/{base}.jpg', quality=82)
      else: (im.convert('RGBA') if im.mode=='RGBA' and 'color' in t else im.convert('RGB')).resize((1024,1024)).save(f'{d}/{base}.png' if im.mode=='RGBA' and 'color' in t else f'{d}/{base}.jpg', quality=85)
    print(n, sum(os.path.getsize(f'{d}/{f}') for f in os.listdir(d))//1024, 'KB')
anims=['m_walk_neutral_01','f_walk_neutral_01','m_run_neutral','f_run_neutral','m_walk_injured','m_run_fast_01']
stat=['m_idle_neutral_01','f_idle_neutral_01','m_idle_look_around_01','f_idle_look_around_01','m_sit_chair_idle_neutral_01','f_sit_chair_idle_neutral_01','m_gestic_talk_neutral_01','f_gestic_talk_neutral_01','m_cell_phone_talk_01','m_wave_01','f_wave_01','m_crouch_idle','m_idle_nervous_01','f_idle_nervous_01']
for a in anims: shutil.copy(f'{SRC}/Animations/all_animations_max_motextr_xy/{a}.max.fbx', f'{DST}/anim/{a}.fbx')
for a in stat: shutil.copy(f'{SRC}/Animations/all_animations_max_motextr_static/{a}.max.fbx', f'{DST}/anim/{a}.fbx')
shutil.copy('/home/user/microsoft/microsoft-rocketbox/LICENSE', f'{DST}/LICENSE')
