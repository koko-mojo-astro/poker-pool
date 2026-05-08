/* eslint-disable @typescript-eslint/no-explicit-any */
import { id, tx } from '@instantdb/react';
import { Deck } from './Deck';
import type { PairwiseSettlement, RoomConfig, VisitAction } from '../types';

export class GameEngine {
    private static cloneRoomData(roomData: any) {
        return JSON.parse(JSON.stringify({
            ...roomData,
            players: roomData?.players || [],
            pottedCards: roomData?.pottedCards || [],
            deck: roomData?.deck || [],
            turnOrder: roomData?.turnOrder || [],
        }));
    }

    private static drawEligibleCard(deckInput: any[], pottedCards: any[]) {
        const deck = [...(deckInput || [])];
        let cardToDraw = null;

        while (deck.length > 0) {
            const candidate = deck.pop();
            if (candidate && !(pottedCards || []).includes(candidate.rank)) {
                cardToDraw = candidate;
                break;
            }
        }

        return { deck, cardToDraw };
    }

    private static getPlayerProfileId(player: any): string | null {
        const profile = Array.isArray(player?.profile) ? player.profile?.[0] : player?.profile;
        return profile?.id || null;
    }

    private static getPlayersInTurnOrder(players: any[], turnOrder: any): any[] {
        if (!Array.isArray(players) || players.length === 0) return [];

        let order = turnOrder || [];
        if (!Array.isArray(order) && typeof order === 'object') {
            order = Object.values(order);
        }
        if (!Array.isArray(order) || order.length === 0) return [...players];

        const orderIndex = new Map(order.map((playerId: any, index: number) => [String(playerId), index]));
        return [...players].sort((a: any, b: any) => {
            const aIdx = orderIndex.get(String(a.id));
            const bIdx = orderIndex.get(String(b.id));
            return (aIdx ?? Number.MAX_SAFE_INTEGER) - (bIdx ?? Number.MAX_SAFE_INTEGER);
        });
    }

    private static getPlayerOrThrow(roomData: any, playerId: string) {
        const player = roomData.players.find((candidate: any) => candidate.id === playerId);
        if (!player) throw new Error('Player not found.');
        return player;
    }

    private static mapNetChangesToProfiles(players: any[], netChanges: Record<string, number>) {
        return players.reduce((acc: Record<string, number>, player: any) => {
            const profileId = this.getPlayerProfileId(player);
            if (!profileId) return acc;

            acc[profileId] = (acc[profileId] || 0) + (netChanges[player.id] || 0);
            return acc;
        }, {});
    }

    /**
     * Resolve who wins after visit actions have been applied.
     *
     * Normal self-win: actor's own hand is empty → actor wins, no license check.
     *
     * Non-actor zero-card case (actor still has cards after a POT_CARD visit):
     *   - If the zero-card player already holds a license → that player wins (cover-win).
     *   - If the zero-card player has no license → they are NOT declared the winner;
     *     instead `resolveNonActorZeroCardPenalty` draws two cards for them so the
     *     game continues (handled in commitVisit before this function is called again).
     *
     * Returns null when there is no winner yet.
     */
    private static resolveWinningPlayerId(roomData: any, actingPlayerId: string): string | null {
        const zeroCardPlayers = (roomData.players || []).filter((player: any) => (player.hand || []).length === 0);
        if (zeroCardPlayers.length === 0) return null;

        // Actor wins unconditionally when they clear their own hand.
        if (zeroCardPlayers.some((player: any) => player.id === actingPlayerId)) {
            return actingPlayerId;
        }

        // Non-actor reached zero cards. Only licensed players can be declared winner.
        const orderedPlayers = this.getPlayersInTurnOrder(roomData.players || [], roomData.turnOrder);
        const candidate =
            orderedPlayers.find((player: any) =>
                zeroCardPlayers.some((zeroPlayer: any) => zeroPlayer.id === player.id),
            ) || zeroCardPlayers[0];

        if (!candidate) return null;

        // License gate: unlicensed zero-card player cannot win here.
        // commitVisit handles giving them two penalty cards before calling this.
        return candidate.hasLicense ? candidate.id : null;
    }

    /**
     * Detect whether a non-actor player has been left at zero cards without a license.
     * When true, commitVisit must draw two cards for them before resolving a winner.
     * Only relevant for visits that include at least one POT_CARD action.
     */
    private static detectUnlicensedZeroCardPlayer(
        committedRoom: any,
        actingPlayerId: string,
        actions: VisitAction[],
    ): any | null {
        const hasPot = actions.some((a) => a.type === 'POT_CARD');
        if (!hasPot) return null;

        const actingPlayer = committedRoom.players.find((p: any) => p.id === actingPlayerId);
        if (!actingPlayer || (actingPlayer.hand || []).length === 0) return null; // actor self-wins, handled separately

        const nonActorAtZero = (committedRoom.players || []).find(
            (p: any) => p.id !== actingPlayerId && (p.hand || []).length === 0,
        );

        if (!nonActorAtZero) return null;

        // Only apply the penalty when the player does NOT have a license.
        return nonActorAtZero.hasLicense ? null : nonActorAtZero;
    }

    /**
     * Draw two eligible cards from the deck for a player who was left at zero cards
     * without a license. Mutates roomData in place (on the cloned snapshot).
     */
    private static applyUnlicensedZeroCardPenalty(roomData: any, penaltyPlayer: any): void {
        for (let i = 0; i < 2; i++) {
            const { deck, cardToDraw } = this.drawEligibleCard(roomData.deck || [], roomData.pottedCards || []);
            roomData.deck = deck;
            if (cardToDraw) {
                penaltyPlayer.hand = [...(penaltyPlayer.hand || []), cardToDraw];
                penaltyPlayer.cardCount = penaltyPlayer.hand.length;
            }
        }
    }

    private static applyPotAction(roomData: any, playerId: string, payload: { cardId?: string; rank?: string }) {
        const player = this.getPlayerOrThrow(roomData, playerId);
        const actorHand = [...(player.hand || [])];
        const cardId = payload?.cardId;
        const explicitRank = payload?.rank;
        let pottedRank: string | null = null;
        let actorBaseHand = actorHand;
        let actorHasPottedRank = false;

        if (cardId) {
            const cardIndex = actorHand.findIndex((card: any) => card.id === cardId);
            if (cardIndex === -1) throw new Error('That card is no longer in your hand.');
            pottedRank = actorHand[cardIndex].rank;
            actorHasPottedRank = true;
            actorBaseHand = [...actorHand];
            actorBaseHand.splice(cardIndex, 1);
        } else if (explicitRank) {
            pottedRank = explicitRank;
            actorHasPottedRank = actorHand.some((card: any) => card.rank === pottedRank);
        } else {
            throw new Error('Missing pot payload.');
        }

        if (!pottedRank) throw new Error('Unable to resolve potted rank.');
        if ((roomData.pottedCards || []).includes(pottedRank)) {
            throw new Error(`${pottedRank} has already been potted.`);
        }

        roomData.pottedCards = [...(roomData.pottedCards || []), pottedRank];

        if (actorHasPottedRank) {
            player.hasLicense = true;
        } else {
            player.hasLicense = false;
        }

        roomData.players.forEach((candidate: any) => {
            const currentHand = candidate.id === playerId ? actorBaseHand : (candidate.hand || []);
            const filteredHand = currentHand.filter((card: any) => card.rank !== pottedRank);
            candidate.hand = filteredHand;
            candidate.cardCount = filteredHand.length;
        });

        if (!actorHasPottedRank) {
            const { deck, cardToDraw } = this.drawEligibleCard(roomData.deck || [], roomData.pottedCards || []);
            roomData.deck = deck;

            if (cardToDraw) {
                player.hand = [...(player.hand || []), cardToDraw];
                player.cardCount = player.hand.length;
            }
        }
    }

    private static applyDrawAction(roomData: any, playerId: string) {
        const player = this.getPlayerOrThrow(roomData, playerId);
        if (player.hasLicense) throw new Error('Licensed players cannot draw.');

        const { deck, cardToDraw } = this.drawEligibleCard(roomData.deck || [], roomData.pottedCards || []);
        if (!cardToDraw) throw new Error('No eligible cards left to draw.');

        roomData.deck = deck;
        player.hand = [...(player.hand || []), cardToDraw];
        player.cardCount = player.hand.length;
    }

    private static applyMarkFoulAction(roomData: any, playerId: string) {
        const player = this.getPlayerOrThrow(roomData, playerId);
        if (!player.hasLicense) throw new Error('You need a license before marking a foul.');

        player.hasLicense = false;

        const { deck, cardToDraw } = this.drawEligibleCard(roomData.deck || [], roomData.pottedCards || []);
        roomData.deck = deck;

        if (cardToDraw) {
            player.hand = [...(player.hand || []), cardToDraw];
            player.cardCount = player.hand.length;
        }
    }

    private static applyJokerAction(
        roomData: any,
        playerId: string,
        payload: { type: 'direct' | 'all'; delta: 1 | -1 },
    ) {
        const player = this.getPlayerOrThrow(roomData, playerId);
        if (payload.delta > 0 && !player.hasLicense) {
            throw new Error('You need a license to add joker balls.');
        }

        const currentValue = player.jokerBalls?.[payload.type] || 0;
        player.jokerBalls = {
            ...player.jokerBalls,
            [payload.type]: currentValue + payload.delta,
        };

        // Minus joker while licensed: revoke license and draw one penalty card (mirrors foul behaviour)
        if (payload.delta === -1 && player.hasLicense) {
            player.hasLicense = false;

            const { deck, cardToDraw } = this.drawEligibleCard(roomData.deck || [], roomData.pottedCards || []);
            roomData.deck = deck;

            if (cardToDraw) {
                player.hand = [...(player.hand || []), cardToDraw];
                player.cardCount = player.hand.length;
            }
        }
    }

    static applyVisitActions(roomData: any, playerId: string, actions: VisitAction[]) {
        if (!roomData || roomData.status !== 'PLAYING') {
            throw new Error('Game is not in progress.');
        }

        const nextRoom = this.cloneRoomData(roomData);
        this.getPlayerOrThrow(nextRoom, playerId);

        actions.forEach((action) => {
            switch (action.type) {
                case 'POT_CARD':
                    this.applyPotAction(nextRoom, playerId, action.payload);
                    break;
                case 'DRAW_CARD':
                    this.applyDrawAction(nextRoom, playerId);
                    break;
                case 'MARK_FOUL':
                    this.applyMarkFoulAction(nextRoom, playerId);
                    break;
                case 'UPDATE_JOKER':
                    this.applyJokerAction(nextRoom, playerId, action.payload);
                    break;
            }
        });

        return nextRoom;
    }

    private static buildVisitCommitTxs(
        roomData: any,
        winningPlayerId: string | null,
        /**
         * Set when the acting player pots another player's last card while still
         * holding cards themselves (cover-win). All base-game payments are funnelled
         * through this player; joker rules are unaffected.
         */
        coverPlayerId?: string | null,
    ) {
        const txs: any[] = [];
        const roomUpdate: Record<string, unknown> = {
            pottedCards: roomData.pottedCards || [],
            deck: roomData.deck || [],
        };

        roomData.players.forEach((player: any) => {
            txs.push(tx.roomPlayers[player.id].update({
                hand: player.hand || [],
                cardCount: (player.hand || []).length,
                hasLicense: !!player.hasLicense,
                jokerBalls: player.jokerBalls || { direct: 0, all: 0 },
            }));
        });

        if (winningPlayerId) {
            const orderedPlayers = this.getPlayersInTurnOrder(roomData.players, roomData.turnOrder);
            const settlements = this.computeSettlements(
                orderedPlayers,
                winningPlayerId,
                roomData.config,
                coverPlayerId ?? null,
            );
            const netChanges: Record<string, number> = {};
            roomData.players.forEach((player: any) => {
                netChanges[player.id] = 0;
            });

            settlements.forEach((settlement) => {
                netChanges[settlement.fromPlayerId] -= settlement.amount;
                netChanges[settlement.toPlayerId] += settlement.amount;
            });

            const netChangesByProfile = this.mapNetChangesToProfiles(roomData.players, netChanges);
            const currentTotalSettlements = roomData.totalSettlements || {};
            const newTotalSettlements = { ...currentTotalSettlements };

            Object.entries(netChangesByProfile).forEach(([profileId, amount]) => {
                newTotalSettlements[profileId] = (newTotalSettlements[profileId] || 0) + amount;
            });

            roomUpdate.status = 'FINISHED';
            roomUpdate.winnerId = winningPlayerId;
            roomUpdate.totalSettlements = newTotalSettlements;

            const winnerProfile = roomData.players.find((player: any) => player.id === winningPlayerId)?.profile;
            const winnerName = winnerProfile?.[0]?.displayName || winnerProfile?.displayName || 'Winner';
            const playerSnapshots = roomData.players.map((player: any) => ({
                id: player.id,
                profileId: this.getPlayerProfileId(player),
                name: player.profile?.[0]?.displayName || player.profile?.displayName || 'Player',
                directJ: player.jokerBalls?.direct || 0,
                allJ: player.jokerBalls?.all || 0,
                cardCount: (player.hand || []).length,
                hasLicense: !!player.hasLicense,
            }));

            const matchId = id();
            txs.push(
                tx.matches[matchId].update({
                    winnerId: winningPlayerId,
                    winnerName,
                    timestamp: Date.now(),
                    roomCode: roomData.roomCode,
                    netChanges,
                    playerSnapshots,
                    settlements,
                }).link({ room: roomData.id }),
            );

            roomData.players.forEach((player: any) => {
                const profileId = Array.isArray(player.profile) ? player.profile?.[0]?.id : player.profile?.id;
                if (profileId) txs.push(tx.matches[matchId].link({ players: profileId }));
            });
        }

        txs.unshift(tx.rooms[roomData.id].update(roomUpdate));
        return txs;
    }

    static async startGame(db: any, roomData: any, initiatorId: string) {
        if (!roomData || roomData.status !== 'WAITING') return;
        const initiator = roomData.players.find((player: any) => player.id === initiatorId);
        if (!initiator || !initiator.isCreator) return;
        if (roomData.players.length < 2) return;

        const players = [...roomData.players];
        for (let i = players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [players[i], players[j]] = [players[j], players[i]];
        }

        const deck = new Deck();
        const txs: any[] = [];

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
            deck: remainingDeck,
            turnOrder: players.map((player) => player.id),
            winnerId: null,
        }));

        await db.transact(txs);
    }

    static async commitVisit(db: any, roomData: any, playerId: string, actions: VisitAction[]) {
        if (!actions.length) return;
        const committedRoom = this.applyVisitActions(roomData, playerId, actions);

        // Before resolving a winner, check whether a non-actor player reached zero
        // cards without a license. If so, deal them two cards so they stay in the
        // game. This mutates committedRoom in place and prevents them being resolved
        // as the winner in the following step.
        const unlicensedPenaltyPlayer = this.detectUnlicensedZeroCardPlayer(committedRoom, playerId, actions);
        if (unlicensedPenaltyPlayer) {
            this.applyUnlicensedZeroCardPenalty(committedRoom, unlicensedPenaltyPlayer);
        }

        const winningPlayerId = this.resolveWinningPlayerId(committedRoom, playerId);

        // Detect cover-win: actor still has cards, but another (licensed) player won
        // with exactly one card remaining before this visit. The one-card guard is
        // critical: applyPotAction strips all copies of a rank at once, so a player
        // holding two cards of the same rank can reach zero in a single pot. That
        // scenario is a normal win, not a cover-win — the actor did not clear
        // someone's "last ball" in the traditional sense.
        const actorHasCards =
            (committedRoom.players.find((p: any) => p.id === playerId)?.hand || []).length > 0;
        const winnerPreCommitCardCount =
            winningPlayerId !== null
                ? (roomData.players.find((p: any) => p.id === winningPlayerId)?.hand || []).length
                : 0;
        const isCoverWin =
            winningPlayerId !== null &&
            winningPlayerId !== playerId &&
            actorHasCards &&
            winnerPreCommitCardCount === 1 &&
            actions.some((a) => a.type === 'POT_CARD');

        await db.transact(
            this.buildVisitCommitTxs(committedRoom, winningPlayerId, isCoverWin ? playerId : null),
        );
    }

    static async restartGame(db: any, roomData: any, initiatorId: string) {
        if (!roomData || roomData.status !== 'FINISHED') return;
        const initiator = roomData.players.find((player: any) => player.id === initiatorId);
        if (!initiator || !initiator.isCreator) return;

        const txs = [
            tx.rooms[roomData.id].update({
                status: 'WAITING',
                deck: [],
                pottedCards: [],
                winnerId: null,
                turnOrder: [],
            }),
        ];

        roomData.players.forEach((player: any) => {
            txs.push(tx.roomPlayers[player.id].update({
                hand: [],
                hasLicense: false,
                jokerBalls: { direct: 0, all: 0 },
                cardCount: 0,
            }));
        });

        await db.transact(txs);
    }

    static async exitRoom(db: any, roomData: any, playerId: string) {
        if (!roomData) return;
        const player = roomData.players?.find((candidate: any) => candidate.id === playerId);

        if (player?.isCreator) {
            const txs: any[] = (roomData.players || []).map((candidate: any) => tx.roomPlayers[candidate.id].delete());
            txs.push(tx.rooms[roomData.id].delete());
            await db.transact(txs);
        } else {
            await db.transact([
                tx.roomPlayers[playerId].delete(),
            ]);
        }
    }

    /**
     * Compute settlements for a game foul scenario:
     * - No winner; the foul player pays gameAmount to EACH other player (reversed base game).
     * - Joker settlements proceed normally (turn-order rules) but without a winner bonus.
     *   DIRECT jokers: player above in turn order pays jokerAmount × (numPlayers - 1) × directCount.
     *   ALL jokers: each player with ALL jokers collects jokerAmount × allCount from every other player.
     */
    private static computeGameFoulSettlements(
        players: any[],
        foulPlayerId: string,
        config: RoomConfig,
    ): PairwiseSettlement[] {
        const { gameAmount, jokerAmount } = config;
        const numPlayers = players.length;

        const flows: Record<string, number> = {};
        const addFlow = (fromId: string, toId: string, amount: number) => {
            if (fromId === toId || amount <= 0) return;
            const key = `${fromId}->${toId}`;
            flows[key] = (flows[key] || 0) + amount;
        };
        const addSignedFlow = (fromId: string, toId: string, signedAmount: number) => {
            if (!signedAmount) return;
            if (signedAmount > 0) { addFlow(fromId, toId, signedAmount); return; }
            addFlow(toId, fromId, Math.abs(signedAmount));
        };

        // --- Base game (reversed): foul player pays gameAmount to each other player ---
        players.forEach(p => {
            if (p.id !== foulPlayerId) addFlow(foulPlayerId, p.id, gameAmount);
        });

        // --- Joker settlements (no winner, all players treated equally) ---

        // DIRECT jokers: player's direct count → player above in turn order pays
        players.forEach((p, idx) => {
            const directCount = p.jokerBalls?.direct || 0;
            if (directCount === 0) return;
            const aboveIdx = (idx - 1 + numPlayers) % numPlayers;
            const abovePlayer = players[aboveIdx];
            const signedAmount = jokerAmount * (numPlayers - 1) * directCount;
            addSignedFlow(abovePlayer.id, p.id, signedAmount);
        });

        // ALL jokers: each player with ALL jokers collects from each other player
        players.forEach(p => {
            const allCount = p.jokerBalls?.all || 0;
            if (allCount === 0) return;
            if (allCount > 0) {
                players.forEach(other => {
                    if (other.id === p.id) return;
                    addFlow(other.id, p.id, jokerAmount * allCount);
                });
            } else {
                // Negative ALL jokers: pay each other player
                players.forEach(other => {
                    if (other.id === p.id) return;
                    addSignedFlow(other.id, p.id, jokerAmount * allCount);
                });
            }
        });

        // Pairwise netting
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
                    breakdown: parts.join(' ') || `$${absNet.toFixed(2)}`,
                });
            }
        });

        return settlements;
    }

    /**
     * Ends the game as a game foul by foulPlayerId.
     * The foul player is saved as winnerId (real ID) with isGameFoul=true.
     * Settlements are reversed: foul player pays gameAmount to each other player.
     * Jokers are settled as usual.
     */
    static async commitGameFoul(db: any, roomData: any, foulPlayerId: string) {
        if (!roomData || roomData.status !== 'PLAYING') return;
        const foulPlayer = roomData.players.find((p: any) => p.id === foulPlayerId);
        if (!foulPlayer) return;

        const orderedPlayers = this.getPlayersInTurnOrder(roomData.players, roomData.turnOrder);
        const settlements = this.computeGameFoulSettlements(orderedPlayers, foulPlayerId, roomData.config);

        // Compute net changes per roomPlayer id
        const netChanges: Record<string, number> = {};
        roomData.players.forEach((p: any) => { netChanges[p.id] = 0; });
        settlements.forEach(s => {
            netChanges[s.fromPlayerId] -= s.amount;
            netChanges[s.toPlayerId] += s.amount;
        });

        // Map to profile IDs for totalSettlements
        const netChangesByProfile = this.mapNetChangesToProfiles(roomData.players, netChanges);
        const currentTotalSettlements = roomData.totalSettlements || {};
        const newTotalSettlements = { ...currentTotalSettlements };
        Object.entries(netChangesByProfile).forEach(([profileId, amount]) => {
            newTotalSettlements[profileId] = (newTotalSettlements[profileId] || 0) + amount;
        });

        const foulPlayerProfile = foulPlayer?.profile;
        const foulPlayerName =
            foulPlayerProfile?.[0]?.displayName || foulPlayerProfile?.displayName || 'Player';

        const playerSnapshots = roomData.players.map((player: any) => ({
            id: player.id,
            profileId: this.getPlayerProfileId(player),
            name: player.profile?.[0]?.displayName || player.profile?.displayName || 'Player',
            directJ: player.jokerBalls?.direct || 0,
            allJ: player.jokerBalls?.all || 0,
            cardCount: (player.hand || []).length,
            hasLicense: !!player.hasLicense,
        }));

        const txs: any[] = [];

        // Update room state
        txs.push(tx.rooms[roomData.id].update({
            status: 'FINISHED',
            winnerId: foulPlayerId,
            isGameFoul: true,
            totalSettlements: newTotalSettlements,
        }));

        // Record match
        const matchId = id();
        txs.push(
            tx.matches[matchId].update({
                winnerId: foulPlayerId,
                winnerName: foulPlayerName,
                isGameFoul: true,
                timestamp: Date.now(),
                roomCode: roomData.roomCode,
                netChanges,
                playerSnapshots,
                settlements,
            }).link({ room: roomData.id }),
        );

        // Link all players' profiles to the match
        roomData.players.forEach((player: any) => {
            const profileId = Array.isArray(player.profile) ? player.profile?.[0]?.id : player.profile?.id;
            if (profileId) txs.push(tx.matches[matchId].link({ players: profileId }));
        });

        await db.transact(txs);
    }

    private static computeSettlements(
        players: any[],
        winnerId: string,
        config: RoomConfig,
        /**
         * Cover-win: when set, ALL base-game payments from non-winner players are
         * funnelled through this player instead of paid directly by each loser.
         * Joker settlements are computed normally and are unaffected by this parameter.
         */
        coverPlayerId: string | null = null,
    ): PairwiseSettlement[] {
        const { gameAmount, jokerAmount } = config;
        const numPlayers = players.length;

        const flows: Record<string, number> = {};
        const addFlow = (fromId: string, toId: string, amount: number) => {
            if (fromId === toId || amount <= 0) return;
            const key = `${fromId}->${toId}`;
            flows[key] = (flows[key] || 0) + amount;
        };
        const addSignedFlow = (fromId: string, toId: string, signedAmount: number) => {
            if (!signedAmount) return;

            if (signedAmount > 0) {
                addFlow(fromId, toId, signedAmount);
                return;
            }

            addFlow(toId, fromId, Math.abs(signedAmount));
        };

        const winner = players.find(p => p.id === winnerId)!;

        if (coverPlayerId && coverPlayerId !== winnerId) {
            // Cover-win: the acting player fully absorbs ALL base-game losses.
            // They pay the winner once for every non-winner player (including themselves).
            // Other non-winners are exempt from base-game payments entirely — there is
            // no reimbursement flow back to the cover player.
            const nonWinners = players.filter(p => p.id !== winnerId);
            const totalCoverAmount = gameAmount * nonWinners.length;
            addFlow(coverPlayerId, winnerId, totalCoverAmount);
        } else {
            players.forEach(p => {
                if (p.id !== winnerId) addFlow(p.id, winnerId, gameAmount);
            });
        }

        const winnerAll = winner.jokerBalls?.all || 0;
        players.forEach(p => {
            if (p.id !== winnerId) {
                addSignedFlow(p.id, winnerId, jokerAmount * winnerAll);
            }
        });

        players.forEach((p, idx) => {
            const directCount = p.jokerBalls?.direct || 0;
            const aboveIdx = (idx - 1 + numPlayers) % numPlayers;
            const abovePlayer = players[aboveIdx];
            const signedAmount = jokerAmount * (numPlayers - 1) * directCount;
            addSignedFlow(abovePlayer.id, p.id, signedAmount);
        });

        players.forEach(loser => {
            if (loser.id === winnerId) return;
            const loserAll = loser.jokerBalls?.all || 0;
            if (loserAll > 0) {
                players.forEach(otherLoser => {
                    if (otherLoser.id === winnerId || otherLoser.id === loser.id) return;
                    addFlow(otherLoser.id, loser.id, jokerAmount * loserAll);
                });
                return;
            }

            if (loserAll < 0) {
                players.forEach(otherPlayer => {
                    if (otherPlayer.id === loser.id) return;
                    addSignedFlow(otherPlayer.id, loser.id, jokerAmount * loserAll);
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
