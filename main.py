from aiohttp import web
import aiohttp_jinja2
import jinja2
from app.forum.auth import session_middleware, setup_audit_log
from app.forum.views import gallery_cache_worker, preview_cache_worker


def read_credentials(file_path='credentials.txt'):
    result = {}
    try:
        with open(file_path, 'r') as f:
            for line in f:
                if '=' in line:
                    key, value = line.strip().split('=', 1)
                    result[key] = value
    except FileNotFoundError:
        print(f"Файл {file_path} не найден")
    except Exception as e:
        print(f"Ошибка чтения файла: {e}")
    return result


def setup_routes(application):
    from app.forum.routes import setup_routes as setup_forum_routes
    setup_forum_routes(application)

def setup_external_libraries(application: web.Application) -> None:
    aiohttp_jinja2.setup(application, loader=jinja2.FileSystemLoader("templates"))

def setup_app(application):
    setup_external_libraries(application)
    setup_routes(application)
    print('app setup succeed')

async def my_web_app():
    credentials = read_credentials('credentials.txt')

    log_file = credentials.get('log_file', '')
    if log_file:
        setup_audit_log(log_file)

    app = web.Application(middlewares=[session_middleware])
    setup_app(app)

    app['auth_username'] = credentials.get('username', '')
    app['auth_password'] = credentials.get('password', '')
    app['auth_secure_cookies'] = True
    app['notes_dir'] = credentials.get('notes_dir', '')

    async def start_workers(a):
        import asyncio
        asyncio.ensure_future(gallery_cache_worker())
        asyncio.ensure_future(preview_cache_worker())

    app.on_startup.append(start_workers)

    return app


if __name__ == "__main__":
    web.run_app(my_web_app())