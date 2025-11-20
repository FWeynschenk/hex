/**
 * Shared Hex Game Utilities
 * 
 * Contains evaluation functions and opening book logic
 * that can be used by multiple AI implementations
 */

// Advanced Hex evaluation functions
class HexEvaluator {
    static evaluatePosition(game, player) {
        // Electrical resistance model - lower resistance means better connection
        const resistance = this.calculateResistance(game, player);
        const centerControl = this.evaluateCenterControl(game, player);
        const edgeConnection = this.evaluateEdgeConnection(game, player);
        const virtualConnections = this.countVirtualConnections(game, player);
        
        // Combine factors (lower resistance is better, so we invert it)
        return (1 / (1 + resistance)) * 0.5 + 
               centerControl * 0.2 + 
               edgeConnection * 0.2 + 
               virtualConnections * 0.1;
    }
    
    static calculateResistance(game, player) {
        // Simplified electrical resistance calculation
        // Each empty hex has resistance 1, friendly hexes have resistance 0
        const size = game.size;
        const INF = 1000000;
        const resistance = Array(size).fill(null).map(() => Array(size).fill(INF));
        
        // Initialize starting edges
        if (player === PLAYER_RED) {
            // Red connects top to bottom
            for (let col = 0; col < size; col++) {
                if (game.board[0][col] === EMPTY || game.board[0][col] === player) {
                    resistance[0][col] = game.board[0][col] === player ? 0 : 1;
                }
            }
        } else {
            // Blue connects left to right
            for (let row = 0; row < size; row++) {
                if (game.board[row][0] === EMPTY || game.board[row][0] === player) {
                    resistance[row][0] = game.board[row][0] === player ? 0 : 1;
                }
            }
        }
        
        // Dynamic programming to find minimum resistance path
        for (let iter = 0; iter < size * size; iter++) {
            let updated = false;
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    const opponent = player === PLAYER_RED ? PLAYER_BLUE : PLAYER_RED;
                    if (game.board[r][c] === opponent) continue; // Skip opponent stones
                    
                    const cellResistance = game.board[r][c] === player ? 0 : 1;
                    for (const [nr, nc] of game.getNeighbors(r, c)) {
                        const newResistance = resistance[nr][nc] + cellResistance;
                        if (newResistance < resistance[r][c]) {
                            resistance[r][c] = newResistance;
                            updated = true;
                        }
                    }
                }
            }
            if (!updated) break;
        }
        
        // Find minimum resistance to opposite edge
        let minResistance = INF;
        if (player === PLAYER_RED) {
            for (let col = 0; col < size; col++) {
                minResistance = Math.min(minResistance, resistance[size - 1][col]);
            }
        } else {
            for (let row = 0; row < size; row++) {
                minResistance = Math.min(minResistance, resistance[row][size - 1]);
            }
        }
        
        return minResistance;
    }
    
    static evaluateCenterControl(game, player) {
        let control = 0;
        const center = Math.floor(game.size / 2);
        const radius = Math.floor(game.size / 4);
        
        for (let r = center - radius; r <= center + radius; r++) {
            for (let c = center - radius; c <= center + radius; c++) {
                if (r >= 0 && r < game.size && c >= 0 && c < game.size) {
                    if (game.board[r][c] === player) {
                        control += 1;
                    } else if (game.board[r][c] !== EMPTY) {
                        control -= 0.5;
                    }
                }
            }
        }
        
        return control / (radius * radius * 4);
    }
    
    static evaluateEdgeConnection(game, player) {
        let connections = 0;
        
        if (player === PLAYER_RED) {
            // Check top and bottom edges
            for (let col = 0; col < game.size; col++) {
                if (game.board[0][col] === player) connections++;
                if (game.board[game.size - 1][col] === player) connections++;
            }
        } else {
            // Check left and right edges
            for (let row = 0; row < game.size; row++) {
                if (game.board[row][0] === player) connections++;
                if (game.board[row][game.size - 1] === player) connections++;
            }
        }
        
        return connections / (game.size * 2);
    }
    
    static countVirtualConnections(game, player) {
        let vcCount = 0;
        
        // Check all pairs of friendly stones
        for (let r1 = 0; r1 < game.size; r1++) {
            for (let c1 = 0; c1 < game.size; c1++) {
                if (game.board[r1][c1] !== player) continue;
                
                // Check for virtual connections within distance 2
                for (let r2 = Math.max(0, r1 - 2); r2 <= Math.min(game.size - 1, r1 + 2); r2++) {
                    for (let c2 = Math.max(0, c1 - 2); c2 <= Math.min(game.size - 1, c1 + 2); c2++) {
                        if (r1 === r2 && c1 === c2) continue;
                        if (game.board[r2][c2] !== player) continue;
                        
                        // Check if these form a virtual connection
                        if (this.isVirtuallyConnected(game, [r1, c1], [r2, c2], player)) {
                            vcCount++;
                        }
                    }
                }
            }
        }
        
        return vcCount / (game.size * game.size);
    }
    
    static isVirtuallyConnected(game, pos1, pos2, player) {
        const [r1, c1] = pos1;
        const [r2, c2] = pos2;
        
        // Bridge pattern check
        const dr = r2 - r1;
        const dc = c2 - c1;
        
        // Standard bridge patterns (distance 2 with specific arrangements)
        if (Math.abs(dr) + Math.abs(dc) === 2) {
            // Find the two intermediate cells
            const intermediates = [];
            
            if (dr === 2 && dc === 0) {
                intermediates.push([r1 + 1, c1 - 1], [r1 + 1, c1]);
            } else if (dr === -2 && dc === 0) {
                intermediates.push([r1 - 1, c1], [r1 - 1, c1 + 1]);
            } else if (dr === 0 && dc === 2) {
                intermediates.push([r1 - 1, c1 + 1], [r1, c1 + 1]);
            } else if (dr === 0 && dc === -2) {
                intermediates.push([r1, c1 - 1], [r1 + 1, c1 - 1]);
            } else if (dr === 1 && dc === 1) {
                intermediates.push([r1, c1 + 1], [r1 + 1, c1]);
            } else if (dr === -1 && dc === -1) {
                intermediates.push([r1 - 1, c1], [r1, c1 - 1]);
            } else if (dr === 1 && dc === -2) {
                intermediates.push([r1, c1 - 1], [r1 + 1, c1 - 1]);
            } else if (dr === -1 && dc === 2) {
                intermediates.push([r1 - 1, c1 + 1], [r1, c1 + 1]);
            } else if (dr === 2 && dc === -1) {
                intermediates.push([r1 + 1, c1 - 1], [r1 + 1, c1]);
            } else if (dr === -2 && dc === 1) {
                intermediates.push([r1 - 1, c1], [r1 - 1, c1 + 1]);
            }
            
            // Check if both intermediate cells are empty and in bounds
            let validBridge = intermediates.length === 2;
            for (const [ir, ic] of intermediates) {
                if (ir < 0 || ir >= game.size || ic < 0 || ic >= game.size || 
                    game.board[ir][ic] !== EMPTY) {
                    validBridge = false;
                    break;
                }
            }
            
            return validBridge;
        }
        
        return false;
    }
}

// Opening book for common board sizes
class HexOpeningBook {
    static getOpeningMove(game) {
        const size = game.size;
        const moveCount = game.moveCount;
        
        // Only use opening book for first few moves
        if (moveCount > 4) return null;
        
        // Convert board to string for pattern matching
        const boardStr = this.boardToString(game);
        
        // Size-specific openings
        if (size === 7) {
            return this.getOpening7x7(game, moveCount, boardStr);
        } else if (size === 11) {
            return this.getOpening11x11(game, moveCount, boardStr);
        } else if (size === 13) {
            return this.getOpening13x13(game, moveCount, boardStr);
        }
        
        // Default: play near center
        return this.getDefaultOpening(game);
    }
    
    static boardToString(game) {
        return game.board.map(row => row.join('')).join('|');
    }
    
    static getOpening7x7(game, moveCount, boardStr) {
        const center = 3;
        
        if (moveCount === 0) {
            // First move: strong central positions (avoid exact center due to rule)
            // Weighted towards better positions
            const strongOpenings = [
                [2, 3], [3, 2], [3, 4], [4, 3], // Adjacent to center - very strong
                [2, 3], [3, 2], [3, 4], [4, 3], // Repeat for higher probability
            ];
            const goodOpenings = [
                [2, 2], [2, 4], [4, 2], [4, 4]  // Diagonal from center - still good
            ];
            const allOpenings = [...strongOpenings, ...goodOpenings];
            return allOpenings[Math.floor(Math.random() * allOpenings.length)];
        }
        
        // Response to opponent's moves
        if (moveCount === 1 && game.currentPlayer === PLAYER_BLUE) {
            const lastMove = game.history[0];
            const row = lastMove.row;
            const col = lastMove.col;
            
            // Play near opponent's stone to contest territory
            const strongResponses = [];
            
            // Get all adjacent cells
            const neighbors = game.getNeighbors(row, col);
            for (const [nr, nc] of neighbors) {
                if (game.isValidMove(nr, nc)) {
                    strongResponses.push([nr, nc]);
                }
            }
            
            // Also consider cells at distance 2 near center
            for (let dr = -2; dr <= 2; dr++) {
                for (let dc = -2; dc <= 2; dc++) {
                    const nr = row + dr;
                    const nc = col + dc;
                    const distToCenter = Math.abs(nr - center) + Math.abs(nc - center);
                    if (game.isValidMove(nr, nc) && distToCenter <= 2) {
                        strongResponses.push([nr, nc]);
                    }
                }
            }
            
            if (strongResponses.length > 0) {
                return strongResponses[Math.floor(Math.random() * strongResponses.length)];
            }
        }
        
        return null;
    }
    
    static getOpening11x11(game, moveCount, boardStr) {
        const center = 5;
        
        if (moveCount === 0) {
            // Prefer moves 1-2 hexes from center
            const goodOpenings = [
                [4, 5], [5, 4], [5, 6], [6, 5],
                [4, 4], [4, 6], [6, 4], [6, 6],
                [3, 5], [5, 3], [5, 7], [7, 5]
            ];
            return goodOpenings[Math.floor(Math.random() * goodOpenings.length)];
        }
        
        return null;
    }
    
    static getOpening13x13(game, moveCount, boardStr) {
        const center = 6;
        
        if (moveCount === 0) {
            const goodOpenings = [
                [5, 6], [6, 5], [6, 7], [7, 6],
                [5, 5], [5, 7], [7, 5], [7, 7]
            ];
            return goodOpenings[Math.floor(Math.random() * goodOpenings.length)];
        }
        
        return null;
    }
    
    static getDefaultOpening(game) {
        const center = Math.floor(game.size / 2);
        const offset = Math.floor(game.size / 6) || 1;
        
        const candidates = [];
        for (let dr = -offset; dr <= offset; dr++) {
            for (let dc = -offset; dc <= offset; dc++) {
                if (dr === 0 && dc === 0) continue; // Skip exact center
                const r = center + dr;
                const c = center + dc;
                if (game.isValidMove(r, c)) {
                    candidates.push([r, c]);
                }
            }
        }
        
        return candidates[Math.floor(Math.random() * candidates.length)] || null;
    }
    
    static getAdjacentMoves(game, row, col, maxDistance) {
        const moves = [];
        
        for (let dr = -maxDistance; dr <= maxDistance; dr++) {
            for (let dc = -maxDistance; dc <= maxDistance; dc++) {
                if (dr === 0 && dc === 0) continue;
                const r = row + dr;
                const c = col + dc;
                if (game.isValidMove(r, c)) {
                    const distance = Math.abs(dr) + Math.abs(dc);
                    if (distance <= maxDistance) {
                        moves.push([r, c]);
                    }
                }
            }
        }
        
        return moves;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HexEvaluator, HexOpeningBook };
}

