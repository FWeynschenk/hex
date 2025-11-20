/**
 * MCTS AI Implementation for Hex
 * 
 * Uses Monte Carlo Tree Search with:
 * - UCB1 + RAVE for node selection
 * - Heuristic-guided simulations
 * - Opening book integration
 * - Critical move detection
 * - Progressive widening for large boards
 */

// Monte Carlo Tree Search Node
class MCTSNode {
    constructor(game, aiPlayer, move = null, parent = null) {
        this.game = game;
        this.aiPlayer = aiPlayer;
        this.move = move;
        this.parent = parent;
        this.children = [];
        this.wins = 0;
        this.visits = 0;
        this.raveWins = 0;
        this.raveVisits = 0;
        // Sort moves by promise: prefer moves near existing stones
        this.untriedMoves = this.prioritizeMoves(game.getValidMoves());
    }

    prioritizeMoves(moves) {
        // Use advanced evaluation for move ordering
        const scoredMoves = moves.map(move => {
            const [row, col] = move;
            let score = 0;
            
            // Create a temporary game state to evaluate the move
            const tempGame = this.game.copy();
            tempGame.board[row][col] = this.game.currentPlayer;
            
            // Check if this wins immediately (highest priority)
            if (tempGame.checkWin(this.game.currentPlayer)) {
                return { move, score: 10000 };
            }
            
            // Check if this blocks opponent's immediate win
            const opponent = this.game.currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
            const blockGame = this.game.copy();
            blockGame.board[row][col] = opponent;
            if (blockGame.checkWin(opponent)) {
                score += 5000;
            }
            
            // Use position evaluation
            const positionScore = HexEvaluator.evaluatePosition(tempGame, this.game.currentPlayer);
            score += positionScore * 15;
            
            // Check neighbors for tactical value
            const neighbors = this.game.getNeighbors(row, col);
            let friendlyNeighbors = 0;
            let enemyNeighbors = 0;
            
            for (const [nr, nc] of neighbors) {
                if (this.game.board[nr][nc] === this.game.currentPlayer) {
                    friendlyNeighbors++;
                    score += 4;
                } else if (this.game.board[nr][nc] !== EMPTY) {
                    enemyNeighbors++;
                    score += 2.5; // Blocking is also valuable
                }
            }
            
            // Strong bonus for connecting pieces
            if (friendlyNeighbors >= 2) {
                score += 10;
            }
            
            // Check for pattern completion
            if (this.completesVirtualConnection(row, col)) {
                score += 12;
            }
            
            // Edge template bonus
            if (this.isEdgeTemplate(row, col, this.game.currentPlayer)) {
                score += 8;
            }
            
            // In opening, prefer strategic squares
            if (this.game.moveCount < 6) {
                const center = Math.floor(this.game.size / 2);
                const distance = Math.abs(row - center) + Math.abs(col - center);
                score += (this.game.size - distance) * 0.7;
            }
            
            return { move, score };
        });
        
        // Sort by score (highest first) and extract moves
        scoredMoves.sort((a, b) => b.score - a.score);
        return scoredMoves.map(item => item.move);
    }

    completesVirtualConnection(row, col) {
        // Check if this move completes a virtual connection
        const player = this.game.currentPlayer;
        let vcCount = 0;
        
        // Check all neighboring stones
        for (const [nr, nc] of this.game.getNeighbors(row, col)) {
            if (this.game.board[nr][nc] === player) {
                // Check if this creates a virtual connection to other stones
                for (let r = Math.max(0, row - 2); r <= Math.min(this.game.size - 1, row + 2); r++) {
                    for (let c = Math.max(0, col - 2); c <= Math.min(this.game.size - 1, col + 2); c++) {
                        if (this.game.board[r][c] === player && (r !== nr || c !== nc)) {
                            if (HexEvaluator.isVirtuallyConnected(this.game, [row, col], [r, c], player)) {
                                vcCount++;
                            }
                        }
                    }
                }
            }
        }
        
        return vcCount >= 2;
    }
    
    isEdgeTemplate(row, col, player) {
        // Check if this move creates a strong edge connection template
        if (player === PLAYER_RED) {
            // For red (top-bottom), check templates near top or bottom edges
            if (row <= 1) {
                // Near top edge
                return col > 0 && col < this.game.size - 1;
            } else if (row >= this.game.size - 2) {
                // Near bottom edge
                return col > 0 && col < this.game.size - 1;
            }
        } else {
            // For blue (left-right), check templates near left or right edges
            if (col <= 1) {
                // Near left edge
                return row > 0 && row < this.game.size - 1;
            } else if (col >= this.game.size - 2) {
                // Near right edge
                return row > 0 && row < this.game.size - 1;
            }
        }
        return false;
    }

    selectChild() {
        // UCB1 + RAVE (Rapid Action Value Estimation)
        const explorationConstant = 0.7; // Lower = more greedy (better for Hex with good heuristics)
        const raveConstant = 2000; // RAVE bias parameter
        
        return this.children.reduce((best, child) => {
            // Standard UCB1
            const exploitation = child.wins / child.visits;
            const exploration = explorationConstant * Math.sqrt(Math.log(this.visits) / child.visits);
            
            // RAVE component
            let raveValue = 0.5; // Default if no RAVE data
            if (child.raveVisits > 0) {
                raveValue = child.raveWins / child.raveVisits;
            }
            
            // Beta weight for mixing UCB and RAVE (decays as we get more samples)
            const beta = Math.sqrt(raveConstant / (3 * this.visits + raveConstant));
            
            // Combined value
            const ucb1Rave = (1 - beta) * exploitation + beta * raveValue + exploration;
            
            // Same calculation for best
            const bestExploitation = best.wins / best.visits;
            const bestExploration = explorationConstant * Math.sqrt(Math.log(this.visits) / best.visits);
            const bestRaveValue = best.raveVisits > 0 ? best.raveWins / best.raveVisits : 0.5;
            const bestUcb1Rave = (1 - beta) * bestExploitation + beta * bestRaveValue + bestExploration;
            
            return ucb1Rave > bestUcb1Rave ? child : best;
        });
    }

    expand() {
        // Take the most promising untried move
        const move = this.untriedMoves.shift();
        
        const newGame = this.game.copy();
        newGame.makeMove(move[0], move[1]);
        
        const childNode = new MCTSNode(newGame, this.aiPlayer, move, this);
        this.children.push(childNode);
        return childNode;
    }

    simulate() {
        const simGame = this.game.copy();
        const playedMoves = [];
        let lastMove = this.move;
        
        while (!simGame.gameOver) {
            const moves = simGame.getValidMoves();
            if (moves.length === 0) break;
            
            let selectedMove;
            
            // Check for immediate winning or blocking moves
            const criticalMove = this.findSimulationCriticalMove(simGame);
            if (criticalMove) {
                selectedMove = criticalMove;
            } else {
                // Use heuristic-guided selection throughout the simulation
                // This is key for strong play - random playouts are too weak
                const evaluatedMoves = moves.map(move => {
                    const tempGame = simGame.copy();
                    tempGame.board[move[0]][move[1]] = simGame.currentPlayer;
                    
                    // Quick heuristic evaluation
                    let score = HexEvaluator.evaluatePosition(tempGame, simGame.currentPlayer);
                    
                    // Bonus for moves near existing stones (connectivity)
                    const neighbors = simGame.getNeighbors(move[0], move[1]);
                    let friendlyNeighbors = 0;
                    for (const [nr, nc] of neighbors) {
                        if (simGame.board[nr][nc] === simGame.currentPlayer) {
                            friendlyNeighbors++;
                        }
                    }
                    score += friendlyNeighbors * 0.15;
                    
                    // Bonus for edge connection moves
                    if (simGame.currentPlayer === PLAYER_RED) {
                        if (move[0] === 0 || move[0] === simGame.size - 1) score += 0.1;
                    } else {
                        if (move[1] === 0 || move[1] === simGame.size - 1) score += 0.1;
                    }
                    
                    return { move, evaluation: score };
                });
                
                // Use temperature-based selection (not fully greedy, but strongly biased)
                const temperature = 0.3; // Lower = more greedy
                const expScores = evaluatedMoves.map(m => Math.exp(m.evaluation / temperature));
                const sumExp = expScores.reduce((a, b) => a + b, 0);
                
                // Sample from distribution
                let rand = Math.random();
                let cumProb = 0;
                for (let i = 0; i < evaluatedMoves.length; i++) {
                    cumProb += expScores[i] / sumExp;
                    if (rand < cumProb) {
                        selectedMove = evaluatedMoves[i].move;
                        break;
                    }
                }
                
                // Fallback
                if (!selectedMove) {
                    selectedMove = evaluatedMoves[0].move;
                }
            }
            
            simGame.makeMove(selectedMove[0], selectedMove[1]);
            playedMoves.push({ move: selectedMove, player: simGame.currentPlayer });
            lastMove = selectedMove;
        }

        return { winner: simGame.winner, playedMoves };
    }
    
    findSimulationCriticalMove(game) {
        // Quick check for winning moves or must-block moves
        const moves = game.getValidMoves();
        
        // Can we win immediately?
        for (const move of moves) {
            const testGame = game.copy();
            testGame.board[move[0]][move[1]] = game.currentPlayer;
            if (testGame.checkWin(game.currentPlayer)) {
                return move;
            }
        }
        
        // Must we block an immediate win?
        const opponent = game.currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
        for (const move of moves) {
            const testGame = game.copy();
            testGame.board[move[0]][move[1]] = opponent;
            if (testGame.checkWin(opponent)) {
                return move;
            }
        }
        
        return null;
    }

    backpropagate(result) {
        const { winner, playedMoves } = result;
        
        this.visits++;
        // From AI's perspective - check if AI won
        if (winner === this.aiPlayer) {
            this.wins++;
        }
        
        // Update RAVE statistics for all sibling moves that appeared in the playout
        if (this.parent) {
            for (const child of this.parent.children) {
                // Check if this child's move was played in the simulation
                for (const playedMove of playedMoves) {
                    if (child.move && 
                        child.move[0] === playedMove.move[0] && 
                        child.move[1] === playedMove.move[1] &&
                        playedMove.player === this.game.currentPlayer) {
                        
                        child.raveVisits++;
                        if (winner === this.aiPlayer) {
                            child.raveWins++;
                        }
                        break;
                    }
                }
            }
            
            // Continue backpropagation
            this.parent.backpropagate(result);
        }
    }

    isFullyExpanded() {
        return this.untriedMoves.length === 0;
    }

    isTerminal() {
        return this.game.gameOver;
    }
}

class MCTSAI {
    // AI Metadata - used by AI Provider for registration
    static get metadata() {
        return {
            id: 'mcts',
            name: 'MCTS AI',
            description: 'Monte Carlo Tree Search with advanced heuristics',
            author: 'Built-in',
            version: '1.0',
            difficulties: {
                easy: {
                    name: 'Easy',
                    description: 'Quick lookahead (1500 simulations)',
                    config: { 
                        simulations: 1500, 
                        label: 'easy',
                        heuristicSearch: null // Will be initialized
                    }
                },
                medium: {
                    name: 'Medium',
                    description: 'Balanced MCTS (5000 simulations)',
                    config: { 
                        simulations: 5000, 
                        label: 'medium',
                        heuristicSearch: null // Will be initialized
                    }
                },
                hard: {
                    name: 'Hard',
                    description: 'Hybrid deep search (15000 simulations)',
                    config: { 
                        simulations: 15000, 
                        label: 'hard',
                        heuristicSearch: null // Will be initialized
                    }
                }
            }
        };
    }
    constructor(config = {}, gameState = null) {
        this.simulations = config.simulations || 5000;
        this.aiPlayer = config.player || null;
        this.difficultyLabel = config.label || 'medium';
        // Initialize heuristic search if available and not provided
        this.heuristicSearch = config.heuristicSearch || 
            (typeof HexHeuristicSearch !== 'undefined' ? new HexHeuristicSearch() : null);
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
     * @param {string} difficulty - Difficulty level (not used, already configured)
     * @returns {Array} [row, col] move
     */
    getMove(boardState, difficulty = null) {
        return this.getBestMove(boardState);
    }

    getBestMove(game) {
        // First check opening book
        if (typeof HexOpeningBook !== 'undefined') {
            const bookMove = HexOpeningBook.getOpeningMove(game);
            if (bookMove) {
                return bookMove;
            }
        }
        
        // Check for critical moves (must block or win immediately)
        const criticalMove = this.findCriticalMove(game);
        if (criticalMove) {
            return criticalMove;
        }

        // Use deterministic heuristic search for small boards / late games
        if (this.heuristicSearch && this.shouldUseHeuristicSearch(game)) {
            const heuristicConfig = this.getHeuristicConfig(game);
            this.heuristicSearch.configure(heuristicConfig);
            const heuristicMove = this.heuristicSearch.getBestMove(game, this.aiPlayer, heuristicConfig);
            if (heuristicMove) {
                return heuristicMove;
            }
        }

        const root = new MCTSNode(game.copy(), this.aiPlayer);

        // Use progressive widening for larger boards
        const progressiveWidening = game.size > 11;
        let iterationsPerExpansion = progressiveWidening ? 50 : 1;

        for (let i = 0; i < this.simulations; i++) {
            let node = root;

            // Selection
            while (node.isFullyExpanded() && !node.isTerminal()) {
                node = node.selectChild();
            }

            // Expansion (with progressive widening)
            if (!node.isTerminal() && node.untriedMoves.length > 0) {
                if (!progressiveWidening || i % iterationsPerExpansion === 0) {
                    node = node.expand();
                }
            }

            // Simulation
            const result = node.simulate();

            // Backpropagation
            node.backpropagate(result);
        }

        // Choose best move based on robust child selection
        let bestChild = root.children[0];
        let maxVisits = bestChild.visits;
        let bestWinRate = bestChild.wins / Math.max(bestChild.visits, 1);
        
        for (const child of root.children) {
            const childWinRate = child.wins / Math.max(child.visits, 1);
            
            if (child.visits > maxVisits * 1.15) {
                bestChild = child;
                maxVisits = child.visits;
                bestWinRate = childWinRate;
            } else if (child.visits >= maxVisits * 0.85) {
                if (child.visits > maxVisits || 
                    (child.visits >= maxVisits * 0.95 && childWinRate > bestWinRate)) {
                    bestChild = child;
                    maxVisits = child.visits;
                    bestWinRate = childWinRate;
                }
            }
        }

        return bestChild.move;
    }

    shouldUseHeuristicSearch(game) {
        const smallBoard = game.size <= 7;
        const mediumBoard = game.size <= 11;
        const remaining = game.getValidMoves().length;
        const hardMode = this.difficultyLabel === 'hard';
        const mediumMode = this.difficultyLabel === 'medium';

        if (remaining <= 15) return true;
        if (smallBoard && remaining <= 25) return true;
        if (mediumBoard && (mediumMode || hardMode) && remaining <= 35) return true;
        if (hardMode && remaining <= 40) return true;

        return false;
    }

    getHeuristicConfig(game) {
        const remaining = game.getValidMoves().length;
        const hardMode = this.difficultyLabel === 'hard';
        let maxDepth = 4;
        let beamWidth = 10;

        if (game.size <= 7) {
            if (remaining > 30) {
                maxDepth = hardMode ? 5 : 4;
                beamWidth = 12;
            } else if (remaining > 20) {
                maxDepth = hardMode ? 6 : 5;
                beamWidth = 10;
            } else if (remaining > 10) {
                maxDepth = hardMode ? 8 : 6;
                beamWidth = 8;
            } else {
                maxDepth = hardMode ? 10 : 8;
                beamWidth = 6;
            }
        } else if (game.size <= 11) {
            if (remaining <= 15) {
                maxDepth = hardMode ? 7 : 5;
                beamWidth = 7;
            } else if (remaining <= 25) {
                maxDepth = hardMode ? 5 : 4;
                beamWidth = 8;
            } else {
                maxDepth = 4;
                beamWidth = 10;
            }
        } else {
            if (remaining <= 12) {
                maxDepth = hardMode ? 6 : 5;
                beamWidth = 6;
            } else {
                maxDepth = 4;
                beamWidth = 8;
            }
        }

        return { maxDepth, beamWidth };
    }

    findCriticalMove(game) {
        const opponent = game.currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
        const moves = game.getValidMoves();
        
        // First, check if we can win in one move
        for (const move of moves) {
            const testGame = game.copy();
            testGame.makeMove(move[0], move[1]);
            if (testGame.gameOver && testGame.winner === game.currentPlayer) {
                return move;
            }
        }
        
        // Check if opponent threatens to win in one move
        const immediateThreats = [];
        for (const move of moves) {
            const testGame = game.copy();
            testGame.currentPlayer = opponent;
            testGame.board[move[0]][move[1]] = opponent;
            
            if (testGame.checkWin(opponent)) {
                immediateThreats.push(move);
            }
        }
        
        if (immediateThreats.length === 1) {
            return immediateThreats[0];
        }
        
        if (immediateThreats.length > 1) {
            return immediateThreats[0];
        }
        
        // Check for two-move winning sequences
        if (moves.length <= 20) {
            const winningMove = this.findTwoMoveWin(game, game.currentPlayer);
            if (winningMove) {
                return winningMove;
            }
        }
        
        if (moves.length <= 20) {
            const blockingMove = this.findTwoMoveWin(game, opponent);
            if (blockingMove) {
                return blockingMove;
            }
        }
        
        const vcThreat = this.findVirtualConnectionThreat(game);
        if (vcThreat) {
            return vcThreat;
        }
        
        return null;
    }
    
    findTwoMoveWin(game, player) {
        const moves = game.getValidMoves();
        
        for (const move1 of moves) {
            const testGame1 = game.copy();
            testGame1.board[move1[0]][move1[1]] = player;
            
            let winningFollowUps = 0;
            for (const move2 of testGame1.getValidMoves()) {
                const testGame2 = testGame1.copy();
                testGame2.board[move2[0]][move2[1]] = player;
                
                if (testGame2.checkWin(player)) {
                    winningFollowUps++;
                    if (winningFollowUps >= 2) {
                        return move1;
                    }
                }
            }
        }
        
        return null;
    }

    findVirtualConnectionThreat(game) {
        const opponent = game.currentPlayer === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
        const moves = game.getValidMoves();
        
        for (const move of moves) {
            const [row, col] = move;
            let bridgeThreats = 0;
            
            const bridgePatterns = [
                {stone1: [-1, -1], stone2: [1, 1], bridge1: [0, -1], bridge2: [1, 0]},
                {stone1: [-1, 0], stone2: [1, -1], bridge1: [0, -1], bridge2: [-1, -1]},
                {stone1: [-1, 1], stone2: [0, -1], bridge1: [-1, 0], bridge2: [0, 0]},
                {stone1: [0, 1], stone2: [1, -1], bridge1: [1, 0], bridge2: [0, 0]},
                {stone1: [1, 0], stone2: [-1, 1], bridge1: [0, 1], bridge2: [0, 0]},
                {stone1: [0, -1], stone2: [-1, 1], bridge1: [-1, 0], bridge2: [0, 0]}
            ];
            
            for (const pattern of bridgePatterns) {
                const s1r = row + pattern.stone1[0], s1c = col + pattern.stone1[1];
                const s2r = row + pattern.stone2[0], s2c = col + pattern.stone2[1];
                const b1r = row + pattern.bridge1[0], b1c = col + pattern.bridge1[1];
                const b2r = row + pattern.bridge2[0], b2c = col + pattern.bridge2[1];
                
                if (s1r >= 0 && s1r < game.size && s1c >= 0 && s1c < game.size &&
                    s2r >= 0 && s2r < game.size && s2c >= 0 && s2c < game.size &&
                    b1r >= 0 && b1r < game.size && b1c >= 0 && b1c < game.size &&
                    b2r >= 0 && b2r < game.size && b2c >= 0 && b2c < game.size) {
                    
                    if (game.board[s1r][s1c] === opponent && 
                        game.board[s2r][s2c] === opponent &&
                        game.board[b1r][b1c] === EMPTY &&
                        game.board[b2r][b2c] === EMPTY) {
                        bridgeThreats++;
                    }
                }
            }
            
            if (bridgeThreats >= 2) {
                return move;
            }
        }
        
        return null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MCTSAI };
}

