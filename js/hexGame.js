// Game Constants
const PLAYER_RED = 1;
const PLAYER_BLUE = 2;
const EMPTY = 0;

// Game State
class HexGame {
    constructor(size = 7) {
        this.size = size;
        this.board = Array(size).fill(null).map(() => Array(size).fill(EMPTY));
        this.currentPlayer = PLAYER_RED;
        this.moveCount = 0;
        this.gameOver = false;
        this.winner = null;
        this.swapAvailable = false;
        this.history = [];
    }

    static fromState(state) {
        const game = new HexGame(state.size);
        game.board = state.board.map(row => [...row]);
        game.currentPlayer = state.currentPlayer;
        game.moveCount = state.moveCount;
        game.gameOver = state.gameOver;
        game.winner = state.winner;
        game.swapAvailable = state.swapAvailable;
        game.history = [...state.history];
        return game;
    }

    copy() {
        const newGame = new HexGame(this.size);
        newGame.board = this.board.map(row => [...row]);
        newGame.currentPlayer = this.currentPlayer;
        newGame.moveCount = this.moveCount;
        newGame.gameOver = this.gameOver;
        newGame.winner = this.winner;
        newGame.swapAvailable = this.swapAvailable;
        newGame.history = [...this.history];
        return newGame;
    }

    isValidMove(row, col) {
        if (row < 0 || row >= this.size || col < 0 || col >= this.size) {
            return false;
        }
        if (this.board[row][col] !== EMPTY) {
            return false;
        }
        // Disallow center tile as first move on 7x7 board
        if (this.size === 7 && this.moveCount === 0) {
            const center = Math.floor(this.size / 2); // 3 for 7x7
            if (row === center && col === center) {
                return false;
            }
        }
        return true;
    }

    makeMove(row, col) {
        if (!this.isValidMove(row, col) || this.gameOver) {
            return false;
        }

        this.board[row][col] = this.currentPlayer;
        this.history.push({ row, col, player: this.currentPlayer });
        this.moveCount++;

        // Check for swap rule availability
        if (this.moveCount === 1) {
            this.swapAvailable = true;
        }

        if (this.checkWin(this.currentPlayer)) {
            this.gameOver = true;
            this.winner = this.currentPlayer;
            return true;
        }

        this.currentPlayer = this.currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
        this.swapAvailable = false;
        return true;
    }

    swapSides() {
        if (this.moveCount !== 1 || !this.swapAvailable) {
            return false;
        }

        // Swap all pieces on board
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.board[r][c] === PLAYER_RED) {
                    this.board[r][c] = PLAYER_BLUE;
                } else if (this.board[r][c] === PLAYER_BLUE) {
                    this.board[r][c] = PLAYER_RED;
                }
            }
        }

        this.swapAvailable = false;
        this.currentPlayer = PLAYER_RED; // Red plays again after AI swaps
        return true;
    }

    getNeighbors(row, col) {
        const neighbors = [
            [row - 1, col], [row - 1, col + 1],
            [row, col - 1], [row, col + 1],
            [row + 1, col - 1], [row + 1, col]
        ];
        return neighbors.filter(([r, c]) => 
            r >= 0 && r < this.size && c >= 0 && c < this.size
        );
    }

    checkWin(player) {
        // Red connects top to bottom
        // Blue connects left to right
        const visited = Array(this.size).fill(null).map(() => Array(this.size).fill(false));
        const queue = [];

        if (player === PLAYER_RED) {
            // Start from top row
            for (let col = 0; col < this.size; col++) {
                if (this.board[0][col] === PLAYER_RED) {
                    queue.push([0, col]);
                    visited[0][col] = true;
                }
            }

            while (queue.length > 0) {
                const [row, col] = queue.shift();
                
                // Check if reached bottom
                if (row === this.size - 1) {
                    return true;
                }

                for (const [nr, nc] of this.getNeighbors(row, col)) {
                    if (!visited[nr][nc] && this.board[nr][nc] === PLAYER_RED) {
                        visited[nr][nc] = true;
                        queue.push([nr, nc]);
                    }
                }
            }
        } else {
            // Start from left column
            for (let row = 0; row < this.size; row++) {
                if (this.board[row][0] === PLAYER_BLUE) {
                    queue.push([row, 0]);
                    visited[row][0] = true;
                }
            }

            while (queue.length > 0) {
                const [row, col] = queue.shift();
                
                // Check if reached right
                if (col === this.size - 1) {
                    return true;
                }

                for (const [nr, nc] of this.getNeighbors(row, col)) {
                    if (!visited[nr][nc] && this.board[nr][nc] === PLAYER_BLUE) {
                        visited[nr][nc] = true;
                        queue.push([nr, nc]);
                    }
                }
            }
        }

        return false;
    }

    getValidMoves() {
        const moves = [];
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                if (this.board[r][c] === EMPTY) {
                    moves.push([r, c]);
                }
            }
        }
        return moves;
    }

    getWinningPath(player) {
        const visited = Array(this.size).fill(null).map(() => Array(this.size).fill(false));
        const parent = Array(this.size).fill(null).map(() => Array(this.size).fill(null));
        const queue = [];

        if (player === PLAYER_RED) {
            for (let col = 0; col < this.size; col++) {
                if (this.board[0][col] === PLAYER_RED) {
                    queue.push([0, col]);
                    visited[0][col] = true;
                }
            }

            while (queue.length > 0) {
                const [row, col] = queue.shift();
                
                if (row === this.size - 1) {
                    // Reconstruct path
                    const path = [];
                    let current = [row, col];
                    while (current) {
                        path.unshift(current);
                        current = parent[current[0]][current[1]];
                    }
                    return path;
                }

                for (const [nr, nc] of this.getNeighbors(row, col)) {
                    if (!visited[nr][nc] && this.board[nr][nc] === PLAYER_RED) {
                        visited[nr][nc] = true;
                        parent[nr][nc] = [row, col];
                        queue.push([nr, nc]);
                    }
                }
            }
        } else {
            for (let row = 0; row < this.size; row++) {
                if (this.board[row][0] === PLAYER_BLUE) {
                    queue.push([row, 0]);
                    visited[row][0] = true;
                }
            }

            while (queue.length > 0) {
                const [row, col] = queue.shift();
                
                if (col === this.size - 1) {
                    const path = [];
                    let current = [row, col];
                    while (current) {
                        path.unshift(current);
                        current = parent[current[0]][current[1]];
                    }
                    return path;
                }

                for (const [nr, nc] of this.getNeighbors(row, col)) {
                    if (!visited[nr][nc] && this.board[nr][nc] === PLAYER_BLUE) {
                        visited[nr][nc] = true;
                        parent[nr][nc] = [row, col];
                        queue.push([nr, nc]);
                    }
                }
            }
        }

        return null;
    }
}

// Export if using modules, otherwise it's global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HexGame, PLAYER_RED, PLAYER_BLUE, EMPTY };
}
