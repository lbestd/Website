import asyncio
from aiohttp import web
from app.forum import views
from app.forum import sudokuviews
from app.forum import accel
from app.forum import labyr
from app.forum import labyr2
from app.forum import fitness
from app.forum import notepad
from app.forum import auth as auth_module
from app.forum import terminal as term_module
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # /…/Website


async def _start_gallery_worker(app):
    app['gallery_worker'] = asyncio.create_task(views.gallery_cache_worker())

async def _stop_gallery_worker(app):
    task = app.get('gallery_worker')
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

async def _start_preview_worker(app):
    app['preview_worker'] = asyncio.create_task(views.preview_cache_worker())

async def _stop_preview_worker(app):
    task = app.get('preview_worker')
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


def setup_routes(app):
    app.on_startup.append(_start_gallery_worker)
    app.on_cleanup.append(_stop_gallery_worker)
    app.on_startup.append(_start_preview_worker)
    app.on_cleanup.append(_stop_preview_worker)
    app.router.add_get('/x/in', auth_module.login_get)
    app.router.add_post('/x/in', auth_module.login_post)
    app.router.add_get('/x/out', auth_module.logout)
    app.router.add_get("/", views.menu)
    app.router.add_get("/images", views.index)
    app.router.add_get('/list', views.get_list)
    app.router.add_get('/preview', views.preview)
    app.router.add_get('/gpng', views.gpng)
    app.router.add_get('/gallery', views.gallery)
    app.router.add_get('/gallery/photos', views.api_gallery_photos)
    app.router.add_get('/gallery/video',  views.serve_video)
    app.router.add_get('/gallery/share',  views.api_share_create)
    app.router.add_get('/share',          views.share_view)
    app.router.add_get('/share/media',    views.share_media)
    app.router.add_get('/sudoku', sudokuviews.indexs)
    app.router.add_post('/api/generate', sudokuviews.generate_puzzle)
    app.router.add_post('/api/save', sudokuviews.save_progress)
    app.router.add_post('/api/check', sudokuviews.check_solution)
    app.router.add_static('/static/', BASE_DIR / 'static')
    app.router.add_post('/api/auto-fill-notes', sudokuviews.auto_fill_notes)
    app.router.add_get("/accel", accel.indexs)
    app.router.add_get("/labyr", labyr.indexs)
    app.router.add_get("/labyr2", labyr2.indexs)
    # app.router.add_get("/fitness", fitness.indexs)
    app.router.add_get("/arena", views.arena)
    app.router.add_get("/tetris", views.tetris)
    app.router.add_get("/minesweeper", views.minesweeper)
    app.router.add_get("/stackattack", views.stackattack)
    app.router.add_get("/synth", views.synth)
    app.router.add_get("/sampler", views.sampler)
    app.router.add_get("/contra", views.contra)
    app.router.add_get("/notepad", notepad.index)
    app.router.add_get("/notepad/file", notepad.api_get)
    app.router.add_get("/notepad/mtime", notepad.api_mtime)
    app.router.add_post("/notepad/save", notepad.api_save)
    app.router.add_get("/notepad/ws", notepad.ws_watch)
    # app.router.add_get("/terminal", term_module.index)
    # app.router.add_get("/terminal/ws", term_module.ws_terminal)
