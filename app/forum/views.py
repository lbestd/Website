import aiohttp_jinja2
from aiohttp import web
import glob
import json
from PIL import Image, ImageOps
from io import BytesIO
from pathlib import Path
import aiofiles
import re
import os
from aiohttp_basicauth import BasicAuthMiddleware

## whatever code you want here
auth = BasicAuthMiddleware(username='user', password='REDACTED', force=False)
# создаем функцию, которая будет отдавать html-файл
@auth.required
@aiohttp_jinja2.template("index.html")
async def index(request):
    dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    params = request.rel_url.query
    if params.get('urla'):
        pathf = params.get('urla')
        imgs = glob.glob(dir+pathf+"/*")
        imgs.sort(key=lambda x: os.path.getmtime(x))
        imgs = list(filter(re.compile(r'.*(JPG|jpg|jpeg|JPEG)').match, imgs))
        ptintimgs = [i.split('/')[-1] for i in imgs]
        return {'title': 'photos','pathf':pathf,'imgs' : ptintimgs,}
    else:
        # Показываем список каталогов
        folders = []
        for item in os.listdir(dir):
            item_path = os.path.join(dir, item)
            if os.path.isdir(item_path):
                folders.append(item)
        folders.sort()
        return {'title': 'Галерея', 'folders': folders}
@auth.required
@aiohttp_jinja2.template("preview.html")
async def preview(request):
    dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    params = request.rel_url.query
    if params.get('urla'):
        pathf = params.get('urla')
        imgs = glob.glob(dir+pathf+"/*")
        imgs.sort(key=lambda x: os.path.getmtime(x))
        imgs = list(filter(re.compile(r'.*(JPG|jpg|jpeg|JPEG)').match, imgs))
        ptintimgs = [i.split('/')[-1] for i in imgs]
        return {'title': 'photos','pathf':pathf,'imgs' : ptintimgs,}

@auth.required
@aiohttp_jinja2.template("menu.html")
async def menu(request):
    dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    dirdict = {}
    l1 = ''
    l2 = ''
    l3 = ''
    for root, dirs, files in os.walk(dir,followlinks=False):
        level = root.replace(dir, '').count(os.sep)
        fsname = os.path.basename(root)
        fpath = str(os.path.realpath(root)).replace(dir,"")
        if '@' in fpath or not fsname or  '.' in fpath:
            continue
        if level == 0:
            l1 = fsname
            if not dirdict.get(l1):
                dirdict.update({l1:{'dir':fpath,'sdir': {}}})

        if level == 1:
            l2 = fsname
            if not dirdict.get(l1).get('sdir').get(l2):
                dirdict[l1]['sdir'].update({l2:{'dir':fpath,'sdir': {}}})
        if level == 2:
            l3 = fsname
            if not dirdict.get(l1).get('sdir').get(l2).get('sdir').get(l3):
                dirdict[l1]['sdir'][l2]['sdir'].update({l3:{'dir':fpath,'sdir': {}}})
    return {'title':'menu', 'dirlist' : dirdict,}

@auth.required
async def get_list(request):
    dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
    cache = '/mnt/disk/photo_share/cache/'
    trash = '/mnt/disk/photo_share/trash/'
    params = request.rel_url.query
    if params.get('urldel'):
        pathf = params.get('urldel')
    elif params.get('urla'):
        pathf = params.get('urla')
    prev = params.get('prev')
    pathfilelist = pathf.split('/')
    pathname = '/'.join(pathfilelist[:-1])
    filename = pathfilelist[-1]
    cachepath = cache + 'small/' + pathname
    cachebigpath = cache + 'big/' + pathname
    trashpath = trash + pathname
    bigimg = cachebigpath + '/' + filename + '.webp'
    smallimg = cachepath + '/' + filename + '.webp'
    origimg = dir + pathf
    trashimg = trash + pathf

    if not os.path.exists(trashpath):
        Path(trashpath).mkdir(parents=True, exist_ok=True)

    if params.get('urldel'):

        if not os.path.isfile(bigimg):
            if os.path.isfile(trashimg):
                os.rename(trashimg, origimg)
                #print('restored: ' + origimg)
        else:
            os.rename(origimg, trashimg)
            os.remove(bigimg)
            os.remove(smallimg)
            #print('removed: ' + origimg)
        return web.Response(body='200')
    if params.get('urla'):
        if not os.path.isfile(bigimg):
            if os.path.isfile(trashimg):
                os.rename(trashimg, origimg)
        if os.path.isfile(smallimg):
            if prev =='yes':
                imgs = smallimg
                fmt = 'webp'
            elif prev =='orig':
                imgs = origimg
                fmt = 'jpeg'
            else:
                imgs = bigimg
                fmt = 'webp'


            file = await open_image(imgs)
            ims = Image.open(BytesIO(file))
            im = ImageOps.exif_transpose(ims)
            stream = BytesIO()
            im.save(stream,fmt)


        else:
            imgs = dir + pathf
            file = await open_image(imgs)
            ims = Image.open(BytesIO(file))
            im = ImageOps.exif_transpose(ims)
            if not os.path.exists(cachebigpath):
                Path(cachebigpath).mkdir(parents=True, exist_ok=True)
            if not os.path.exists(cachepath):
                Path(cachepath).mkdir(parents=True, exist_ok=True)
            prevwidth = 256
            basewidth = 1280
            if im.size[0] <= im.size[1]:
                prevwpercent = (prevwidth / float(im.size[0]))
                prevhsize = int((float(im.size[0]) * float(prevwpercent)))
                wpercent = (basewidth / float(im.size[0]))
                hsize = int((float(im.size[0]) * float(wpercent)))
            else:
                prevwpercent = (prevwidth / float(im.size[1]))
                prevhsize = int((float(im.size[1]) * float(prevwpercent)))
                wpercent = (basewidth / float(im.size[1]))
                hsize = int((float(im.size[1]) * float(wpercent)))


            imprev = im.copy()

            imprev.thumbnail((prevwidth, prevhsize), Image.LANCZOS)
            imprev.save(cachepath + '/' + filename + '.webp', 'webp', quality=95)

            im.thumbnail((basewidth,hsize), Image.LANCZOS)
            im.save(cachebigpath + '/' + filename + '.webp', 'webp', quality=97)

            stream = BytesIO()
            if prev =='yes':
                imprev.save(stream,'webp')
            else:
                im.save(stream, "webp")

    return web.Response(body=stream.getvalue(), content_type='image/jpeg')

async def open_image(path) -> None:
    async with aiofiles.open(path, "rb") as file:
        contents = await file.read()
        return contents
@auth.required
async def gpng(request) -> None:
    params = request.rel_url.query
    if params.get('png'):
        prev = params.get('png')
        async with aiofiles.open('images/'+prev+'.png', "rb") as file:
            contents = await file.read()
            return web.Response(body=contents, content_type='image/png')
    if params.get('svg'):
        prev = params.get('svg')
        async with aiofiles.open('images/'+prev+'.svg', "rb") as file:
            contents = await file.read()
            return web.Response(body=contents, content_type='image/svg+xml')