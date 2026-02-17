import { Room, ServerPlayer } from './types';
import { Player, GameState, RoomConfig, Card, PairwiseSettlement, PayoutInfo } from '../../shared/types';
import { Deck } from './Deck';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';

export class RoomManager {
    private rooms: Map<string, Room> = new Map();

    constructor() { }

    createRoom(config: RoomConfig, creatorName: string, socket: WebSocket): { room: Room, player: ServerPlayer } {
        const roomId = this.generateRoomId();
        const creatorId = uuidv4();

        const creator: ServerPlayer = {
            id: creatorId,
            name: creatorName,
            hand: [],
            hasLicense: false,
            jokerBalls: { direct: 0, all: 0 },
            isCreator: true,
            isConnected: true,
            cardCount: 0,
            socket
        };

        const room: Room = {
            id: roomId,
            config,
            players: [creator],
            status: 'WAITING',
            deck: [],
            pottedCards: [],
            winnerId: null,
            history: []
        };

        this.rooms.set(roomId, room);
        return { room, player: creator };
    }

    joinRoom(roomId: string, playerName: string, socket: WebSocket): { room: Room | null, player: ServerPlayer | null, error?: string } {
        const room = this.rooms.get(roomId);

        if (!room) {
            return { room: null, player: null, error: 'Room not found' };
        }

        if (room.players.length >= 4) {
            return { room: null, player: null, error: 'Room is full' };
        }

        if (room.status !== 'WAITING') {
            return { room: null, player: null, error: 'Game already started' };
        }

        const playerId = uuidv4();
        const newPlayer: ServerPlayer = {
            id: playerId,
            name: playerName,
            hand: [],
            hasLicense: false,
            jokerBalls: { direct: 0, all: 0 },
            isCreator: false,
            isConnected: true,
            cardCount: 0,
            socket
        };

        room.players.push(newPlayer);
        return { room, player: newPlayer };
    }

    reconnectPlayer(roomId: string, playerId: string, socket: WebSocket): { success: boolean, room?: Room, player?: ServerPlayer, error?: string } {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };

        const player = room.players.find(p => p.id === playerId);
        if (!player) return { success: false, error: 'Player not found in room' };

        player.socket = socket;
        player.isConnected = true;

        return { success: true, room, player };
    }

    removePlayer(roomId: string, playerId: string): { success: boolean, room?: Room, error?: string } {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };

        room.players = room.players.filter(p => p.id !== playerId);
        return { success: true, room };
    }

    deleteRoom(roomId: string): boolean {
        return this.rooms.delete(roomId);
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    startGame(roomId: string, initiatorId: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== 'WAITING') return null;

        const initiator = room.players.find(p => p.id === initiatorId);
        if (!initiator || !initiator.isCreator) return null;

        if (room.players.length < 2) return null;

        // Randomize turn order by shuffling players using Fisher-Yates
        const players = room.players;
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = players[i];
            players[i] = players[j];
            players[j] = temp;
        }

        const deck = new Deck();

        // Deal 7 cards
        room.players.forEach(player => {
            player.hand = [];
            for (let i = 0; i < 7; i++) {
                const card = deck.draw();
                if (card) {
                    player.hand.push(card);
                }
            }
        });

        // Remainder to deck
        room.deck = [];
        let card = deck.draw();
        while (card) {
            room.deck.push(card);
            card = deck.draw();
        }

        room.status = 'PLAYING';
        return room;
    }

    /**
     * Compute pairwise settlements between all players.
     * Rules:
     * 1. Game base: each loser pays winner gameAmount
     * 2. Winner's All J: each loser pays winner jokerAmount * winner.allJ
     * 3. Any player's Direct J: "above" player pays jokerAmount * (numPlayers-1) * directJ
     * 4. Loser's All J: each other loser pays jokerAmount * allJ (winner doesn't pay)
     */
    private computeSettlements(players: ServerPlayer[], winnerId: string, config: RoomConfig): PairwiseSettlement[] {
        const { gameAmount, jokerAmount } = config;
        const numPlayers = players.length;

        // Accumulate raw flows: key = "fromId->toId", value = amount
        const flows: Record<string, number> = {};
        const addFlow = (fromId: string, toId: string, amount: number) => {
            if (fromId === toId || amount <= 0) return;
            const key = `${fromId}->${toId}`;
            flows[key] = (flows[key] || 0) + amount;
        };

        const winner = players.find(p => p.id === winnerId)!;

        // Rule 1: Game base — losers pay winner
        players.forEach(p => {
            if (p.id !== winnerId) {
                addFlow(p.id, winnerId, gameAmount);
            }
        });

        // Rule 2: Winner's All J — losers pay winner
        if (winner.jokerBalls.all > 0) {
            players.forEach(p => {
                if (p.id !== winnerId) {
                    addFlow(p.id, winnerId, jokerAmount * winner.jokerBalls.all);
                }
            });
        }

        // Rule 3: Any player's Direct J — "above" player pays
        // "Above" = previous player in turn order (circular)
        players.forEach((p, idx) => {
            if (p.jokerBalls.direct > 0) {
                const aboveIdx = (idx - 1 + numPlayers) % numPlayers;
                const abovePlayer = players[aboveIdx];
                const amount = jokerAmount * (numPlayers - 1) * p.jokerBalls.direct;
                addFlow(abovePlayer.id, p.id, amount);
            }
        });

        // Rule 4: Loser's All J — other losers pay (winner doesn't pay)
        players.forEach(loser => {
            if (loser.id === winnerId) return;
            if (loser.jokerBalls.all > 0) {
                players.forEach(otherLoser => {
                    if (otherLoser.id === winnerId || otherLoser.id === loser.id) return;
                    addFlow(otherLoser.id, loser.id, jokerAmount * loser.jokerBalls.all);
                });
            }
        });

        // Net each pair
        const settlements: PairwiseSettlement[] = [];
        const processed = new Set<string>();

        Object.keys(flows).forEach(key => {
            const [fromId, toId] = key.split('->');
            const pairKey = [fromId, toId].sort().join('|');
            if (processed.has(pairKey)) return;
            processed.add(pairKey);

            const aToB = flows[`${fromId}->${toId}`] || 0;
            const bToA = flows[`${toId}->${fromId}`] || 0;
            const net = aToB - bToA;

            if (Math.abs(net) > 0.001) {
                const actualFrom = net > 0 ? fromId : toId;
                const actualTo = net > 0 ? toId : fromId;
                const absNet = Math.abs(net);

                // Build breakdown string
                const parts: string[] = [];
                const fwd = flows[`${actualFrom}->${actualTo}`] || 0;
                const rev = flows[`${actualTo}->${actualFrom}`] || 0;
                if (fwd > 0) parts.push(`$${fwd.toFixed(2)}`);
                if (rev > 0) parts.push(`−$${rev.toFixed(2)} offset`);

                settlements.push({
                    fromPlayerId: actualFrom,
                    toPlayerId: actualTo,
                    amount: Math.round(absNet * 100) / 100,
                    breakdown: parts.join(' ') || `$${absNet.toFixed(2)}`
                });
            }
        });

        return settlements;
    }

    getPublicState(room: Room): GameState {
        let payouts: PayoutInfo[] | undefined;
        let settlements: PairwiseSettlement[] | undefined;

        if (room.status === 'FINISHED' && room.winnerId) {
            const winner = room.players.find(p => p.id === room.winnerId);
            if (winner) {
                // Compute pairwise settlements
                settlements = this.computeSettlements(room.players, room.winnerId, room.config);

                // Also compute legacy payouts for backward compat
                const { gameAmount, jokerAmount } = room.config;
                payouts = room.players.filter(p => p.id !== room.winnerId).map(loser => {
                    // Sum all settlements where this loser pays
                    const totalOwed = settlements!.filter(s => s.fromPlayerId === loser.id)
                        .reduce((sum, s) => sum + s.amount, 0);
                    const totalReceived = settlements!.filter(s => s.toPlayerId === loser.id)
                        .reduce((sum, s) => sum + s.amount, 0);
                    return {
                        playerId: loser.id,
                        amountToPay: Math.round((totalOwed - totalReceived) * 100) / 100,
                        calculation: `Net of all settlements`
                    };
                });
            }
        }

        return {
            roomId: room.id,
            config: room.config,
            status: room.status,
            players: room.players.map(p => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { socket, ...rest } = p;
                return { ...rest, cardCount: p.hand.length } as Player;
            }),
            pottedCards: room.pottedCards,
            deckCount: room.deck.length,
            winnerId: room.winnerId,
            payouts,
            settlements,
            history: room.history
        };
    }

    drawCard(roomId: string, playerId: string): { success: boolean, card?: Card, error?: string } {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };

        const player = room.players.find(p => p.id === playerId);
        if (!player) return { success: false, error: 'Player not found' };

        let card: Card | undefined;
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            if (room.deck.length === 0) {
                return { success: false, error: 'No eligible cards remaining in deck' };
            }

            card = room.deck.pop();

            if (card) {
                if (!room.pottedCards.includes(card.rank)) {
                    player.hand.push(card);
                    return { success: true, card };
                } else {
                    // Discarded
                }
            }
            attempts++;
        }
        return { success: false, error: 'Failed to find eligible card' };
    }

    potCard(roomId: string, playerId: string, cardId: string): { success: boolean, error?: string } {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };

        const player = room.players.find(p => p.id === playerId);
        if (!player) return { success: false, error: 'Player not found' };

        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) return { success: false, error: 'Card not in hand' };

        const card = player.hand[cardIndex];
        const pottedRank = card.rank;

        // 1. Remove from potting player
        player.hand.splice(cardIndex, 1);

        // 2. Grant license ONLY to potting player
        if (!player.hasLicense) {
            player.hasLicense = true;
        }

        // 3. Add to shared potted list
        if (!room.pottedCards.includes(pottedRank)) {
            room.pottedCards.push(pottedRank);
        }

        // 4. Remove matching cards from ALL players
        room.players.forEach(p => {
            p.hand = p.hand.filter(c => c.rank !== pottedRank);
        });

        // 5. Check Win Condition
        const winners = room.players.filter(p => p.hand.length === 0);
        if (winners.length > 0) {
            if (player.hand.length === 0) {
                room.winnerId = player.id;
            } else if (winners.length > 0) {
                room.winnerId = winners[0].id;
            }

            if (room.winnerId) {
                const winner = room.players.find(p => p.id === room.winnerId);
                if (winner) {
                    // Calculate settlements using the 4-rule engine
                    const settlements = this.computeSettlements(room.players, room.winnerId, room.config);

                    const netChanges: Record<string, number> = {};
                    room.players.forEach(p => netChanges[p.id] = 0);

                    settlements.forEach(s => {
                        netChanges[s.fromPlayerId] -= s.amount;
                        netChanges[s.toPlayerId] += s.amount;
                    });

                    // Save player snapshots for history display
                    const playerSnapshots = room.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        directJ: p.jokerBalls.direct,
                        allJ: p.jokerBalls.all,
                        cardCount: p.hand.length,
                        hasLicense: p.hasLicense
                    }));

                    room.history.push({
                        winnerId: winner.id,
                        winnerName: winner.name,
                        timestamp: Date.now(),
                        netChanges,
                        playerSnapshots,
                        settlements
                    });
                }
            }

            room.status = 'FINISHED';
        }

        return { success: true };
    }

    markFoul(roomId: string, playerId: string): { success: boolean, error?: string } {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };

        const player = room.players.find(p => p.id === playerId);
        if (!player) return { success: false, error: 'Player not found' };

        if (!player.hasLicense) return { success: false, error: 'Player does not have license' };

        // 1. Remove License
        player.hasLicense = false;

        // 2. Draw a card (penalty)
        // Reuse drawCard logic.
        // But drawCard checks deck emptiness.
        // If deck empty, what happens? Typically just lose license. 
        // Let's try to draw.
        this.drawCard(roomId, playerId); // Ignore return value, if it fails, it fails.

        return { success: true };
    }

    updateJokerCount(roomId: string, playerId: string, type: 'direct' | 'all', delta: 1 | -1): { success: boolean, error?: string } {
        const room = this.rooms.get(roomId);
        if (!room) return { success: false, error: 'Room not found' };

        const player = room.players.find(p => p.id === playerId);
        if (!player) return { success: false, error: 'Player not found' };

        // Check license for increment
        if (delta > 0 && !player.hasLicense) {
            return { success: false, error: 'License required to increment' };
        }

        const currentVal = player.jokerBalls[type];
        const newVal = currentVal + delta;

        if (newVal < 0) return { success: false, error: 'Cannot go below zero' };

        player.jokerBalls[type] = newVal;
        return { success: true };
    }

    restartGame(roomId: string, initiatorId: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== 'FINISHED') return null;

        const initiator = room.players.find(p => p.id === initiatorId);
        if (!initiator || !initiator.isCreator) return null;

        // Reset game state
        room.status = 'WAITING';
        room.deck = [];
        room.pottedCards = [];
        room.winnerId = null;
        room.players.forEach(p => {
            p.hand = [];
            p.hasLicense = false;
            p.jokerBalls = { direct: 0, all: 0 };
            p.cardCount = 0;
        });

        return room;
    }

    private generateRoomId(): string {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (this.rooms.has(result)) {
            return this.generateRoomId();
        }
        return result;
    }
}
