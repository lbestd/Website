import os
import re
import glob
import aiofiles
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageOps
import asyncio
import time
import threading
dir = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
cache = '/mnt/disk/photo_share/cache/'
maximumNumberOfThreads = 20
threadLimiter = threading.BoundedSemaphore(maximumNumberOfThreads)
def chunks(lst, n):
    """Yield successive n-sized chunks from lst."""
    for i in range(0, len(lst), n):
        yield lst[i:i + n]
def open_image(path) -> None:
    with open(path, "rb") as file:
        contents = file.read()
        return contents

def createcache(srcpath,imgpath,imgname):
    cachepath = cache + 'small/' + imgpath
    cachebigpath = cache + 'big/' + imgpath
    if not os.path.isfile(cachepath + '/' + imgname + '.webp') or not os.path.isfile(cachebigpath + '/' + imgname + '.webp'):
        file = open_image(srcpath)
        print(srcpath)
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
        imprev.save(cachepath + '/' + imgname + '.webp', 'webp', quality=95)

        im.thumbnail((basewidth, hsize), Image.LANCZOS)
        im.save(cachebigpath + '/' + imgname + '.webp', 'webp', quality=97)

dirdict = {}
l1 = ''
l2 = ''
l3 = ''
loop = asyncio.get_event_loop()
tasks = []
a=0
start = time.time()
for root, dirs, files in os.walk(dir, followlinks=False):
    level = root.replace(dir, '').count(os.sep)
    fsname = os.path.basename(root)
    fpath = str(os.path.realpath(root)).replace(dir, "")
    if '@' in fpath or not fsname or '.' in fpath:
        continue
    print(fpath)

    imgs = glob.glob(dir +fpath +"/*")
    imgs.sort(key=lambda x: os.path.getmtime(x))
    imgs = list(filter(re.compile(r'.*(JPG|jpg|jpeg|JPEG)').match, imgs))
    ptintimgs = [i.split('/')[-1] for i in imgs]
    threads = []
    imgs_to_create = []
    for chunka in chunks(imgs,20):
        for img in chunka:
            imgpath = img.replace(dir, '')
            pathfilelist = imgpath.split('/')
            pathname = '/'.join(pathfilelist[:-1])
            imgname = pathfilelist[-1]
            #createcache(img,pathname,imgname)

            thread = threading.Thread(target=(createcache), args=(img,pathname,imgname))
            thread.daemon = True
            threads.append(thread)
            thread.start()

        for thread in threads:
            thread.join()

    end = time.time()
    print(f'Time: {end-start:.2f} sec')
