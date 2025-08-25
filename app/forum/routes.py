from aiohttp import web
from app.forum import views
from app.forum import sudokuviews
from app.forum import accel
from pathlib import Path
# настраиваем пути, которые будут вести к нашей странице

def setup_routes(app):
    app.router.add_get("/images", views.index)
    app.router.add_get('/list', views.get_list)
    app.router.add_get('/preview', views.preview)
    app.router.add_get('/gpng', views.gpng)
    app.router.add_get('/', views.menu)
    app.router.add_get('/sudoku', sudokuviews.indexs)
    app.router.add_post('/api/generate', sudokuviews.generate_puzzle)
    app.router.add_post('/api/save', sudokuviews.save_progress)
    app.router.add_post('/api/check', sudokuviews.check_solution)
    app.router.add_static('/static/', Path('static'))
    app.router.add_post('/api/auto-fill-notes', sudokuviews.auto_fill_notes)
    app.router.add_get("/accel", accel.indexs)
