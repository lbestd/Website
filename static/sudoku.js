class SudokuGame {
    constructor() {
        this.grid = [];
        this.userInput = [];
        this.notes = [];
        this.selectedCell = null;
        this.notesMode = false;
        this.sessionId = null;
        this.impossibleNumbers = {};
        this.autoNotesMode = false;
        this.numberCounts = {};
        this.selectedNumber = null;
        this.init();
    }

    async init() {
        await this.loadGame();

        this.createGrid();
        this.createNumberCounter();
        this.setupEventListeners();
        this.autoSave();
        this.updateNumberCounter();
    }

    async loadGame() {
        try {
            const saved = localStorage.getItem('sudoku_game');
            if (saved) {
                const data = JSON.parse(saved);
                this.grid = data.grid;
                this.userInput = data.userInput;
                this.notes = data.notes;
                this.sessionId = data.sessionId;
                this.impossibleNumbers = data.impossibleNumbers || {};
                this.selectedNumber = data.selectedNumber || null;
                return;
            }
        } catch (e) {
            console.log('No saved game found');
        }

        await this.newGame();
    }

    async newGame() {
        const difficulty = document.getElementById('difficulty').value;
        
        try {
            this.showStatus('Загрузка новой игры...', 'loading');
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ difficulty })
            });

            const data = await response.json();
            
            this.grid = data.puzzle;
            this.userInput = this.createEmptyGrid();
            this.notes = this.createEmptyNotes();
            this.sessionId = data.session_id;
            this.impossibleNumbers = {};
            this.autoNotesMode = false;
            this.selectedCell = null;
            this.selectedNumber = null;
            
            this.updateGrid();
            this.updateNumberSelection();
            this.clearStatus();
            document.body.classList.remove('auto-notes-mode');
            document.getElementById('auto-fill-notes').classList.remove('active');
            
        } catch (error) {
            console.error('Error generating new game:', error);
            this.showStatus('Ошибка загрузки игры', 'error');
        }
    }

    createEmptyGrid() {
        return Array(9).fill().map(() => Array(9).fill(0));
    }

    createEmptyNotes() {
        return Array(9).fill().map(() => Array(9).fill().map(() => []));
    }



    handleNumberSelect(number) {


        if (this.selectedNumber === number) {
            this.selectedNumber = null;
            this.updateNumberSelection();
            this.updateGrid();
            return;
        }
        
        this.selectedNumber = number;
        this.updateNumberSelection();
        
        if (this.selectedCell) {
            const { row, col } = this.selectedCell;
            
            if (this.notesMode) {
                this.toggleNote(row, col, number);
            } else {
                this.setCellValue(row, col, number);
            }
            
            this.updateGrid();
            this.saveProgress();
        } else {
            this.updateGrid();
        }
    }

    updateNumberSelection() {

        const counterItems = document.querySelectorAll('.counter-item');
        counterItems.forEach(item => {
            item.classList.remove('selected');
            const itemNumber = parseInt(item.dataset.number);
            
            if (itemNumber === this.selectedNumber) {
                item.classList.add('selected');
            }
        });
    }

    createGrid() {
        const gridElement = document.getElementById('sudoku-grid');
        gridElement.innerHTML = '';

        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.row = row;
                cell.dataset.col = col;

                if (col % 3 === 2 && col < 8) {
                    cell.classList.add('border-right-3');
                }
                if (row % 3 === 2 && row < 8) {
                    cell.classList.add('border-bottom-3');
                }

                cell.addEventListener('click', () => this.selectCell(row, col, cell));
                gridElement.appendChild(cell);
            }
        }

        this.updateGrid();
    }

    selectCell(row, col, cell) {
        if (this.grid[row][col] !== 0) {
            const number = this.grid[row][col];
            this.selectedNumber = number;
            this.updateNumberSelection();
        } else if (this.userInput[row][col] !== 0) {
            const number = this.userInput[row][col];
            this.selectedNumber = number;
            this.updateNumberSelection();
        }
        this.selectedCell = { row, col };
        this.selectedCellClass = cell.classList;
        this.updateGrid();
    }

    updateGrid() {
        const cells = document.querySelectorAll('.cell');
        const selectedNumber = this.selectedNumber;
        
        cells.forEach(cell => {
            cell.className = 'cell';
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            
            if (col % 3 === 2 && col < 8) {
                cell.classList.add('border-right-3');
            }
            if (row % 3 === 2 && row < 8) {
                cell.classList.add('border-bottom-3');
            }
        });
        
        this.updateNumberCounter();
        
        cells.forEach(cell => {
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.col);
            
            cell.innerHTML = '';
            
            const gridValue = this.grid[row][col];
            const userValue = this.userInput[row][col];
            const hasValue = gridValue !== 0 || userValue !== 0;
            const cellValue = hasValue ? (gridValue !== 0 ? gridValue : userValue) : null;
            
            if (gridValue !== 0) {
                cell.classList.add('fixed');
                cell.textContent = gridValue;
            } else if (userValue !== 0) {
                cell.classList.add('user-input');
                cell.textContent = userValue;
            } else if (this.notes[row][col] && this.notes[row][col].length > 0) {
                this.renderNotes(cell, row, col);
            }
            
            if (selectedNumber) {
                if (cellValue === selectedNumber) {
                    cell.classList.add('same-number');
                }
                
                if (gridValue === 0 && userValue === 0 && 
                    this.notes[row][col] && this.notes[row][col].includes(selectedNumber)) {
                    cell.classList.add('same-note');
                }
            }
            
            if (this.selectedCell) {
                const isSameRow = row === this.selectedCell.row;
                const isSameCol = col === this.selectedCell.col;
                const isSameBlock = 
                    Math.floor(row / 3) === Math.floor(this.selectedCell.row / 3) &&
                    Math.floor(col / 3) === Math.floor(this.selectedCell.col / 3);

                if (isSameRow || isSameCol || isSameBlock) {
                    cell.classList.add('highlighted');
                }
            }
            if (this.selectedCell && this.selectedCell.row === row && this.selectedCell.col === col) {

                cell.classList.add('selected');
            }
            
            const isHighlighted = cell.classList.contains('same-number') || 
                                 cell.classList.contains('selected') || 
                                 cell.classList.contains('highlighted');
            
            if (hasValue && !isHighlighted) {
                cell.classList.add('occupied');
            }
        });
    }

    renderNotes(cell, row, col) {
        const notesContainer = document.createElement('div');
        notesContainer.className = 'notes';
        
        const cellKey = `${row}-${col}`;
        const impossibleForCell = this.impossibleNumbers[cellKey] || [];
        
        for (let num = 1; num <= 9; num++) {
            const note = document.createElement('div');
            note.className = 'note-number';
            
            if (this.notes[row][col].includes(num)) {
                note.textContent = num;
                
                if (impossibleForCell.includes(num)) {
                    note.classList.add('impossible');
                }
            } else {
                note.textContent = '';
            }
            
            notesContainer.appendChild(note);
        }
        
        cell.appendChild(notesContainer);
    }
    createNumberCounter() {

        const counterContainer = document.createElement('div');
        counterContainer.className = 'numbers-counter';

        for (let num = 1; num <= 9; num++) {
            const counterItem = document.createElement('div');
            counterItem.className = 'counter-item';
            counterItem.dataset.number = num;

            const numberEl = document.createElement('div');
            numberEl.className = 'counter-number';
            numberEl.textContent = num;

            const countEl = document.createElement('div');
            countEl.className = 'counter-count';
            countEl.textContent = '9';

            counterItem.appendChild(numberEl);
            counterItem.appendChild(countEl);

            counterItem.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleNumberSelect(num);
            });

            counterItem.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                this.handleNumberSelect(num);
            }, { passive: true });

            counterContainer.appendChild(counterItem);
        }

        const gameContainer = document.querySelector('.status');
        console.log(document)
        if (gameContainer) {
            gameContainer.parentNode.insertBefore(counterContainer, gameContainer);
        }
    }
    updateNumberCounter() {
        const counts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0};
        const totalNeeded = 9;
        
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                const value = this.userInput[row][col] || this.grid[row][col];
                if (value !== 0 && counts[value] !== undefined) {
                    counts[value]++;
                }
            }
        }
        
        this.numberCounts = counts;
        
        for (let num = 1; num <= 9; num++) {
            const count = counts[num] || 0;
            const remaining = totalNeeded - count;
            const element = document.querySelector(`.counter-item[data-number="${num}"]`);
            
            if (element) {
                const numberEl = element.querySelector('.counter-number');
                const countEl = element.querySelector('.counter-count');
                
                if (numberEl) numberEl.textContent = num;
                if (countEl) countEl.textContent = remaining;
                
                if (remaining === 0) {
                    element.classList.add('completed');
                } else {
                    element.classList.remove('completed');
                }
            }
        }
    }

    setCellValue(row, col, value) {
        const cellKey = `${row}-${col}`;
        const isImpossible = this.impossibleNumbers[cellKey] && this.impossibleNumbers[cellKey].includes(value);
        const isimpossible2 = this.selectedCellClass.contains('fixed')
        if (isImpossible || isimpossible2 ) {
            this.showStatus(`Число ${value} невозможно поставить в эту ячейку`, 'incorrect');
            return;
        }

        const oldValue = this.userInput[row][col];
        this.userInput[row][col] = value;
        this.notes[row][col] = [];
        
        if (value !== 0 && value !== oldValue) {
            this.removeNumberFromNotes(value, row, col);
        }
        
        this.updateGrid();
        this.saveProgress();
    }

    removeNumberFromNotes(number, sourceRow, sourceCol) {
        for (let col = 0; col < 9; col++) {
            if (col !== sourceCol && this.notes[sourceRow][col] && this.notes[sourceRow][col].includes(number)) {
                const index = this.notes[sourceRow][col].indexOf(number);
                if (index > -1) {
                    this.notes[sourceRow][col].splice(index, 1);
                }
            }
        }
        
        for (let row = 0; row < 9; row++) {
            if (row !== sourceRow && this.notes[row][sourceCol] && this.notes[row][sourceCol].includes(number)) {
                const index = this.notes[row][sourceCol].indexOf(number);
                if (index > -1) {
                    this.notes[row][sourceCol].splice(index, 1);
                }
            }
        }
        
        const startRow = Math.floor(sourceRow / 3) * 3;
        const startCol = Math.floor(sourceCol / 3) * 3;
        
        for (let row = startRow; row < startRow + 3; row++) {
            for (let col = startCol; col < startCol + 3; col++) {
                if ((row !== sourceRow || col !== sourceCol) && this.notes[row][col] && this.notes[row][col].includes(number)) {
                    const index = this.notes[row][col].indexOf(number);
                    if (index > -1) {
                        this.notes[row][col].splice(index, 1);
                    }
                }
            }
        }
    }

    toggleNote(row, col, number) {
        if (!this.notes[row][col]) {
            this.notes[row][col] = [];
        }

        const cellKey = `${row}-${col}`;
        const isImpossible = this.impossibleNumbers[cellKey] && this.impossibleNumbers[cellKey].includes(number);
        
        if (isImpossible) {
            this.showStatus(`Число ${number} невозможно поставить в эту ячейку`, 'incorrect');
            return;
        }

        const index = this.notes[row][col].indexOf(number);
        if (index > -1) {
            this.notes[row][col].splice(index, 1);
        } else {
            this.notes[row][col].push(number);
            this.notes[row][col].sort((a, b) => a - b);
        }
    }

    clearCell() {
        if (!this.selectedCell) return;

        const { row, col } = this.selectedCell;
        this.userInput[row][col] = 0;
        this.notes[row][col] = [];
        
        this.updateGrid();
        this.saveProgress();
    }

    async saveProgress() {
        try {
            await fetch('/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    user_input: this.userInput,
                    notes: this.notes
                })
            });

            localStorage.setItem('sudoku_game', JSON.stringify({
                grid: this.grid,
                userInput: this.userInput,
                notes: this.notes,
                sessionId: this.sessionId,
                impossibleNumbers: this.impossibleNumbers,
                selectedNumber: this.selectedNumber
            }));
        } catch (error) {
            console.error('Error saving progress:', error);
        }
    }

    async checkSolution() {
        try {
            const response = await fetch('/api/check', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ session_id: this.sessionId })
            });

            const result = await response.json();
            
            if (result.status === 'correct') {
                this.showStatus(result.message, 'correct');
                this.markAllCorrect();
            } else {
                this.showStatus(result.message, 'incorrect');
                
                if (result.errors) {
                    this.highlightErrors(result.errors);
                } else {
                    this.findAndHighlightErrors();
                }
            }
        } catch (error) {
            console.error('Error checking solution:', error);
            this.showStatus('Ошибка проверки решения', 'incorrect');
        }
    }

    findAndHighlightErrors() {
        const errors = [];
        
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.grid[row][col] === 0 && this.userInput[row][col] !== 0) {
                    for (let c = 0; c < 9; c++) {
                        if (c !== col) {
                            const otherValue = this.userInput[row][c] || this.grid[row][c];
                            if (otherValue === this.userInput[row][col]) {
                                errors.push({row, col});
                                break;
                            }
                        }
                    }
                    
                    for (let r = 0; r < 9; r++) {
                        if (r !== row) {
                            const otherValue = this.userInput[r][col] || this.grid[r][col];
                            if (otherValue === this.userInput[row][col]) {
                                errors.push({row, col});
                                break;
                            }
                        }
                    }
                    
                    const startRow = Math.floor(row / 3) * 3;
                    const startCol = Math.floor(col / 3) * 3;
                    
                    for (let r = startRow; r < startRow + 3; r++) {
                        for (let c = startCol; c < startCol + 3; c++) {
                            if (r !== row || c !== col) {
                                const otherValue = this.userInput[r][c] || this.grid[r][c];
                                if (otherValue === this.userInput[row][col]) {
                                    errors.push({row, col});
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        
        this.highlightErrors(errors);
    }

    highlightErrors(errors) {
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => {
            cell.classList.remove('error');
        });
        
        errors.forEach(error => {
            const cell = document.querySelector(`.cell[data-row="${error.row}"][data-col="${error.col}"]`);
            if (cell) {
                cell.classList.add('error');
            }
        });
    }

    markAllCorrect() {
        const cells = document.querySelectorAll('.cell.user-input');
        cells.forEach(cell => {
            cell.classList.remove('error');
        });
    }

    async autoFillNotes() {
        try {
            this.autoNotesMode = true;
            document.body.classList.add('auto-notes-mode');
            document.getElementById('auto-fill-notes').classList.add('active');
            
            const response = await fetch('/api/auto-fill-notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ session_id: this.sessionId })
            });

            const data = await response.json();
            
            if (data.status === 'success') {
                this.notes = data.notes;
                this.impossibleNumbers = data.impossible_counts;
                this.updateGrid();
                this.showNotesInfo();
                this.saveProgress();
                
                setTimeout(() => {
                    this.autoNotesMode = false;
                    document.body.classList.remove('auto-notes-mode');
                    document.getElementById('auto-fill-notes').classList.remove('active');
                    this.updateGrid();
                }, 10000);
            }
        } catch (error) {
            console.error('Error auto-filling notes:', error);
            this.autoNotesMode = false;
            document.body.classList.remove('auto-notes-mode');
            document.getElementById('auto-fill-notes').classList.remove('active');
        }
    }

    showNotesInfo() {
        const infoElement = document.getElementById('notes-info');
        const impossibleCount = Object.keys(this.impossibleNumbers).length;
        
        if (impossibleCount > 0) {
            infoElement.innerHTML = `Автозаметки заполнены. <span class="impossible">Убрано ${impossibleCount} невозможных чисел</span>`;
        } else {
            infoElement.innerHTML = 'Автозаметки заполнены. Все числа возможны.';
        }
        
        setTimeout(() => {
            infoElement.innerHTML = '';
        }, 5000);
    }

    showStatus(message, type) {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        
        if (type === 'loading') {
            return;
        }
        
        setTimeout(() => {
            this.clearStatus();
        }, 3000);
    }

    clearStatus() {
        const status = document.getElementById('status');
        status.textContent = '';
        status.className = 'status';
    }

    toggleNotesMode() {
        this.notesMode = !this.notesMode;
        const btn = document.getElementById('toggle-notes');
        btn.style.background = this.notesMode ? '#ff5722' : '#ff9800';
        btn.textContent = this.notesMode ? 'Режим цифр' : 'Режим заметок';
    }

    setupEventListeners() {
        document.getElementById('new-game').addEventListener('click', () => this.newGame());
        document.getElementById('check-solution').addEventListener('click', () => this.checkSolution());
        document.getElementById('toggle-notes').addEventListener('click', () => this.toggleNotesMode());
        document.getElementById('auto-fill-notes').addEventListener('click', () => this.autoFillNotes());

        document.addEventListener('keydown', (e) => {
            if (e.key >= '1' && e.key <= '9') {
                const number = parseInt(e.key);
                this.handleNumberSelect(number);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                this.clearCell();
            } else if (e.key === 'n' || e.key === 'N') {
                this.toggleNotesMode();
            } else if (e.key === 'a' || e.key === 'A') {
                this.autoFillNotes();
            } else if (e.key === 'Escape') {
                this.selectedCell = null;
                this.selectedNumber = null;
                this.updateNumberSelection();
                this.updateGrid();
            }
        });

        document.addEventListener('click', (e) => {
                //console.log(e.target.closest('.note-number').parentNode.parentNode)
                if (!e.target.closest('.cell') && !e.target.closest('.counter-item')) {
                //this.selectedCell = null;

                this.updateGrid();
            }
        });
    }

    autoSave() {
        setInterval(() => {
            this.saveProgress();
        }, 30000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SudokuGame();
});