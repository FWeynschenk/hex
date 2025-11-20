/**
 * Random AI Implementation for Hex
 * 
 * A simple AI that makes random moves (with optional smart filtering)
 * Good for testing and as a baseline opponent
 */

class RandomAI {
    // AI Metadata - used by AI Provider for registration
    static get metadata() {
        return {
            id: 'random',
            name: 'Random AI',
            description: 'Makes random moves (for testing)',
            author: 'Built-in',
            version: '1.0',
            difficulties: {
                easy: {
                    name: 'Pure Random',
                    description: 'Completely random moves',
                    config: { smartMode: false }
                },
                medium: {
                    name: 'Smart Random',
                    description: 'Random with basic tactics',
                    config: { smartMode: true }
                }
            }
        };
    }
    constructor(config = {}, gameState = null) {
        this.smartMode = config.smartMode || false; // If true, avoids obviously bad moves
        this.aiPlayer = config.player || null;
    }

    /**
     * Set which player this AI controls
     * @param {number} player - PLAYER_RED or PLAYER_BLUE
     */
    setPlayer(player) {
        this.aiPlayer = player;
    }

    /**
     * Get the best move for the current board state
     * @param {Object} boardState - HexGame instance
     * @param {string} difficulty - Difficulty level
     * @returns {Array} [row, col] move
     */
    getMove(boardState, difficulty = null) {
        const validMoves = boardState.getValidMoves();
        
        if (validMoves.length === 0) {
            return null;
        }

        // Smart mode: check for winning moves and blocking moves
        if (this.smartMode) {
            // Check if we can win immediately
            for (const move of validMoves) {
                const testGame = boardState.copy();
                testGame.makeMove(move[0], move[1]);
                if (testGame.gameOver && testGame.winner === boardState.currentPlayer) {
                    return move;
                }
            }

            // Check if we need to block opponent's winning move
            const opponent = boardState.currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
            const blockingMoves = [];
            
            for (const move of validMoves) {
                const testGame = boardState.copy();
                testGame.currentPlayer = opponent;
                testGame.board[move[0]][move[1]] = opponent;
                
                if (testGame.checkWin(opponent)) {
                    blockingMoves.push(move);
                }
            }

            // If there's a must-block move, block it
            if (blockingMoves.length > 0) {
                return blockingMoves[Math.floor(Math.random() * blockingMoves.length)];
            }

            // Filter out center move on 7x7 board if it's the first move
            if (boardState.size === 7 && boardState.moveCount === 0) {
                const center = Math.floor(boardState.size / 2);
                const filteredMoves = validMoves.filter(([r, c]) => 
                    !(r === center && c === center)
                );
                if (filteredMoves.length > 0) {
                    return filteredMoves[Math.floor(Math.random() * filteredMoves.length)];
                }
            }
        }

        // Pick a random valid move
        return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RandomAI };
}

