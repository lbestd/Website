import hmac
import logging
import secrets
import time
from urllib.parse import quote, urlparse

import aiohttp_jinja2
from aiohttp import web

# ── Audit log ─────────────────────────────────────────────────────────────────
_audit = logging.getLogger('audit')


def setup_audit_log(log_file: str) -> None:
    """Call once at startup with the path to the log file."""
    handler = logging.FileHandler(log_file, encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(message)s', datefmt='%Y-%m-%dT%H:%M:%S'))
    _audit.addHandler(handler)
    _audit.setLevel(logging.INFO)
    _audit.propagate = False


def _log(event: str, ip: str, **kw) -> None:
    parts = [f'event={event}', f'ip={ip}']
    parts += [f'{k}={v}' for k, v in kw.items()]
    _audit.info(' '.join(parts))

SESSION_COOKIE = 'sid'
SESSION_DURATION = 7 * 24 * 3600  # 7 days

MAX_ATTEMPTS = 5
BLOCK_SECONDS = 300  # 5 minutes

PUBLIC_PATHS = frozenset({
    '/', '/sudoku',
    '/api/generate', '/api/save', '/api/check', '/api/auto-fill-notes',
    '/x/in', '/x/out',
    '/game', '/game/rs',
    '/tetris', '/minesweeper',
})

# ── In-memory stores ───────────────────────────────────────────────────────────
_sessions: dict = {}    # token -> {username, expires}
_rate_limit: dict = {}  # ip   -> {count, window_start, blocked_until}


# ── IP helper ─────────────────────────────────────────────────────────────────
def _client_ip(request: web.Request) -> str:
    xff = request.headers.get('X-Forwarded-For', '')
    return xff.split(',')[0].strip() if xff else (request.remote or '')


# ── Rate limiting ─────────────────────────────────────────────────────────────
def _is_rate_limited(ip: str) -> bool:
    st = _rate_limit.get(ip)
    return bool(st and st.get('blocked_until', 0) > time.monotonic())


def _record_failure(ip: str) -> None:
    now = time.monotonic()
    st = _rate_limit.setdefault(ip, {'count': 0, 'window_start': now, 'blocked_until': 0})
    if now - st['window_start'] > 600:
        st['count'] = 0
        st['window_start'] = now
    st['count'] += 1
    if st['count'] >= MAX_ATTEMPTS:
        st['blocked_until'] = now + BLOCK_SECONDS
        st['count'] = 0


def _clear_rate_limit(ip: str) -> None:
    _rate_limit.pop(ip, None)


# ── Session helpers ────────────────────────────────────────────────────────────
def _create_session(username: str) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = {'username': username, 'expires': time.time() + SESSION_DURATION}
    return token


def _lookup_session(token: str) -> dict | None:
    if not token:
        return None
    sess = _sessions.get(token)
    if sess is None:
        return None
    if sess['expires'] < time.time():
        del _sessions[token]
        return None
    return sess


def _delete_session(token: str) -> None:
    _sessions.pop(token, None)


def is_authenticated(request: web.Request) -> bool:
    return _lookup_session(request.cookies.get(SESSION_COOKIE)) is not None


def _set_cookie(response: web.Response, token: str, secure: bool) -> None:
    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_DURATION,
        httponly=True,
        samesite='Lax',
        path='/',
        secure=secure,
    )


def _clear_cookie(response: web.Response) -> None:
    response.del_cookie(SESSION_COOKIE, path='/')


# ── Middleware ─────────────────────────────────────────────────────────────────
@web.middleware
async def session_middleware(request: web.Request, handler):
    if request.path.startswith('/static/') and not request.path.startswith('/static/drawio/'):
        return await handler(request)
    if request.path.startswith('/game/pkg/'):
        return await handler(request)
    if request.path.startswith('/static/drawio/') and not is_authenticated(request):
        raise web.HTTPForbidden()

    ip = _client_ip(request)
    authed = is_authenticated(request)

    if request.path not in PUBLIC_PATHS and not request.path.startswith('/share') and not authed:
        next_path = quote(request.path, safe='')
        _log('REQUEST', ip, method=request.method, path=request.path, status=302, auth='no')
        raise web.HTTPFound(f'/x/in?next={next_path}')

    try:
        response = await handler(request)
        _log('REQUEST', ip, method=request.method, path=request.path,
             status=response.status, auth='yes' if authed else 'no')
        return response
    except web.HTTPException as exc:
        _log('REQUEST', ip, method=request.method, path=request.path,
             status=exc.status, auth='yes' if authed else 'no')
        raise


# ── Redirect helper ────────────────────────────────────────────────────────────
def _safe_next(url: str) -> str:
    """Accept only same-origin relative paths."""
    if not url:
        return '/'
    parsed = urlparse(url)
    if parsed.scheme or parsed.netloc:
        return '/'
    return url if url.startswith('/') else '/'


# ── Handlers ──────────────────────────────────────────────────────────────────
async def login_get(request: web.Request) -> web.Response:
    if is_authenticated(request):
        return web.HTTPFound(_safe_next(request.query.get('next', '/')))
    next_url = _safe_next(request.query.get('next', '/'))
    return aiohttp_jinja2.render_template('login.html', request, {'next': next_url, 'error': ''})


async def login_post(request: web.Request) -> web.Response:
    ip = _client_ip(request)
    data = await request.post()
    username_in = data.get('username', '').strip()
    password_in = data.get('password', '')
    next_url = _safe_next(data.get('next', '/'))

    if _is_rate_limited(ip):
        _log('RATE_LIMITED', ip, user=username_in or '-')
        return aiohttp_jinja2.render_template(
            'login.html', request,
            {'next': next_url, 'error': 'Слишком много попыток. Подождите несколько минут.'},
            status=429,
        )

    valid_user = request.app['auth_username']
    valid_pass = request.app['auth_password']
    # Secure-куки нужны только если реально HTTPS.
    # Если configured=True, но запрос пришёл по http:// (напрямую, не через прокси) —
    # отключаем Secure, иначе браузер не сохранит cookie по HTTP.
    if request.app.get('auth_secure_cookies', True):
        proto = request.headers.get('X-Forwarded-Proto', request.scheme)
        secure = (proto == 'https')
    else:
        secure = False

    user_ok = hmac.compare_digest(username_in.encode(), valid_user.encode())
    pass_ok = hmac.compare_digest(password_in.encode(), valid_pass.encode())

    if user_ok and pass_ok:
        _clear_rate_limit(ip)
        token = _create_session(username_in)
        _log('LOGIN_OK', ip, user=username_in)
        response = web.HTTPFound(next_url)
        _set_cookie(response, token, secure)
        return response

    _record_failure(ip)
    _log('LOGIN_FAIL', ip, user=username_in or '-')
    return aiohttp_jinja2.render_template(
        'login.html', request,
        {'next': next_url, 'error': 'Неверное имя пользователя или пароль.'},
        status=401,
    )


async def logout(request: web.Request) -> web.Response:
    ip = _client_ip(request)
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        sess = _lookup_session(token)
        _log('LOGOUT', ip, user=sess['username'] if sess else '-')
        _delete_session(token)
    response = web.HTTPFound('/x/in')
    _clear_cookie(response)
    return response
