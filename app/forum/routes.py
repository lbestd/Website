from aiohttp import web
from app.forum import views
from app.forum import sudokuviews
from app.forum import accel
from app.forum.auth import login_get, login_post, logout
from pathlib import Path


def setup_routes(app):
    # auth
    app.router.add_get('/x/in', login_get)
    app.router.add_post('/x/in', login_post)
    app.router.add_get('/x/out', logout)

    # gallery
    app.router.add_get('/', views.menu)
    app.router.add_get('/gallery', views.gallery)
    app.router.add_get('/images', views.index)
    app.router.add_get('/list', views.get_list)
    app.router.add_get('/preview', views.preview)
    app.router.add_get('/gpng', views.gpng)
    app.router.add_get('/api/gallery-photos', views.api_gallery_photos)
    app.router.add_get('/video', views.serve_video)
    app.router.add_get('/share', views.share_view)
    app.router.add_get('/share/media', views.share_media)
    app.router.add_get('/api/share', views.api_share_create)

    # sudoku
    app.router.add_get('/sudoku', sudokuviews.indexs)
    app.router.add_post('/api/generate', sudokuviews.generate_puzzle)
    app.router.add_post('/api/save', sudokuviews.save_progress)
    app.router.add_post('/api/check', sudokuviews.check_solution)
    app.router.add_post('/api/auto-fill-notes', sudokuviews.auto_fill_notes)

    app.router.add_get('/accel', accel.indexs)
    app.router.add_static('/static/', Path('static'))
