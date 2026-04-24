from aiohttp import web
import aiohttp_jinja2

@aiohttp_jinja2.template('fitness.html')
async def indexs(request):
    return {}