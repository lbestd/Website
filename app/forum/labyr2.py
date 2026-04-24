from aiohttp import web
import aiohttp_jinja2

@aiohttp_jinja2.template('labyr2.html')
async def indexs(request):
    return {'title': 'Лабиринт с гироскопом'}