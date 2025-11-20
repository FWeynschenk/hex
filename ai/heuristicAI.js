/**
 * Heuristic AI Implementation for Hex
 * 
 * Uses depth-limited minimax search with alpha-beta pruning
 * and position evaluation heuristics
 */

// Depth-limited heuristic search for small boards / critical moments
class HexHeuristicSearch {
    constructor() {
        this.maxDepth = 3;
        this.beamWidth = 8;
        this.cache = new Map();
    }

    configure(options = {}) {
        if (options.maxDepth) this.maxDepth = options.maxDepth;
        if (options.beamWidth) this.beamWidth = options.beamWidth;
    }

    getCacheKey(game, depth, player) {
        const boardKey = game.board.map(row => row.join('')).join('');
        return `${boardKey}|${game.currentPlayer}|${player}|${depth}`;
    }

    evaluate(game, player) {
        if (game.gameOver) {
            if (game.winner === player) return 1000;
            if (game.winner === (player === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED)) return -1000;
            return 0;
        }

        const playerScore = HexEvaluator.evaluatePosition(game, player);
        const opponent = player === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
        const opponentScore = HexEvaluator.evaluatePosition(game, opponent);
        return (playerScore - opponentScore) * 100;
    }

    getBestMove(game, player, options = {}) {
        const depth = options.maxDepth || this.maxDepth;
        const beam = options.beamWidth || this.beamWidth;
        const copiedGame = game.copy();
        const result = this.negamax(copiedGame, depth, -Infinity, Infinity, player, beam);
        return result.move;
    }

    negamax(game, depth, alpha, beta, player, beamWidth) {
        const cacheKey = this.getCacheKey(game, depth, player);
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (cached.depth >= depth) {
                return cached.result;
            }
        }

        if (depth === 0 || game.gameOver) {
            const terminalScore = this.evaluate(game, player);
            const result = { score: terminalScore, move: null };
            this.cache.set(cacheKey, { depth, result });
            return result;
        }

        let bestScore = -Infinity;
        let bestMove = null;
        const orderedMoves = this.orderMoves(game, beamWidth);

        if (orderedMoves.length === 0) {
            const result = { score: this.evaluate(game, player), move: null };
            this.cache.set(cacheKey, { depth, result });
            return result;
        }

        for (const move of orderedMoves) {
            const child = game.copy();
            child.makeMove(move[0], move[1]);

            const next = this.negamax(child, depth - 1, -beta, -alpha, player, beamWidth);
            const score = -next.score;

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            alpha = Math.max(alpha, score);
            if (alpha >= beta) {
                break; // Alpha-beta cutoff
            }
        }

        const result = { score: bestScore, move: bestMove };
        this.cache.set(cacheKey, { depth, result });
        return result;
    }

    orderMoves(game, beamWidth) {
        const moves = game.getValidMoves();
        const scoredMoves = moves.map(move => {
            const tempGame = game.copy();
            tempGame.board[move[0]][move[1]] = game.currentPlayer;
            const evaluation = HexEvaluator.evaluatePosition(tempGame, game.currentPlayer);
            return { move, score: evaluation };
        });

        scoredMoves.sort((a, b) => b.score - a.score);
        const limited = scoredMoves.slice(0, Math.max(beamWidth, 1));
        return limited.map(item => item.move);
    }
}

class HeuristicAI {
    // AI Metadata - used by AI Provider for registration
    static get metadata() {
        return {
            id: 'heuristic',
            name: 'Heuristic AI',
            description: 'Minimax with position evaluation',
            author: 'Built-in',
            version: '1.0',
            difficulties: {
                easy: {
                    name: 'Easy',
                    description: 'Shallow search (depth 3)',
                    config: { maxDepth: 3, beamWidth: 8 }
                },
                medium: {
                    name: 'Medium',
                    description: 'Moderate search (depth 4)',
                    config: { maxDepth: 4, beamWidth: 10 }
                },
                hard: {
                    name: 'Hard',
                    description: 'Deep search (depth 6)',
                    config: { maxDepth: 6, beamWidth: 12 }
                }
            }
        };
    }
    constructor(config = {}, gameState = null) {
        this.maxDepth = config.maxDepth || 4;
        this.beamWidth = config.beamWidth || 10;
        this.aiPlayer = config.player || null;
        this.cache = new Map();
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
        // Check for winning moves first
        const criticalMove = this.findCriticalMove(boardState);
        if (criticalMove) {
            return criticalMove;
        }

        const result = this.negamax(boardState.copy(), this.maxDepth, -Infinity, Infinity, this.aiPlayer, this.beamWidth);
        return result.move;
    }

    getCacheKey(game, depth, player) {
        const boardKey = game.board.map(row => row.join('')).join('');
        return `${boardKey}|${game.currentPlayer}|${player}|${depth}`;
    }

    evaluate(game, player) {
        if (game.gameOver) {
            if (game.winner === player) return 1000;
            if (game.winner === (player === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED)) return -1000;
            return 0;
        }

        if (typeof HexEvaluator !== 'undefined') {
            const playerScore = HexEvaluator.evaluatePosition(game, player);
            const opponent = player === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
            const opponentScore = HexEvaluator.evaluatePosition(game, opponent);
            return (playerScore - opponentScore) * 100;
        }

        // Fallback: simple evaluation
        return 0;
    }

    negamax(game, depth, alpha, beta, player, beamWidth) {
        const cacheKey = this.getCacheKey(game, depth, player);
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (cached.depth >= depth) {
                return cached.result;
            }
        }

        if (depth === 0 || game.gameOver) {
            const terminalScore = this.evaluate(game, player);
            const result = { score: terminalScore, move: null };
            this.cache.set(cacheKey, { depth, result });
            return result;
        }

        let bestScore = -Infinity;
        let bestMove = null;
        const orderedMoves = this.orderMoves(game, beamWidth);

        if (orderedMoves.length === 0) {
            const result = { score: this.evaluate(game, player), move: null };
            this.cache.set(cacheKey, { depth, result });
            return result;
        }

        for (const move of orderedMoves) {
            const child = game.copy();
            child.makeMove(move[0], move[1]);

            const next = this.negamax(child, depth - 1, -beta, -alpha, player, beamWidth);
            const score = -next.score;

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }

            alpha = Math.max(alpha, score);
            if (alpha >= beta) {
                break; // Alpha-beta cutoff
            }
        }

        const result = { score: bestScore, move: bestMove };
        this.cache.set(cacheKey, { depth, result });
        return result;
    }

    orderMoves(game, beamWidth) {
        const moves = game.getValidMoves();
        
        if (typeof HexEvaluator === 'undefined') {
            return moves.slice(0, beamWidth);
        }

        const scoredMoves = moves.map(move => {
            const tempGame = game.copy();
            tempGame.board[move[0]][move[1]] = game.currentPlayer;
            const evaluation = HexEvaluator.evaluatePosition(tempGame, game.currentPlayer);
            return { move, score: evaluation };
        });

        scoredMoves.sort((a, b) => b.score - a.score);
        const limited = scoredMoves.slice(0, Math.max(beamWidth, 1));
        return limited.map(item => item.move);
    }

    findCriticalMove(game) {
        const moves = game.getValidMoves();
        
        // Check if we can win in one move
        for (const move of moves) {
            const testGame = game.copy();
            testGame.makeMove(move[0], move[1]);
            if (testGame.gameOver && testGame.winner === game.currentPlayer) {
                return move;
            }
        }
        
        // Check if opponent can win in one move - must block
        const opponent = game.currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
        const threats = [];
        
        for (const move of moves) {
            const testGame = game.copy();
            testGame.currentPlayer = opponent;
            testGame.board[move[0]][move[1]] = opponent;
            
            if (testGame.checkWin(opponent)) {
                threats.push(move);
            }
        }
        
        if (threats.length === 1) {
            return threats[0];
        }
        
        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HeuristicAI };
}

