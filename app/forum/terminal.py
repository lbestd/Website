import asyncio
import fcntl
import json
import os
import pty
import struct
import termios

import aiohttp_jinja2
from aiohttp import web, WSMsgType


@aiohttp_jinja2.template('terminal.html')
async def index(request):
    return {'title': 'Терминал'}


async def ws_terminal(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    loop = asyncio.get_event_loop()
    master_fd, slave_fd = pty.openpty()

    env = os.environ.copy()
    env['TERM'] = 'xterm-256color'
    env['COLORTERM'] = 'truecolor'

    def preexec():
        os.setsid()
        fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)

    proc = await asyncio.create_subprocess_exec(
        '/bin/bash', '-l',
        stdin=slave_fd,
        stdout=slave_fd,
        stderr=slave_fd,
        preexec_fn=preexec,
        env=env,
    )
    os.close(slave_fd)

    # Initial terminal size
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))

    output_queue: asyncio.Queue = asyncio.Queue()

    def _on_pty_read():
        try:
            data = os.read(master_fd, 65536)
            output_queue.put_nowait(data)
        except OSError:
            output_queue.put_nowait(None)

    loop.add_reader(master_fd, _on_pty_read)

    async def _forward():
        while True:
            data = await output_queue.get()
            if data is None:
                try:
                    await ws.send_str('\r\n\x1b[33m[процесс завершён]\x1b[0m\r\n')
                    await ws.close()
                except Exception:
                    pass
                break
            try:
                await ws.send_bytes(data)
            except Exception:
                break

    forward_task = asyncio.create_task(_forward())

    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    ctrl = json.loads(msg.data)
                    if ctrl.get('type') == 'resize':
                        cols = max(1, int(ctrl.get('cols', 80)))
                        rows = max(1, int(ctrl.get('rows', 24)))
                        fcntl.ioctl(master_fd, termios.TIOCSWINSZ,
                                    struct.pack('HHHH', rows, cols, 0, 0))
                except (json.JSONDecodeError, ValueError):
                    try:
                        os.write(master_fd, msg.data.encode())
                    except OSError:
                        break
            elif msg.type == WSMsgType.BINARY:
                try:
                    os.write(master_fd, msg.data)
                except OSError:
                    break
            elif msg.type in (WSMsgType.ERROR, WSMsgType.CLOSE):
                break
    finally:
        loop.remove_reader(master_fd)
        forward_task.cancel()
        try:
            proc.kill()
        except ProcessLookupError:
            pass
        await proc.wait()
        try:
            os.close(master_fd)
        except OSError:
            pass

    return ws
