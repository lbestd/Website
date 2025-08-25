from aiohttp import web
import aiohttp_jinja2
import json
import numpy as np
import random
from typing import Dict, List, Optional
import asyncio


class SudokuGenerator:
    def __init__(self):
        self.size = 9
        self.grid = np.zeros((self.size, self.size), dtype=int)

    def is_valid(self, grid: np.ndarray, row: int, col: int, num: int) -> bool:
        # Check row
        if num in grid[row, :]:
            return False

        # Check column
        if num in grid[:, col]:
            return False

        # Check 3x3 box
        start_row, start_col = 3 * (row // 3), 3 * (col // 3)
        if num in grid[start_row:start_row + 3, start_col:start_col + 3]:
            return False

        return True

    def solve(self, grid: np.ndarray) -> bool:
        # Создаем копию для решения
        temp_grid = grid.copy()

        for row in range(self.size):
            for col in range(self.size):
                if temp_grid[row, col] == 0:
                    numbers = list(range(1, 10))
                    random.shuffle(numbers)  # Перемешиваем для разнообразия

                    for num in numbers:
                        if self.is_valid(temp_grid, row, col, num):
                            temp_grid[row, col] = num
                            if self.solve(temp_grid):
                                grid[:] = temp_grid  # Копируем решение
                                return True
                            temp_grid[row, col] = 0
                    return False
        return True

    def generate(self, difficulty: str = 'medium') -> np.ndarray:
        # Создаем полностью пустую сетку
        empty_grid = np.zeros((self.size, self.size), dtype=int)

        # Генерируем случайное решение с перемешанными числами
        temp_grid = empty_grid.copy()
        numbers_list = list(range(1, 10))

        # Быстрая генерация через backtracking с перемешиванием
        def quick_solve(grid):
            for row in range(9):
                for col in range(9):
                    if grid[row, col] == 0:
                        random.shuffle(numbers_list)
                        for num in numbers_list:
                            if self.is_valid(grid, row, col, num):
                                grid[row, col] = num
                                if quick_solve(grid):
                                    return True
                                grid[row, col] = 0
                        return False
            return True

        # Генерируем решение
        if not quick_solve(temp_grid):
            raise ValueError("Не удалось сгенерировать решение")

        self.grid = temp_grid.copy()

        # Создаем головоломку
        puzzle = self.grid.copy()

        # Количество ячеек для удаления
        difficulties = {
            'easy': 30,
            'medium': 40,
            'hard': 50,
            'expert': 55
        }
        cells_to_remove = difficulties.get(difficulty, 40)

        # Быстрое удаление ячеек без проверки уникальности (для скорости)
        cells = [(i, j) for i in range(9) for j in range(9)]
        random.shuffle(cells)

        for i, j in cells[:cells_to_remove]:
            puzzle[i, j] = 0

        return puzzle

    def count_solutions(self, grid: np.ndarray, solutions: list, max_solutions: int = 2) -> None:
        """Считает количество решений (ограничено max_solutions для производительности)"""
        if len(solutions) >= max_solutions:
            return

        for row in range(9):
            for col in range(9):
                if grid[row, col] == 0:
                    for num in range(1, 10):
                        if self.is_valid(grid, row, col, num):
                            grid[row, col] = num
                            self.count_solutions(grid, solutions, max_solutions)
                            grid[row, col] = 0
                            if len(solutions) >= max_solutions:
                                return
                    return

        # Если дошли сюда, нашли решение
        solutions.append(grid.copy())
        return


class SudokuGame:
    def __init__(self):
        self.generator = SudokuGenerator()
        self.sessions: Dict[str, Dict] = {}

    def generate_puzzle(self, session_id: str, difficulty: str = 'medium') -> Dict:
        puzzle = self.generator.generate(difficulty)

        game_state = {
            'puzzle': puzzle.tolist(),
            'solution': self.generator.grid.copy().tolist(),
            'user_input': [[0 for _ in range(9)] for _ in range(9)],
            'notes': [[[] for _ in range(9)] for _ in range(9)],
            'difficulty': difficulty,
            'start_time': asyncio.get_event_loop().time(),
            'completed': False
        }

        self.sessions[session_id] = game_state
        return game_state

    def save_progress(self, session_id: str, user_input: List[List[int]], notes: List[List[List[int]]]) -> None:
        if session_id in self.sessions:
            self.sessions[session_id]['user_input'] = user_input
            self.sessions[session_id]['notes'] = notes

    def get_game_state(self, session_id: str) -> Optional[Dict]:
        return self.sessions.get(session_id)

    def check_solution(self, session_id: str) -> bool:
        if session_id not in self.sessions:
            return False

        game_state = self.sessions[session_id]

        # Проверяем каждую ячейку отдельно
        for i in range(9):
            for j in range(9):
                user_value = game_state['user_input'][i][j]
                solution_value = game_state['solution'][i][j]

                # Если это не фиксированная ячейка и пользователь ввел значение
                if game_state['puzzle'][i][j] == 0 and user_value != 0:
                    if user_value != solution_value:
                        return False

        return True

    def validate_cell(self, session_id: str, row: int, col: int) -> bool:
        """Проверяет корректность отдельной ячейки"""
        if session_id not in self.sessions:
            return False

        game_state = self.sessions[session_id]
        user_value = game_state['user_input'][row][col]
        solution_value = game_state['solution'][row][col]

        return user_value == solution_value

    def get_possible_numbers(self, session_id: str, row: int, col: int) -> List[int]:
        """Возвращает возможные числа для ячейки"""
        if session_id not in self.sessions:
            return []

        game_state = self.sessions[session_id]
        current_grid = np.array(game_state['puzzle'])
        user_input = np.array(game_state['user_input'])

        # Объединяем исходную головоломку и пользовательский ввод
        full_grid = np.where(current_grid != 0, current_grid, user_input)

        possible_numbers = []

        for num in range(1, 10):
            if self._is_number_possible(full_grid, row, col, num):
                possible_numbers.append(num)

        return possible_numbers

    def _is_number_possible(self, grid: np.ndarray, row: int, col: int, num: int) -> bool:
        """Проверяет, можно ли поставить число в ячейку"""
        # Проверяем строку
        if num in grid[row, :]:
            return False

        # Проверяем столбец
        if num in grid[:, col]:
            return False

        # Проверяем блок 3x3
        start_row, start_col = 3 * (row // 3), 3 * (col // 3)
        if num in grid[start_row:start_row + 3, start_col:start_col + 3]:
            return False

        return True

    def auto_fill_notes(self, session_id: str) -> List[List[List[int]]]:
        """Автоматически заполняет заметки для всех пустых ячеек"""
        if session_id not in self.sessions:
            return []

        game_state = self.sessions[session_id]
        new_notes = [[[] for _ in range(9)] for _ in range(9)]

        for row in range(9):
            for col in range(9):
                if game_state['puzzle'][row][col] == 0 and game_state['user_input'][row][col] == 0:
                    possible_numbers = self.get_possible_numbers(session_id, row, col)
                    new_notes[row][col] = possible_numbers

        return new_notes

    def get_smart_notes(self, session_id: str) -> Dict:
        """Возвращает умные заметки (только возможные числа)"""
        if session_id not in self.sessions:
            return {'notes': [], 'impossible_counts': {}}

        game_state = self.sessions[session_id]
        smart_notes = [[[] for _ in range(9)] for _ in range(9)]
        impossible_counts = {}

        for row in range(9):
            for col in range(9):
                if game_state['puzzle'][row][col] == 0 and game_state['user_input'][row][col] == 0:
                    possible_numbers = self.get_possible_numbers(session_id, row, col)
                    smart_notes[row][col] = possible_numbers

                    # Считаем невозможные числа
                    impossible_numbers = [num for num in range(1, 10) if num not in possible_numbers]
                    if impossible_numbers:
                        impossible_counts[f"{row}-{col}"] = impossible_numbers

        return {
            'notes': smart_notes,
            'impossible_counts': impossible_counts
        }

    def update_notes_after_input(self, session_id: str, row: int, col: int, number: int) -> None:
        """Обновляет заметки после установки числа - удаляет это число из заметок в той же строке, столбце и блоке"""
        if session_id not in self.sessions:
            return

        game_state = self.sessions[session_id]

        # Удаляем число из заметок в той же строке
        for c in range(9):
            if c != col and number in game_state['notes'][row][c]:
                game_state['notes'][row][c].remove(number)

        # Удаляем число из заметок в том же столбце
        for r in range(9):
            if r != row and number in game_state['notes'][r][col]:
                game_state['notes'][r][col].remove(number)

        # Удаляем число из заметок в том же блоке 3x3
        start_row, start_col = 3 * (row // 3), 3 * (col // 3)
        for r in range(start_row, start_row + 3):
            for c in range(start_col, start_col + 3):
                if r != row and c != col and number in game_state['notes'][r][c]:
                    game_state['notes'][r][c].remove(number)

    def set_cell_value(self, session_id: str, row: int, col: int, value: int) -> None:
        """Устанавливает значение ячейки и обновляет заметки"""
        if session_id not in self.sessions:
            return

        game_state = self.sessions[session_id]
        game_state['user_input'][row][col] = value

        # Если установлено число (не 0), обновляем заметки
        if value != 0:
            game_state['notes'][row][col] = []  # Очищаем заметки в этой ячейке
            self.update_notes_after_input(session_id, row, col, value)

game_manager = SudokuGame()



@aiohttp_jinja2.template('sudoku.html')
async def indexs(request):
    return {}


async def generate_puzzle(request):
    data = await request.json()
    difficulty = data.get('difficulty', 'medium')
    session_id = request.cookies.get('session_id') or _generate_session_id()

    game_state = game_manager.generate_puzzle(session_id, difficulty)

    response = web.json_response({
        'puzzle': game_state['puzzle'],
        'user_input': game_state['user_input'],
        'notes': game_state['notes'],
        'session_id': session_id
    })

    response.set_cookie('session_id', session_id)
    return response


async def save_progress(request):
    data = await request.json()
    session_id = data.get('session_id')
    user_input = data.get('user_input', [])
    notes = data.get('notes', [])

    if session_id:
        # Обновляем user_input через метод set_cell_value для автоматического обновления заметок
        game_state = game_manager.get_game_state(session_id)
        if game_state:
            # Сначала сохраняем notes
            game_state['notes'] = notes

            # Затем обновляем user_input с проверкой изменений
            for row in range(9):
                for col in range(9):
                    new_value = user_input[row][col]
                    old_value = game_state['user_input'][row][col]

                    if new_value != old_value and new_value != 0:
                        game_manager.set_cell_value(session_id, row, col, new_value)
                    else:
                        game_state['user_input'][row][col] = new_value

    return web.json_response({'status': 'success'})


async def generate_puzzle(request):
    data = await request.json()
    difficulty = data.get('difficulty', 'medium')
    session_id = request.cookies.get('session_id') or _generate_session_id()

    # Очищаем старую сессию если она есть
    if session_id in game_manager.sessions:
        del game_manager.sessions[session_id]

    game_state = game_manager.generate_puzzle(session_id, difficulty)

    response = web.json_response({
        'puzzle': game_state['puzzle'],
        'user_input': game_state['user_input'],
        'notes': game_state['notes'],
        'session_id': session_id
    })

    response.set_cookie('session_id', session_id, max_age=3600 * 24 * 7)  # 1 неделя
    return response

async def check_solution(request):
    data = await request.json()
    session_id = data.get('session_id')

    if not session_id:
        return web.json_response({'status': 'error', 'message': 'Сессия не найдена'})

    try:
        if game_manager.check_solution(session_id):
            return web.json_response({
                'status': 'correct',
                'message': '🎉 Поздравляем! Решение верное!'
            })
        else:
            # Получаем детальную информацию об ошибках
            game_state = game_manager.get_game_state(session_id)
            error_cells = []

            if game_state:
                for i in range(9):
                    for j in range(9):
                        if game_state['puzzle'][i][j] == 0:  # Только нефиксированные ячейки
                            user_value = game_state['user_input'][i][j]
                            solution_value = game_state['solution'][i][j]

                            if user_value != 0 and user_value != solution_value:
                                error_cells.append({'row': i, 'col': j, 'user': user_value, 'correct': solution_value})

            return web.json_response({
                'status': 'incorrect',
                'message': f'Найдено {len(error_cells)} ошибок. Попробуйте еще раз.',
                'errors': error_cells
            })

    except Exception as e:
        return web.json_response({
            'status': 'error',
            'message': f'Ошибка проверки: {str(e)}'
        })

async def auto_fill_notes(request):
    """Новый эндпоинт для автозаполнения заметок"""
    data = await request.json()
    session_id = data.get('session_id')

    if not session_id:
        return web.json_response({'status': 'error', 'message': 'Сессия не найдена'})

    try:
        # Получаем умные заметки
        smart_notes_data = game_manager.get_smart_notes(session_id)
        new_notes = smart_notes_data['notes']

        # Обновляем заметки в сессии
        game_state = game_manager.get_game_state(session_id)
        if game_state:
            game_state['notes'] = new_notes

        return web.json_response({
            'status': 'success',
            'notes': new_notes,
            'impossible_counts': smart_notes_data['impossible_counts']
        })

    except Exception as e:
        return web.json_response({'status': 'error', 'message': str(e)})

def _generate_session_id():
    return ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=16))