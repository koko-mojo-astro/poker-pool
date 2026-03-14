/* @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from './GameScreen';
import { ToastProvider } from './Toast';
import { AlertProvider } from './AlertContext';
import type { Card, GameState, Rank, VisitAction } from '../types';

function makeCard(rank: Rank, id: string): Card {
    return { rank, suit: 'spades', id };
}

function createGameState(myHand: Card[], pottedCards: Rank[] = [], stagedVisitActions: VisitAction[] = []): GameState {
    return {
        roomId: 'ROOM1234',
        config: { gameAmount: 10, jokerAmount: 2 },
        status: 'PLAYING',
        pottedCards,
        deckCount: 30,
        winnerId: null,
        stagedVisitActions,
        players: [
            {
                id: 'p1',
                profileId: 'profile-1',
                name: 'You',
                hand: myHand,
                hasLicense: false,
                jokerBalls: { direct: 0, all: 0 },
                isCreator: true,
                isConnected: true,
                cardCount: myHand.length
            },
            {
                id: 'p2',
                profileId: 'profile-2',
                name: 'Opponent',
                hand: [],
                hasLicense: false,
                jokerBalls: { direct: 0, all: 0 },
                isCreator: false,
                isConnected: true,
                cardCount: 4
            }
        ],
        history: []
    };
}

function renderGameScreen(state: GameState, sendMessage = vi.fn()) {
    render(
        <AlertProvider>
            <ToastProvider>
                <GameScreen gameState={state} playerId="p1" sendMessage={sendMessage} />
            </ToastProvider>
        </AlertProvider>
    );
    return { sendMessage };
}

describe('GameScreen batched visit flow', () => {
    it('opens wrong-ball modal from trigger button', () => {
        const state = createGameState([makeCard('A', 'a1')]);
        renderGameScreen(state);

        fireEvent.click(screen.getByRole('button', { name: 'Wrong Ball' }));
        expect(screen.getByText('WRONG-BALL POT')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Pot Wrong Ball' })).toBeTruthy();
    });

    it('filters modal rank options by hand and potted ranks', () => {
        const state = createGameState([makeCard('A', 'a1'), makeCard('2', 'c2')], ['K']);
        renderGameScreen(state);

        fireEvent.click(screen.getByRole('button', { name: 'Wrong Ball' }));

        expect(screen.queryByRole('button', { name: 'A' })).toBeNull();
        expect(screen.queryByRole('button', { name: '2' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'K' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Q' })).toBeTruthy();
    });

    it('stages selected wrong-ball rank and closes modal', async () => {
        const state = createGameState([makeCard('A', 'a1')]);
        const { sendMessage } = renderGameScreen(state);

        fireEvent.click(screen.getByRole('button', { name: 'Wrong Ball' }));
        fireEvent.click(screen.getByRole('button', { name: 'Q' }));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Pot Wrong Ball' }));
        });

        expect(sendMessage).toHaveBeenCalledWith({ type: 'POT_CARD', payload: { rank: 'Q' } });
        expect(screen.queryByText('WRONG-BALL POT')).toBeNull();
    });

    it('disables wrong-ball confirm when no ranks remain', () => {
        const fullHand = (['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as Rank[])
            .map((rank, idx) => makeCard(rank, `card-${idx}`));
        const state = createGameState(fullHand);
        renderGameScreen(state);

        fireEvent.click(screen.getByRole('button', { name: 'Wrong Ball' }));

        expect(screen.getByText('No eligible wrong-ball ranks left.')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Pot Wrong Ball' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('shows staged draft actions in the draft panel', () => {
        const state = createGameState(
            [makeCard('2', 'c2')],
            ['A'],
            [
                { type: 'POT_CARD', payload: { cardId: 'a1' } },
                { type: 'POT_CARD', payload: { cardId: 'c2' } },
            ],
        );
        renderGameScreen(state);

        expect(screen.getByText('2 ACTIONS STAGED')).toBeTruthy();
        expect(screen.getByText('Pot card')).toBeTruthy();
    });

    it('sends COMMIT_VISIT when the draft is committed', async () => {
        const state = createGameState(
            [makeCard('2', 'c2')],
            [],
            [{ type: 'POT_CARD', payload: { cardId: 'c2' } }],
        );
        const { sendMessage } = renderGameScreen(state);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
        });

        expect(sendMessage).toHaveBeenCalledWith({ type: 'COMMIT_VISIT' });
    });

    it('sends undo and clear draft actions', () => {
        const state = createGameState(
            [makeCard('2', 'c2')],
            [],
            [{ type: 'POT_CARD', payload: { cardId: 'c2' } }],
        );
        const { sendMessage } = renderGameScreen(state);

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

        expect(sendMessage).toHaveBeenNthCalledWith(1, { type: 'UNDO_VISIT_ACTION' });
        expect(sendMessage).toHaveBeenNthCalledWith(2, { type: 'CLEAR_VISIT_DRAFT' });
    });

    it('keeps gameplay controls available without turn gating', () => {
        const state = createGameState([makeCard('A', 'a1')]);
        renderGameScreen(state);

        expect((screen.getByRole('button', { name: 'Wrong Ball' }) as HTMLButtonElement).disabled).toBe(false);
        expect(screen.queryByText('ACTIONS STAGED')).toBeNull();
        expect(screen.getByRole('button', { name: 'POT' })).toBeTruthy();
    });
});
