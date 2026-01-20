import { Room, ServerPlayer } from './types';
import { Player, GameState, RoomConfig, Card } from '../../shared/types';
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

    getPublicState(room: Room): GameState {
        let payouts;
        if (room.status === 'FINISHED' && room.winnerId) {
            const winner = room.players.find(p => p.id === room.winnerId);
            if (winner) {
                const { gameAmount, jokerAmount } = room.config;
                const winnerIndex = room.players.findIndex(p => p.id === room.winnerId);
                const previousPlayerIndex = (winnerIndex - 1 + room.players.length) % room.players.length;
                const previousPlayer = room.players[previousPlayerIndex];

                payouts = room.players.filter(p => p.id !== room.winnerId).map(loser => {
                    let totalOwed = gameAmount;
                    let calcString = `${gameAmount.toFixed(2)} (Game)`;

                    // All Joker: Everyone pays
                    if (winner.jokerBalls.all > 0) {
                        const allCost = winner.jokerBalls.all * jokerAmount;
                        totalOwed += allCost;
                        calcString += ` + ${allCost.toFixed(2)} (All J)`;
                    }

                    // Direct Joker: Only Previous Player pays
                    if (loser.id === previousPlayer.id && winner.jokerBalls.direct > 0) {
                        const directCost = winner.jokerBalls.direct * jokerAmount;
                        totalOwed += directCost;
                        calcString += ` + ${directCost.toFixed(2)} (Direct J)`;
                    }

                    return {
                        playerId: loser.id,
                        amountToPay: totalOwed,
                        calculation: calcString
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
                    // Calculate Payouts for History
                    const { gameAmount, jokerAmount } = room.config;
                    const winnerIndex = room.players.findIndex(p => p.id === room.winnerId);
                    const previousPlayerIndex = (winnerIndex - 1 + room.players.length) % room.players.length;
                    const previousPlayer = room.players[previousPlayerIndex];

                    const netChanges: Record<string, number> = {};

                    // Initialize 0 for everyone
                    room.players.forEach(p => netChanges[p.id] = 0);

                    room.players.forEach(p => {
                        if (p.id === room.winnerId) return; // Skip winner processing loop

                        let lostAmount = gameAmount;

                        // All Joker
                        if (winner.jokerBalls.all > 0) {
                            lostAmount += winner.jokerBalls.all * jokerAmount;
                        }

                        // Direct Joker (Only if previous player)
                        if (p.id === previousPlayer.id && winner.jokerBalls.direct > 0) {
                            lostAmount += winner.jokerBalls.direct * jokerAmount;
                        }

                        netChanges[p.id] -= lostAmount;
                        netChanges[room.winnerId!] += lostAmount;
                    });

                    room.history.push({
                        winnerId: winner.id,
                        winnerName: winner.name,
                        timestamp: Date.now(),
                        netChanges
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
