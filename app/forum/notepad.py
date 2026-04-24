import aiohttp_jinja2
from aiohttp import web
import aiofiles
import os
import asyncio
from pathlib import Path


def _notes_dir(request):
    return request.app.get('notes_dir', '')


def _safe_path(notes_dir: str, filename: str):
    """Resolve path and ensure it stays within notes_dir. Only .md/.txt allowed."""
    if not notes_dir or not filename:
        return None
    base = Path(notes_dir).resolve()
    target = (base / filename).resolve()
    # Prevent path traversal
    try:
        target.relative_to(base)
    except ValueError:
        return None
    if target.suffix.lower() not in ('.md', '.txt', '.py', '.log', '.puml', '.drawio'):
        return None
    return target


@aiohttp_jinja2.template("notepad.html")
async def index(request):
    nd = _notes_dir(request)
    files = []
    if nd and os.path.isdir(nd):
        for root, dirs, filenames in os.walk(nd):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
            for fname in sorted(filenames):
                if fname.lower().endswith(('.md', '.txt', '.py', '.log', '.puml', '.drawio')):
                    rel = os.path.relpath(os.path.join(root, fname), nd)
                    files.append(rel)
    return {'title': 'Блокнот', 'files': files, 'configured': bool(nd)}


async def api_get(request):
    nd = _notes_dir(request)
    path = request.query.get('path', '')
    target = _safe_path(nd, path)
    if target is None:
        return web.Response(status=400, text='invalid path')
    if not target.exists():
        return web.Response(status=404, text='not found')
    async with aiofiles.open(target, encoding='utf-8') as f:
        content = await f.read()
    mtime = target.stat().st_mtime
    return web.json_response({'content': content, 'mtime': mtime})


async def api_save(request):
    nd = _notes_dir(request)
    data = await request.json()
    path = data.get('path', '')
    content = data.get('content', '')
    target = _safe_path(nd, path)
    if target is None:
        return web.Response(status=403, text='forbidden')
    target.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(target, 'w', encoding='utf-8') as f:
        await f.write(content)
    mtime = target.stat().st_mtime
    return web.json_response({'ok': True, 'mtime': mtime})


async def api_mtime(request):
    """Lightweight endpoint — returns only mtime for polling."""
    nd = _notes_dir(request)
    path = request.query.get('path', '')
    target = _safe_path(nd, path)
    if target is None or not target.exists():
        return web.Response(status=404)
    return web.json_response({'mtime': target.stat().st_mtime})


async def ws_watch(request):
    """WebSocket endpoint: polls file mtime every 2s, sends update when changed."""
    nd = _notes_dir(request)
    path = request.query.get('path', '')

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    target = _safe_path(nd, path)
    if target is None:
        await ws.close()
        return ws

    try:
        last_mtime = target.stat().st_mtime if target.exists() else None
    except Exception:
        last_mtime = None

    try:
        while not ws.closed:
            await asyncio.sleep(2)
            try:
                current_mtime = target.stat().st_mtime
                if last_mtime is not None and current_mtime != last_mtime:
                    last_mtime = current_mtime
                    async with aiofiles.open(target, encoding='utf-8') as f:
                        content = await f.read()
                    await ws.send_json({'type': 'update', 'content': content, 'mtime': current_mtime})
                elif last_mtime is None:
                    last_mtime = current_mtime
            except FileNotFoundError:
                await ws.send_json({'type': 'deleted'})
                break
            except Exception:
                break
    except Exception:
        pass

    return ws
