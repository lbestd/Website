import aiohttp_jinja2
from aiohttp import web
import glob
import json
import base64
import hmac as _hmac
from PIL import Image, ImageOps
from io import BytesIO
from pathlib import Path
import aiofiles
import re
import os
import asyncio

# ── Gallery cache ─────────────────────────────────────────────────────────────
_GALLERY_DIR = "/mnt/disk/photo_share/ОПУБЛИКОВАНО/"
_gallery_cache = None  # заполняется воркером

def _build_dirdict_sync():
    dirdict = {}
    l1 = l2 = l3 = ''
    for root, dirs, files in os.walk(_GALLERY_DIR, followlinks=False):
        level = root.replace(_GALLERY_DIR, '').count(os.sep)
        fsname = os.path.basename(root)
        fpath = str(os.path.realpath(root)).replace(_GALLERY_DIR, "")
        if '@' in fpath or not fsname or '.' in fpath:
            continue
        if level == 0:
            l1 = fsname
            if l1 not in dirdict:
                dirdict[l1] = {'dir': fpath, 'sdir': {}}
        elif level == 1:
            l2 = fsname
            if l2 not in dirdict.get(l1, {}).get('sdir', {}):
                dirdict[l1]['sdir'][l2] = {'dir': fpath, 'sdir': {}}
        elif level == 2:
            l3 = fsname
            if l3 not in dirdict.get(l1, {}).get('sdir', {}).get(l2, {}).get('sdir', {}):
                dirdict[l1]['sdir'][l2]['sdir'][l3] = {'dir': fpath, 'sdir': {}}
    return dirdict

async def _refresh_gallery_cache():
    global _gallery_cache
    loop = asyncio.get_event_loop()
    _gallery_cache = await loop.run_in_executor(None, _build_dirdict_sync)

async def gallery_cache_worker():
    while True:
        try:
            await _refresh_gallery_cache()
            print('Gallery cache updated')
        except Exception as e:
            print(f'Gallery cache error: {e}')
        await asyncio.sleep(300)

_CACHE_DIR = "/mnt/disk/photo_share/cache/"
_JPEG_RE  = re.compile(r'.*(JPG|jpg|jpeg|JPEG)$')
_VIDEO_RE = re.compile(r'.*\.(mp4|MP4|mov|MOV)$')
_MEDIA_RE = re.compile(r'.*(JPG|jpg|jpeg|JPEG|mp4|MP4|mov|MOV)$')

# ── Gallery path validation ───────────────────────────────────────────────────
_GALLERY_REAL = os.path.realpath(_GALLERY_DIR)
_IMAGES_REAL  = os.path.realpath('images')
_CACHE_REAL   = os.path.realpath(_CACHE_DIR)
_TRASH_DIR    = "/mnt/disk/photo_share/trash/"
_TRASH_REAL   = os.path.realpath(_TRASH_DIR)

def _safe_gallery_path(user_path: str) -> str | None:
    if not user_path:
        return None
    real = os.path.realpath(os.path.join(_GALLERY_DIR, user_path.strip('/')))
    try:
        Path(real).relative_to(_GALLERY_REAL)
    except ValueError:
        return None
    return real

# ── Gallery photos JSON API ───────────────────────────────────────────────────
async def api_gallery_photos(request):
    pathf = request.rel_url.query.get('urla', '').strip('/')
    if not pathf:
        return web.json_response({'imgs': [], 'path': ''})
    real = _safe_gallery_path(pathf)
    if real is None:
        raise web.HTTPForbidden()
    if not os.path.isdir(real):
        return web.json_response({'imgs': [], 'path': pathf})
    items = glob.glob(real + "/*")
    items.sort(key=lambda x: os.path.getmtime(x))
    items = list(filter(_MEDIA_RE.match, items))
    return web.json_response({
        'imgs': [pathf + '/' + i.split('/')[-1] for i in items],
        'path': pathf,
    })

async def serve_video(request):
    pathf = request.rel_url.query.get('urla', '').strip('/')
    if not pathf or '..' in pathf:
        raise web.HTTPForbidden()
    real = os.path.realpath(_GALLERY_DIR + pathf)
    if not real.startswith(os.path.realpath(_GALLERY_DIR)):
        raise web.HTTPForbidden()
    if not os.path.isfile(real) or not _VIDEO_RE.match(real):
        raise web.HTTPNotFound()
    return web.FileResponse(real)

# ── Share links ───────────────────────────────────────────────────────────────
def _share_token(urla: str, secret: str) -> str:
    mac = _hmac.new(secret.encode(), urla.encode(), 'sha256')
    return mac.hexdigest()[:32]

def _verify_share(request) -> tuple:
    p = request.query.get('p', '')
    t = request.query.get('t', '')
    if not p or not t:
        raise web.HTTPNotFound()
    try:
        urla = base64.urlsafe_b64decode(p + '==').decode()
    except Exception:
        raise web.HTTPNotFound()
    secret = request.app['auth_password']
    if not _hmac.compare_digest(t, _share_token(urla, secret)):
        raise web.HTTPForbidden()
    real = os.path.realpath(_GALLERY_DIR + urla)
    if not real.startswith(os.path.realpath(_GALLERY_DIR)) or not os.path.isfile(real):
        raise web.HTTPNotFound()
    return urla, bool(_VIDEO_RE.match(real))

async def api_share_create(request):
    urla = request.query.get('urla', '').strip('/')
    if not urla:
        raise web.HTTPBadRequest()
    real = os.path.realpath(_GALLERY_DIR + urla)
    if not real.startswith(os.path.realpath(_GALLERY_DIR)) or not os.path.isfile(real):
        raise web.HTTPNotFound()
    secret = request.app['auth_password']
    token = _share_token(urla, secret)
    p = base64.urlsafe_b64encode(urla.encode()).rstrip(b'=').decode()
    return web.json_response({'url': f'/share?p={p}&t={token}'})

async def share_view(request):
    urla, is_video = _verify_share(request)
    p, t = request.query.get('p'), request.query.get('t')
    fname = urla.split('/')[-1]
    media = f'/share/media?p={p}&t={t}'

    if is_video:
        media_tag = (f'<video src="{media}" controls playsinline autoplay '
                     f'style="max-width:95vw;max-height:82vh;border-radius:8px;background:#000"></video>')
    else:
        media_tag = (f'<img src="{media}" alt="{fname}" '
                     f'style="max-width:95vw;max-height:82vh;object-fit:contain;border-radius:8px">')

    html = f"""<!DOCTYPE html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{fname}</title><style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:#11111b;color:#e9ecf6;font-family:system-ui;min-height:100vh;
     display:flex;flex-direction:column;align-items:center;justify-content:center;
     gap:16px;padding:16px;background-image:url(/gpng?svg=pattern-1)}}
.media-wrap{{display:flex;align-items:center;justify-content:center}}
.bar{{display:flex;align-items:center;gap:12px;padding:9px 18px;
      background:rgba(255,255,255,0.07);border-radius:40px;backdrop-filter:blur(8px)}}
.fname{{font-size:13px;color:#a6adc8;max-width:280px;overflow:hidden;
        text-overflow:ellipsis;white-space:nowrap}}
a.btn{{text-decoration:none;background:rgba(255,255,255,0.12);color:#e9ecf6;
       padding:7px 16px;border-radius:20px;font-size:13px;transition:background .15s}}
a.btn:hover{{background:rgba(255,255,255,0.25)}}
</style></head><body>
<div class="media-wrap">{media_tag}</div>
<div class="bar">
  <span class="fname">📷 {fname}</span>
  <a class="btn" href="{media}&dl=1" download="{fname}">↓ Скачать</a>
</div>
</body></html>"""
    return web.Response(text=html, content_type='text/html')

async def share_media(request):
    urla, is_video = _verify_share(request)
    dl = request.query.get('dl') == '1'
    fname = urla.split('/')[-1]

    if is_video:
        real = os.path.realpath(_GALLERY_DIR + urla)
        resp = web.FileResponse(real)
        if dl:
            resp.headers['Content-Disposition'] = f'attachment; filename="{fname}"'
        return resp

    rel_dir = '/'.join(urla.split('/')[:-1])
    bigimg = os.path.join(_CACHE_DIR, 'big', rel_dir, fname + '.webp')
    if os.path.exists(bigimg):
        async with aiofiles.open(bigimg, 'rb') as f:
            data = await f.read()
        ctype = 'image/webp'
    else:
        async with aiofiles.open(_GALLERY_DIR + urla, 'rb') as f:
            data = await f.read()
        ctype = 'image/jpeg'

    headers = {}
    if dl:
        headers['Content-Disposition'] = f'attachment; filename="{fname}"'
    return web.Response(body=data, content_type=ctype, headers=headers)

# ── Background preview generator ─────────────────────────────────────────────
def _gen_preview_sync(orig_path, small_path, big_path):
    with open(orig_path, 'rb') as f:
        data = f.read()
    ims = Image.open(BytesIO(data))
    im = ImageOps.exif_transpose(ims)
    Path(os.path.dirname(small_path)).mkdir(parents=True, exist_ok=True)
    Path(os.path.dirname(big_path)).mkdir(parents=True, exist_ok=True)
    prevwidth, basewidth = 256, 1280
    if im.size[0] <= im.size[1]:
        pw = prevwidth / float(im.size[0])
        ph = int(im.size[0] * pw)
        bw = basewidth / float(im.size[0])
        bh = int(im.size[0] * bw)
    else:
        pw = prevwidth / float(im.size[1])
        ph = int(im.size[1] * pw)
        bw = basewidth / float(im.size[1])
        bh = int(im.size[1] * bw)
    imprev = im.copy()
    imprev.thumbnail((prevwidth, ph), Image.LANCZOS)
    imprev.save(small_path, 'webp', quality=95)
    im.thumbnail((basewidth, bh), Image.LANCZOS)
    im.save(big_path, 'webp', quality=97)

async def _scan_and_generate_previews():
    loop = asyncio.get_event_loop()
    count = 0
    for root, dirs, files in os.walk(_GALLERY_DIR, followlinks=False):
        rel_root = root.replace(_GALLERY_DIR, '').lstrip('/')
        for fname in sorted(files):
            if not _JPEG_RE.match(fname):
                continue
            small = os.path.join(_CACHE_DIR, 'small', rel_root, fname + '.webp')
            big   = os.path.join(_CACHE_DIR, 'big',   rel_root, fname + '.webp')
            if os.path.exists(small) and os.path.exists(big):
                continue
            orig = os.path.join(root, fname)
            rel  = os.path.join(rel_root, fname) if rel_root else fname
            try:
                await loop.run_in_executor(None, _gen_preview_sync, orig, small, big)
                count += 1
                print(f'Preview worker: {rel}')
            except Exception as e:
                print(f'Preview worker error ({rel}): {e}')
            await asyncio.sleep(2)
    return count

async def preview_cache_worker():
    await asyncio.sleep(20)
    while True:
        try:
            count = await _scan_and_generate_previews()
            if count:
                print(f'Preview worker: итого сгенерировано {count}')
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print(f'Preview worker error: {e}')
        await asyncio.sleep(3600)

@aiohttp_jinja2.template("index.html")
async def index(request):
    params = request.rel_url.query
    if params.get('urla'):
        pathf = params.get('urla')
        real = _safe_gallery_path(pathf)
        if real is None:
            raise web.HTTPForbidden()
        imgs = glob.glob(real + "/*")
        imgs.sort(key=lambda x: os.path.getmtime(x))
        imgs = list(filter(re.compile(r'.*(JPG|jpg|jpeg|JPEG)').match, imgs))
        ptintimgs = [i.split('/')[-1] for i in imgs]
        return {'title': 'photos', 'pathf': pathf, 'imgs': ptintimgs}
    else:
        folders = []
        for item in os.listdir(_GALLERY_DIR):
            if os.path.isdir(os.path.join(_GALLERY_DIR, item)):
                folders.append(item)
        folders.sort()
        return {'title': 'Галерея', 'folders': folders}

@aiohttp_jinja2.template("preview.html")
async def preview(request):
    params = request.rel_url.query
    if params.get('urla'):
        pathf = params.get('urla')
        real = _safe_gallery_path(pathf)
        if real is None:
            raise web.HTTPForbidden()
        imgs = glob.glob(real + "/*")
        imgs.sort(key=lambda x: os.path.getmtime(x))
        imgs = list(filter(re.compile(r'.*(JPG|jpg|jpeg|JPEG)').match, imgs))
        ptintimgs = [i.split('/')[-1] for i in imgs]
        return {'title': 'photos', 'pathf': pathf, 'imgs': ptintimgs}

@aiohttp_jinja2.template("gallery.html")
async def gallery(request):
    global _gallery_cache
    if _gallery_cache is None:
        await _refresh_gallery_cache()
    return {'title': 'menu', 'dirlist': _gallery_cache}

@aiohttp_jinja2.template("menu.html")
async def menu(request):
    global _gallery_cache
    if _gallery_cache is None:
        await _refresh_gallery_cache()
    return {'title': 'Главная - Портфолио проектов', 'dirlist': _gallery_cache}

@aiohttp_jinja2.template("arena.html")
async def arena(request):
    return {}

@aiohttp_jinja2.template("tetris.html")
async def tetris(request):
    return {}

@aiohttp_jinja2.template("stackattack.html")
async def stackattack(request):
    return {}

@aiohttp_jinja2.template("minesweeper.html")
async def minesweeper(request):
    return {}

@aiohttp_jinja2.template("synth.html")
async def synth(request):
    return {}

@aiohttp_jinja2.template("sampler.html")
async def sampler(request):
    return {}

@aiohttp_jinja2.template("contra.html")
async def contra(request):
    return {}

@aiohttp_jinja2.template("checkers.html")
async def checkers(request):
    return {}

@aiohttp_jinja2.template("chess.html")
async def chess(request):
    return {}

@aiohttp_jinja2.template("solitaire.html")
async def solitaire(request):
    return {}

@aiohttp_jinja2.template("reversi.html")
async def reversi(request):
    return {}

async def get_list(request):
    cache = '/mnt/disk/photo_share/cache/'
    trash = _TRASH_DIR
    params = request.rel_url.query
    if params.get('urldel'):
        pathf = params.get('urldel')
    elif params.get('urla'):
        pathf = params.get('urla')
    else:
        raise web.HTTPBadRequest()

    real_orig = _safe_gallery_path(pathf)
    if real_orig is None:
        raise web.HTTPForbidden()

    prev = params.get('prev')
    pathfilelist = pathf.strip('/').split('/')
    pathname = '/'.join(pathfilelist[:-1])
    filename = pathfilelist[-1]
    cachepath = cache + 'small/' + pathname
    cachebigpath = cache + 'big/' + pathname
    trashpath = trash + pathname
    bigimg = cachebigpath + '/' + filename + '.webp'
    smallimg = cachepath + '/' + filename + '.webp'
    origimg = real_orig
    trashimg = trash + pathf.strip('/')

    if not os.path.realpath(bigimg).startswith(_CACHE_REAL):
        raise web.HTTPForbidden()
    if not os.path.realpath(trashimg).startswith(_TRASH_REAL):
        raise web.HTTPForbidden()

    if not os.path.exists(trashpath):
        Path(trashpath).mkdir(parents=True, exist_ok=True)

    if params.get('urldel'):
        origin  = request.headers.get('Origin', '')
        referer = request.headers.get('Referer', '')
        host    = request.headers.get('Host', '')
        source  = origin or referer
        if source:
            from urllib.parse import urlparse
            if urlparse(source).netloc != host:
                raise web.HTTPForbidden()

        if not os.path.isfile(bigimg):
            if os.path.isfile(trashimg):
                os.rename(trashimg, origimg)
        else:
            os.rename(origimg, trashimg)
            os.remove(bigimg)
            os.remove(smallimg)
        return web.Response(body='200')

    if params.get('urla'):
        if not os.path.isfile(bigimg):
            if os.path.isfile(trashimg):
                os.rename(trashimg, origimg)
        if os.path.isfile(smallimg):
            if prev == 'yes':
                imgs = smallimg
                fmt = 'webp'
            elif prev == 'orig':
                imgs = origimg
                fmt = 'jpeg'
            else:
                imgs = bigimg
                fmt = 'webp'

            file = await open_image(imgs)
            ims = Image.open(BytesIO(file))
            im = ImageOps.exif_transpose(ims)
            stream = BytesIO()
            im.save(stream, fmt)

        else:
            imgs = real_orig
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
            im.thumbnail((basewidth, hsize), Image.LANCZOS)
            im.save(cachebigpath + '/' + filename + '.webp', 'webp', quality=97)

            stream = BytesIO()
            if prev == 'yes':
                imprev.save(stream, 'webp')
            else:
                im.save(stream, "webp")

    return web.Response(body=stream.getvalue(), content_type='image/jpeg')

async def open_image(path) -> None:
    async with aiofiles.open(path, "rb") as file:
        contents = await file.read()
        return contents

async def gpng(request) -> None:
    params = request.rel_url.query
    if params.get('png'):
        name = params.get('png')
        real = os.path.realpath(os.path.join('images', name + '.png'))
        try:
            Path(real).relative_to(_IMAGES_REAL)
        except ValueError:
            raise web.HTTPForbidden()
        async with aiofiles.open(real, "rb") as file:
            return web.Response(body=await file.read(), content_type='image/png')
    if params.get('svg'):
        name = params.get('svg')
        real = os.path.realpath(os.path.join('images', name + '.svg'))
        try:
            Path(real).relative_to(_IMAGES_REAL)
        except ValueError:
            raise web.HTTPForbidden()
        async with aiofiles.open(real, "rb") as file:
            return web.Response(body=await file.read(), content_type='image/svg+xml')
