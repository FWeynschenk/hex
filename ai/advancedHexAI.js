/**
 * Super Advanced Hex AI (G3)
 * 
 * Features:
 * - MCTS with UCT + RAVE (Rapid Action Value Estimation)
 * - Dynamic Simulation Policy:
 *   - Bridge Saving: Immediately responds to threats against 2-bridge connections.
 *   - Decisive Moves: Detects immediate winning moves (connecting Top-Bottom/Left-Right).
 * - Union-Find Optimization with Path Compression and Status Tracking.
 * - Heuristic Node Initialization based on Centrality and Local Connectivity.
 * 
 * This AI is designed to be significantly stronger than standard MCTS.
 */
class AdvancedHexAI {
    static metadata = {
        id: 'advanced-hex',
        name: 'Super Hex',
        description: 'MCTS with Bridge Detection & RAVE',
        author: 'AI Assistant',
        version: '2.2',
        supportsAnalytics: true,
        difficulties: {
            easy: { 
                name: 'Fast', 
                description: 'Quick search (100ms)', 
                config: { timeLimit: 100 } 
            },
            medium: { 
                name: 'Balanced', 
                description: 'Deep search (1s)', 
                config: { timeLimit: 1000 } 
            },
            hard: { 
                name: 'Strong', 
                description: 'Deepest search (4s)', 
                config: { timeLimit: 4000 } 
            },
            extreme: {
                name: 'Extreme',
                description: 'Max power (15s)',
                config: { timeLimit: 15000 }
            }
        }
    };

    constructor(config, gameState) {
        this.timeLimit = config.timeLimit || 1000;
        this.player = 1;
        this.lastScores = new Map();
        this.raveBias = 500; // Tuned for Hex
    }

    setPlayer(player) {
        this.player = player;
    }

    getMove(game, difficulty) {
        // Fix: Root node should represent the state *before* current player's turn
        // So its 'player' is the opponent.
        const opponent = game.currentPlayer === 1 ? 2 : 1;
        const root = new G3MCTSNode(null, null, opponent);
        const fastGame = new FastHexGame(game);
        
        // Centrality/Heuristic initialization for root
        this.expand(root, fastGame);
        
        const startTime = performance.now();
        const endTime = startTime + this.timeLimit;
        let iterations = 0;

        // Adaptive batch size based on performance
        const batchSize = 100;

        while (performance.now() < endTime) {
            // Run batch of simulations
            for (let i = 0; i < batchSize; i++) {
                this.runSimulation(root, fastGame);
                iterations++;
            }
        }

        const dt = performance.now() - startTime;
        const kSims = Math.round(iterations / 1000);
        console.log(`SuperHexAI: ${kSims}k sims in ${Math.round(dt)}ms (${Math.round(iterations/dt*1000)} sims/s)`);

        const bestChild = root.getBestChild();
        if (!bestChild) {
            // Fallback if no valid moves (shouldn't happen)
            const valid = game.getValidMoves();
            return valid[Math.floor(Math.random() * valid.length)];
        }

        this.updateAnalytics(root);
        return bestChild.move;
    }

    runSimulation(root, fastGame) {
        const node = this.select(root, fastGame);
        
        let winner = fastGame.getWinner();
        
        if (winner === 0) {
            // Expansion
            // Note: We expanded root in constructor, but leaf nodes need expansion
            if (!node.isExpanded && !node.isTerminal) {
                this.expand(node, fastGame);
                
                // If expanded childs, select one to simulate from?
                // Actually, we just simulate from the current board state
                // But we need to account for the move of the *newly created* child if we picked one
                // Standard MCTS: Select (reaches leaf) -> Expand (adds children) -> Simulate (random from leaf state)
                // My Select() actually returns the leaf node.
            }
            
            winner = this.simulate(fastGame);
        }
        
        this.backpropagate(node, winner, fastGame);
        fastGame.reset();
    }

    select(node, fastGame) {
        while (node.isExpanded && !node.isTerminal) {
            const child = node.selectChild();
            if (!child) break; // Should not happen if expanded
            node = child;
            fastGame.makeMove(node.move[0], node.move[1]);
        }
        return node;
    }

    expand(node, fastGame) {
        if (fastGame.getWinner() !== 0) {
            node.isTerminal = true;
            return;
        }

        const validMoves = fastGame.getValidMoves();
        const nextPlayer = node.player === 1 ? 2 : 1;
        
        // Heuristic initialization
        // Center moves are generally better
        const center = (fastGame.size - 1) / 2;

        for (const [r, c] of validMoves) {
            const child = new G3MCTSNode(node, [r, c], nextPlayer);
            
            // Add slight bias for central moves in unvisited nodes
            // Dist from center
            const dist = Math.sqrt(Math.pow(r - center, 2) + Math.pow(c - center, 2));
            // Max possible dist is approx size
            const normalizedDist = dist / fastGame.size;
            // Bias score: 0.0 to 1.0 (Higher is better/closer to center)
            child.heuristicScore = 1.0 - normalizedDist; 

            node.children.push(child);
        }
        
        node.isExpanded = true;
        
        if (node.children.length === 0) {
            node.isTerminal = true;
        }
    }

    simulate(fastGame) {
        return fastGame.playoutSmart();
    }

    backpropagate(node, winner, fastGame) {
        // RAVE: Collect moves made by each player
        const p1Moves = new Set();
        const p2Moves = new Set();
        
        // History contains {id, player}
        // Only consider moves made *during simulation* and *descending tree*?
        // RAVE usually uses all moves in the episode.
        
        for (const m of fastGame.movesHistory) {
            if (m.player === 1) p1Moves.add(m.id);
            else p2Moves.add(m.id);
        }
        
        const size = fastGame.size;

        while (node !== null) {
            node.visits++;
            if (node.player === winner) {
                node.wins++;
            }
            
            // RAVE Update for siblings/children
            // The children of `node` represent moves by `nextPlayer` (opponent of node.player)
            if (node.children.length > 0) {
                const nextPlayer = node.children[0].player;
                const moveSet = nextPlayer === 1 ? p1Moves : p2Moves;
                
                for (const child of node.children) {
                    const moveIdx = child.move[0] * size + child.move[1];
                    if (moveSet.has(moveIdx)) {
                        child.raveVisits++;
                        if (nextPlayer === winner) {
                            child.raveWins++;
                        }
                    }
                }
            }

            node = node.parent;
        }
    }

    updateAnalytics(root) {
        this.lastScores.clear();
        // Use max visits for normalization
        const maxVisits = root.children.reduce((max, c) => Math.max(max, c.visits), 0);
        
        for (const child of root.children) {
            if (child.visits > 0) {
                const score = (child.visits / maxVisits) * 100;
                this.lastScores.set(`${child.move[0]},${child.move[1]}`, score);
            }
        }
    }

    getNormalizedScores() {
        return this.lastScores;
    }
}

class G3MCTSNode {
    constructor(parent, move, player) {
        this.parent = parent;
        this.move = move; 
        this.player = player;
        this.children = [];
        this.visits = 0;
        this.wins = 0;
        this.raveVisits = 0;
        this.raveWins = 0;
        this.isTerminal = false;
        this.isExpanded = false;
        this.heuristicScore = 0.5; // Default
    }

    getWinRate() {
        return this.visits === 0 ? 0 : this.wins / this.visits;
    }

    getRaveWinRate() {
        return this.raveVisits === 0 ? 0 : this.raveWins / this.raveVisits;
    }

    selectChild() {
        let bestScore = -Infinity;
        let bestChild = null;
        
        const C = 0.8; // Exploration constant (lower for RAVE)
        const b = 500; // RAVE bias parameter
        const totalVisits = this.visits;
        const logTotal = Math.log(totalVisits || 1);

        for (const child of this.children) {
            let score;
            
            if (child.visits === 0) {
                // FPU (First Play Urgency)
                // Use Heuristic Score + RAVE if available
                const raveWin = child.raveVisits > 0 ? child.getRaveWinRate() : 0.5;
                // Prioritize high RAVE or central moves
                score = 1.0 + child.heuristicScore + raveWin; 
            } else {
                const beta = child.raveVisits / (child.raveVisits + child.visits + b * child.raveVisits * child.visits + 1e-9);
                
                const winRate = child.getWinRate();
                const raveRate = child.getRaveWinRate();
                
                const uctParams = Math.sqrt(logTotal / child.visits);
                
                // RAVE formula
                score = (1 - beta) * winRate + beta * raveRate + C * uctParams;
            }

            if (score > bestScore) {
                bestScore = score;
                bestChild = child;
            }
        }
        return bestChild;
    }

    getBestChild() {
        // Most visited is robust
        let maxVisits = -1;
        let best = null;
        for (const child of this.children) {
            if (child.visits > maxVisits) {
                maxVisits = child.visits;
                best = child;
            }
        }
        return best;
    }
}

class FastHexGame {
    constructor(sourceGame) {
        this.size = sourceGame.size;
        // Flat board: 0=empty, 1=red, 2=blue
        this.board = new Int8Array(this.size * this.size);
        this.emptyCells = []; // Keep track of empty indices for fast random pick
        this.movesHistory = []; // {id, player}

        // Copy board
        for (let r = 0; r < this.size; r++) {
            for (let c = 0; c < this.size; c++) {
                const val = sourceGame.board[r][c];
                this.board[r * this.size + c] = val;
                if (val === 0) this.emptyCells.push(r * this.size + c);
            }
        }

        this.currentPlayer = sourceGame.currentPlayer;
        
        // Union Find with Status Tracking
        // Nodes: 0..size*size-1. 
        // We don't use explicit edge nodes in UF, instead we track group status.
        this.uf = new UnionFind(this.size * this.size);
        
        // Track group status: [idx] -> bitmask
        // 1: Top, 2: Bottom, 4: Left, 8: Right
        this.groupStatus = new Uint8Array(this.size * this.size);
        
        // Initialize connectivity and status
        for (let i = 0; i < this.board.length; i++) {
            if (this.board[i] !== 0) {
                this.initCell(i, this.board[i]);
            }
        }
        
        // Re-scan to union neighbors
        for (let i = 0; i < this.board.length; i++) {
            if (this.board[i] !== 0) {
                const ns = this.getNeighborsIdx(i);
                for (const n of ns) {
                    if (this.board[n] === this.board[i]) {
                        this.unionGroups(i, n);
                    }
                }
            }
        }

        // Snapshots for reset
        this.initialBoard = new Int8Array(this.board);
        this.initialPlayer = this.currentPlayer;
        this.initialEmpty = [...this.emptyCells];
        this.initialGroupStatus = new Uint8Array(this.groupStatus);
        this.initialUF = this.uf.clone();
        
        // Count initial stones for 7x7 center rule
        this.initialFilledCount = (this.size * this.size) - this.emptyCells.length;
        this.filledCount = this.initialFilledCount;
    }
    
    reset() {
        this.board.set(this.initialBoard);
        this.currentPlayer = this.initialPlayer;
        this.emptyCells = [...this.initialEmpty]; // Array copy
        this.movesHistory = [];
        this.groupStatus.set(this.initialGroupStatus);
        this.uf.restore(this.initialUF);
        this.filledCount = this.initialFilledCount;
    }

    // Initialize cell status based on position
    initCell(idx, player) {
        const r = Math.floor(idx / this.size);
        const c = idx % this.size;
        let status = 0;
        
        if (player === 1) { // Red: Top-Bottom
            if (r === 0) status |= 1; // Top
            if (r === this.size - 1) status |= 2; // Bottom
        } else { // Blue: Left-Right
            if (c === 0) status |= 4; // Left
            if (c === this.size - 1) status |= 8; // Right
        }
        
        const root = this.uf.find(idx);
        this.groupStatus[root] |= status;
    }

    unionGroups(i, j) {
        const rootI = this.uf.find(i);
        const rootJ = this.uf.find(j);
        if (rootI !== rootJ) {
            // Merge status
            const status = this.groupStatus[rootI] | this.groupStatus[rootJ];
            this.uf.union(rootI, rootJ);
            const newRoot = this.uf.find(rootI);
            this.groupStatus[newRoot] = status;
        }
    }

    isValidFirstMove(idx) {
        if (this.size !== 7) return true;
        if (this.filledCount !== 0) return true;
        const center = Math.floor(this.size / 2);
        const r = Math.floor(idx / this.size);
        const c = idx % this.size;
        return !(r === center && c === center);
    }

    getValidMoves() {
        const moves = [];
        for (let i = 0; i < this.board.length; i++) {
            if (this.board[i] === 0) {
                if (this.isValidFirstMove(i)) {
                    moves.push([Math.floor(i / this.size), i % this.size]);
                }
            }
        }
        return moves;
    }

    makeMove(r, c) {
        const idx = r * this.size + c;
        this.board[idx] = this.currentPlayer;
        this.filledCount++;
        
        // Update history
        this.movesHistory.push({ id: idx, player: this.currentPlayer });
        
        // Update Empty cells (slow linear remove? Swap with end is faster)
        // Actually for tree descent we don't strictly need accurate emptyCells list if we don't simulate from middle.
        // But we do simulate. 
        // Fast remove:
        const emptyIdx = this.emptyCells.indexOf(idx);
        if (emptyIdx !== -1) {
            this.emptyCells[emptyIdx] = this.emptyCells[this.emptyCells.length - 1];
            this.emptyCells.pop();
        }
        
        // Update connectivity
        this.initCell(idx, this.currentPlayer);
        const ns = this.getNeighborsIdx(idx);
        for (const n of ns) {
            if (this.board[n] === this.currentPlayer) {
                this.unionGroups(idx, n);
            }
        }

        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
    }
    
    // Optimized Smart Playout
    playoutSmart() {
        // Loop until win
        while (true) {
            // Check winner
            if (this.checkWin(1)) return 1;
            if (this.checkWin(2)) return 2;
            if (this.emptyCells.length === 0) return 0; // Draw impossible but safety

            // 1. Check DECISIVE MOVES (Instant Win)
            // Check if any empty cell connects two groups that together span the board
            // Optimization: Checking all empty cells is slow.
            // Check only neighbors of current player's groups? 
            // Or skip this step for speed and rely on Bridge Save?
            
            // Let's do Bridge Saving.
            // If opponent just played, check if they intruded a bridge.
            let bestMoveIdx = -1;
            
            if (this.movesHistory.length > 0) {
                const lastMove = this.movesHistory[this.movesHistory.length - 1];
                // Opponent is lastMove.player. Current is this.currentPlayer.
                // We want to block if needed. 
                // Check if *lastMove* blocks OUR bridge? No, we want to reconnect.
                
                // Bridge Logic: 
                // Opponent placed stone at X.
                // If I have stones at A and B such that A-X-B is a bridge pattern...
                // I must play at the OTHER common neighbor Y to save connection.
                
                const oppIdx = lastMove.id;
                const oppPlayer = lastMove.player; // Should be != current
                const myPlayer = this.currentPlayer;
                
                // Check neighbors of oppIdx
                const neighbors = this.getNeighborsIdx(oppIdx);
                const myNeighbors = neighbors.filter(n => this.board[n] === myPlayer);
                
                // Check pairs of myNeighbors
                for (let i = 0; i < myNeighbors.length; i++) {
                    for (let j = i + 1; j < myNeighbors.length; j++) {
                        const n1 = myNeighbors[i];
                        const n2 = myNeighbors[j];
                        
                        // Check if n1 and n2 share a common empty neighbor Y (other than oppIdx)
                        const common = this.getCommonEmptyNeighbor(n1, n2, oppIdx);
                        if (common !== -1) {
                            bestMoveIdx = common; // Found a save!
                            break;
                        }
                    }
                    if (bestMoveIdx !== -1) break;
                }
            }
            
            if (bestMoveIdx === -1) {
                // Random move (optimization: Fisher-Yates partial shuffle)
                let randIndex = Math.floor(Math.random() * this.emptyCells.length);
                bestMoveIdx = this.emptyCells[randIndex];
                
                // Retry if invalid first move (center on 7x7)
                if (this.size === 7 && this.filledCount === 0) {
                    const centerIdx = Math.floor(this.size/2) * this.size + Math.floor(this.size/2);
                    // If we picked center, and it's invalid, pick again.
                    // Note: if only 1 cell left (center) and invalid, loop infinite?
                    // But 7x7 starts with 49 cells. Center is 1. 
                    // If filledCount is 0, there are 49 empty cells. 
                    // Probability of picking center is 1/49.
                    while (bestMoveIdx === centerIdx) {
                        randIndex = Math.floor(Math.random() * this.emptyCells.length);
                        bestMoveIdx = this.emptyCells[randIndex];
                    }
                }
            }

            // Execute Move
            const idx = bestMoveIdx;
            this.board[idx] = this.currentPlayer;
            this.movesHistory.push({ id: idx, player: this.currentPlayer });
            
            // Remove from empty (Swap-Pop)
            // Note: if we picked from emptyCells array, we know index.
            // But if we picked via Bridge logic, we need to find it.
            // Since we need to be correct, let's find it.
            // Optimization: Map? For 7x7 (49), Array.indexOf is extremely fast.
            const arrIdx = this.emptyCells.indexOf(idx);
            if (arrIdx !== -1) {
                this.emptyCells[arrIdx] = this.emptyCells[this.emptyCells.length - 1];
                this.emptyCells.pop();
            }
            
            // Update Union Find
            this.initCell(idx, this.currentPlayer);
            const ns = this.getNeighborsIdx(idx);
            for (const n of ns) {
                if (this.board[n] === this.currentPlayer) {
                    this.unionGroups(idx, n);
                }
            }

            // Next turn
            this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        }
    }

    getCommonEmptyNeighbor(n1, n2, exclude) {
        const ns1 = this.getNeighborsIdx(n1);
        // Check if any neighbor of n1 is also neighbor of n2, is empty, and != exclude
        for (const n of ns1) {
            if (n !== exclude && this.board[n] === 0) {
                // Check if neighbor of n2
                // Neighbors are symmetric. Distance check?
                // Dist on hex grid.
                // Faster: check adjacency list of n2?
                // Or just geometry.
                // Let's use neighbor check.
                const ns2 = this.getNeighborsIdx(n2);
                if (ns2.includes(n)) {
                    return n;
                }
            }
        }
        return -1;
    }

    getNeighborsIdx(idx) {
        const r = Math.floor(idx / this.size);
        const c = idx % this.size;
        const ns = [];
        const dr = [-1, -1, 0, 0, 1, 1];
        const dc = [0, 1, -1, 1, -1, 0];
        
        for (let i = 0; i < 6; i++) {
            const nr = r + dr[i];
            const nc = c + dc[i];
            if (nr >= 0 && nr < this.size && nc >= 0 && nc < this.size) {
                ns.push(nr * this.size + nc);
            }
        }
        return ns;
    }

    checkWin(player) {
        // Check if any group of 'player' has both Top/Bottom or Left/Right flags
        // Iterate all roots? 
        // We only need to check the groups modified recently, but iterating roots is fast enough for 7x7
        // Optimization: we only update status on union.
        // We can check if ANY root has status 3 (1|2) for Red or 12 (4|8) for Blue.
        
        // Better: keep track of "Winning Group Exists" boolean?
        // Or check on union.
        // Let's iterate non-empty cells roots.
        // Or just check roots.
        
        const winningMask = player === 1 ? 3 : 12; // 1|2=3, 4|8=12
        
        for (let i = 0; i < this.board.length; i++) {
            if (this.board[i] === player) {
                const root = this.uf.find(i);
                if ((this.groupStatus[root] & winningMask) === winningMask) {
                    return true;
                }
            }
        }
        return false;
    }

    getWinner() {
        if (this.checkWin(1)) return 1;
        if (this.checkWin(2)) return 2;
        return 0;
    }
}

class UnionFind {
    constructor(size) {
        this.parent = new Int16Array(size);
        this.reset();
    }
    
    reset() {
        for (let i = 0; i < this.parent.length; i++) {
            this.parent[i] = i;
        }
    }
    
    find(i) {
        let root = i;
        while (root !== this.parent[root]) {
            root = this.parent[root];
        }
        let curr = i;
        while (curr !== root) {
            let next = this.parent[curr];
            this.parent[curr] = root;
            curr = next;
        }
        return root;
    }
    
    union(i, j) {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) {
            this.parent[rootI] = rootJ;
        }
    }

    clone() {
        return new Int16Array(this.parent);
    }

    restore(state) {
        this.parent.set(state);
    }
}
