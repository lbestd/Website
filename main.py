import mimetypes
mimetypes.add_type('application/wasm', '.wasm')   # нужен для WebAssembly streaming

from aiohttp import web
import aiohttp_jinja2
import jinja2
from app.forum.auth import session_middleware, setup_audit_log


def read_credentials_from_file(file_path='credentials.txt'):
    """Читает креды из файла"""
    credentials = {}
    try:
        with open(file_path, 'r') as f:
            for line in f:
                if '=' in line:
                    key, value = line.strip().split('=', 1)
                    credentials[key] = value
    except FileNotFoundError:
        print(f"Файл {file_path} не найден")
    except Exception as e:
        print(f"Ошибка чтения файла: {e}")
    return credentials

###credentials.txt
#username=your_username
#password=your_password
#notes_dir=/path/to/notes
###

credentials = read_credentials_from_file('credentials.txt')
username = credentials.get('username', '')
password = credentials.get('password', '')
notes_dir = credentials.get('notes_dir', '')
log_file = credentials.get('log_file', '')

if log_file:
    setup_audit_log(log_file)



from PIL import Image
# настроим url-пути для доступа к нашему будущему приложению
def setup_routes(application):
    from app.forum.routes import setup_routes as setup_forum_routes

    setup_forum_routes(application)
def setup_external_libraries(application: web.Application) -> None:
    aiohttp_jinja2.setup(application,
         loader=jinja2.FileSystemLoader("templates")
    )
def setup_app(application):
    setup_external_libraries(application)
    setup_routes(application)
    print('app setup succeed')

async def my_web_app():
    app = web.Application(middlewares=[session_middleware])
    setup_app(app)
    app['notes_dir'] = notes_dir
    app['log_file'] = log_file
    app['auth_username'] = username
    app['auth_password'] = password
    app['auth_secure_cookies'] = True  # reverse proxy с TLS
    return app


# эта строка пригодится нам в будущем
if __name__ == "__main__":
    print('ok')
    web.run_app(my_web_app(), port=8080) # запускаем наше приложение
