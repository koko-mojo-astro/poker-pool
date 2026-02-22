/* eslint-disable @typescript-eslint/no-explicit-any */
import { tx, id } from '@instantdb/react';
import { Deck } from './Deck';
import type { PairwiseSettlement, RoomConfig } from '../types';

export class GameEngine {

    static async startGame(db: any, roomData: any, initiatorId: string) {
        if (!roomData || roomData.status !== 'WAITING') return;
        const initiator = roomData.players.find((p: any) => p.id === initiatorId);
        if (!initiator || !initiator.isCreator) return;
        if (roomData.players.length < 2) return;

        // Shuffle players
        const players = [...roomData.players];
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }

        const deck = new Deck();
        const txs: any[] = [];

        // Distribute cards
        players.forEach((player) => {
            const hand = [];
            for (let i = 0; i < 7; i++) {
                const card = deck.draw();
                if (card) hand.push(card);
            }
            txs.push(tx.roomPlayers[player.id].update({ hand, cardCount: hand.length }));
        });

        const remainingDeck = [];
        let card = deck.draw();
        while (card) {
            remainingDeck.push(card);
            card = deck.draw();
        }

        txs.push(tx.rooms[roomData.id].update({
            status: 'PLAYING',
            deck: remainingDeck
        }));

        await db.transact(txs);
    }

    static async drawCard(db: any, roomData: any, playerId: string) {
        const player = roomData.players.find((p: any) => p.id === playerId);
        if (!player) return;

        const deck = [...roomData.deck];
        let cardToDraw = null;
        let found = false;
        let attempts = 0;

        while (attempts < 100 && deck.length > 0) {
            cardToDraw = deck.pop();
            if (cardToDraw && !(roomData.pottedCards || []).includes(cardToDraw.rank)) {
                found = true;
                break;
            }
            attempts++;
        }

        if (!found || !cardToDraw) return; // Error, no eligible cards

        const newHand = [...(player.hand || []), cardToDraw];

        await db.transact([
            tx.rooms[roomData.id].update({ deck }),
            tx.roomPlayers[playerId].update({ hand: newHand, cardCount: newHand.length })
        ]);
    }

    static async potCard(db: any, roomData: any, playerId: string, cardId: string) {
        const player = roomData.players.find((p: any) => p.id === playerId);
        if (!player || !player.hand) return;

        const cardIndex = player.hand.findIndex((c: any) => c.id === cardId);
        if (cardIndex === -1) return;

        const card = player.hand[cardIndex];
        const pottedRank = card.rank;
        const newHand = [...player.hand];
        newHand.splice(cardIndex, 1);

        const txs: any[] = [];

        // Grant license
        if (!player.hasLicense) {
            txs.push(tx.roomPlayers[playerId].update({ hasLicense: true }));
        }

        // Add to potted cards
        const newPottedCards = [...(roomData.pottedCards || [])];
        if (!newPottedCards.includes(pottedRank)) {
            newPottedCards.push(pottedRank);
            txs.push(tx.rooms[roomData.id].update({ pottedCards: newPottedCards }));
        }

        // Update hands of ALL players
        let someoneWon = false;
        let winningPlayerId: string | null = null;

        roomData.players.forEach((p: any) => {
            const currentHand = p.id === playerId ? newHand : (p.hand || []);
            const filteredHand = currentHand.filter((c: any) => c.rank !== pottedRank);

            txs.push(tx.roomPlayers[p.id].update({ hand: filteredHand, cardCount: filteredHand.length }));

            if (filteredHand.length === 0) {
                someoneWon = true;
                // If the potting player reduced their hand to 0, they win, otherwise whoever drops to 0 wins
                if (p.id === playerId) {
                    winningPlayerId = playerId;
                } else if (!winningPlayerId) {
                    winningPlayerId = p.id;
                }
            }
        });

        if (someoneWon && winningPlayerId) {
            // Compute settlements for history mapping
            const settlements = this.computeSettlements(roomData.players, winningPlayerId, roomData.config);
            const netChanges: Record<string, number> = {};
            roomData.players.forEach((p: any) => netChanges[p.id] = 0);

            settlements.forEach((s) => {
                netChanges[s.fromPlayerId] -= s.amount;
                netChanges[s.toPlayerId] += s.amount;
            });

            // Calculate new total settlements for the room
            const currentTotalSettlements = roomData.totalSettlements || {};
            const newTotalSettlements = { ...currentTotalSettlements };
            
            Object.entries(netChanges).forEach(([playerId, amount]) => {
                newTotalSettlements[playerId] = (newTotalSettlements[playerId] || 0) + amount;
            });

            txs.push(tx.rooms[roomData.id].update({ 
                status: 'FINISHED', 
                winnerId: winningPlayerId,
                totalSettlements: newTotalSettlements
            }));

            // Need winner name
            const winnerProfile = roomData.players.find((p: any) => p.id === winningPlayerId)?.profile;
            const winnerName = winnerProfile?.[0]?.displayName || winnerProfile?.displayName || 'Winner';

            const playerSnapshots = roomData.players.map((p: any) => ({
                id: p.id,
                name: p.profile?.[0]?.displayName || p.profile?.displayName || 'Player',
                directJ: p.jokerBalls?.direct || 0,
                allJ: p.jokerBalls?.all || 0,
                cardCount: p.id === playerId ? newHand.filter((c: any) => c.rank !== pottedRank).length : p.hand.filter((c: any) => c.rank !== pottedRank).length,
                hasLicense: p.id === playerId ? true : p.hasLicense
            }));

            // Record the match securely
            const matchId = id();
            txs.push(
                tx.matches[matchId].update({
                    winnerId: winningPlayerId,
                    winnerName,
                    timestamp: Date.now(),
                    netChanges,
                    playerSnapshots,
                    settlements
                }).link({ room: roomData.id }),
            );

            // Link profiles to match so history querying is easy
            roomData.players.forEach((p: any) => {
                const profileId = p.profile?.[0]?.id;
                if (profileId) txs.push(tx.matches[matchId].link({ players: profileId }));
            });
        }

        await db.transact(txs);
    }

    static async markFoul(db: any, roomData: any, playerId: string) {
        const player = roomData.players.find((p: any) => p.id === playerId);
        if (!player || !player.hasLicense) return;

        // Lose license
        const txs: any[] = [
            tx.roomPlayers[playerId].update({ hasLicense: false })
        ];

        // Try to draw penalty card
        const deck = [...(roomData.deck || [])];
        let cardToDraw = null;
        let found = false;

        while (deck.length > 0) {
            cardToDraw = deck.pop();
            if (cardToDraw && !(roomData.pottedCards || []).includes(cardToDraw.rank)) {
                found = true;
                break;
            }
        }

        if (found && cardToDraw) {
            const newHand = [...(player.hand || []), cardToDraw];
            txs.push(tx.rooms[roomData.id].update({ deck }));
            txs.push(tx.roomPlayers[playerId].update({ hand: newHand, cardCount: newHand.length }));
        }

        await db.transact(txs);
    }

    static async updateJokerCount(db: any, roomData: any, playerId: string, type: 'direct' | 'all', delta: 1 | -1) {
        const player = roomData.players.find((p: any) => p.id === playerId);
        if (!player) return;

        if (delta > 0 && !player.hasLicense) return;

        const currentVal = player.jokerBalls?.[type] || 0;
        const newVal = currentVal + delta;

        if (newVal < 0) return;

        await db.transact([
            tx.roomPlayers[playerId].update({
                jokerBalls: {
                    ...player.jokerBalls,
                    [type]: newVal
                }
            })
        ]);
    }

    static async restartGame(db: any, roomData: any, initiatorId: string) {
        if (!roomData || roomData.status !== 'FINISHED') return;
        const initiator = roomData.players.find((p: any) => p.id === initiatorId);
        if (!initiator || !initiator.isCreator) return;

        const txs = [
            tx.rooms[roomData.id].update({
                status: 'WAITING',
                deck: [],
                pottedCards: [],
                winnerId: null
            })
        ];

        roomData.players.forEach((p: any) => {
            txs.push(tx.roomPlayers[p.id].update({
                hand: [],
                hasLicense: false,
                jokerBalls: { direct: 0, all: 0 },
                cardCount: 0
            }));
        });

        await db.transact(txs);
    }

    static async exitRoom(db: any, _roomId: string, playerId: string) {
        // Technically, leaving the room means just deleting the roomPlayer relation
        // Or un-linking. Doing a cascade delete requires deleting the roomPlayers entity.
        await db.transact([
            tx.roomPlayers[playerId].delete()
        ]);
    }

    // Identical logic from RoomManager.ts to compute payouts accurately
    private static computeSettlements(players: any[], winnerId: string, config: RoomConfig): PairwiseSettlement[] {
        const { gameAmount, jokerAmount } = config;
        const numPlayers = players.length;

        const flows: Record<string, number> = {};
        const addFlow = (fromId: string, toId: string, amount: number) => {
            if (fromId === toId || amount <= 0) return;
            const key = `${fromId}->${toId}`;
            flows[key] = (flows[key] || 0) + amount;
        };

        const winner = players.find(p => p.id === winnerId)!;

        players.forEach(p => {
            if (p.id !== winnerId) addFlow(p.id, winnerId, gameAmount);
        });

        if (winner.jokerBalls?.all > 0) {
            players.forEach(p => {
                if (p.id !== winnerId) addFlow(p.id, winnerId, jokerAmount * winner.jokerBalls.all);
            });
        }

        players.forEach((p, idx) => {
            if (p.jokerBalls?.direct > 0) {
                const aboveIdx = (idx - 1 + numPlayers) % numPlayers;
                const abovePlayer = players[aboveIdx];
                const amount = jokerAmount * (numPlayers - 1) * p.jokerBalls.direct;
                addFlow(abovePlayer.id, p.id, amount);
            }
        });

        players.forEach(loser => {
            if (loser.id === winnerId) return;
            if (loser.jokerBalls?.all > 0) {
                players.forEach(otherLoser => {
                    if (otherLoser.id === winnerId || otherLoser.id === loser.id) return;
                    addFlow(otherLoser.id, loser.id, jokerAmount * loser.jokerBalls.all);
                });
            }
        });

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
}
