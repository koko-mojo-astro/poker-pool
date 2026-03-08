/* @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameScreen } from './GameScreen';
import { ToastProvider } from './Toast';
import type { Card, GameState, Rank } from '../types';

function makeCard(rank: Rank, id: string): Card {
    return { rank, suit: 'spades', id };
}

function createGameState(myHand: Card[], pottedCards: Rank[] = []): GameState {
    return {
        roomId: 'ROOM1234',
        config: { gameAmount: 10, jokerAmount: 2 },
        status: 'PLAYING',
        pottedCards,
        deckCount: 30,
        winnerId: null,
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
        <ToastProvider>
            <GameScreen gameState={state} playerId="p1" sendMessage={sendMessage} />
        </ToastProvider>
    );
    return { sendMessage };
}

describe('GameScreen wrong-ball modal flow', () => {
    it('does not render wrong-ball panel inline by default', () => {
        const state = createGameState([makeCard('A', 'a1'), makeCard('2', 'c2')]);
        renderGameScreen(state);

        expect(screen.queryByText('WRONG-BALL POT (FOUL)')).toBeNull();
        expect(screen.getByRole('button', { name: 'Wrong Ball' })).toBeTruthy();
    });

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

    it('sends selected wrong-ball rank and closes modal', () => {
        const state = createGameState([makeCard('A', 'a1')]);
        const { sendMessage } = renderGameScreen(state);

        fireEvent.click(screen.getByRole('button', { name: 'Wrong Ball' }));
        fireEvent.click(screen.getByRole('button', { name: 'Q' }));
        fireEvent.click(screen.getByRole('button', { name: 'Pot Wrong Ball' }));

        expect(sendMessage).toHaveBeenCalledWith({ type: 'POT_CARD', payload: { rank: 'Q' } });
        expect(screen.queryByText('WRONG-BALL POT')).toBeNull();
    });

    it('disables pot action when no wrong-ball ranks remain', () => {
        const fullHand = (['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as Rank[])
            .map((rank, idx) => makeCard(rank, `card-${idx}`));
        const state = createGameState(fullHand);
        renderGameScreen(state);

        fireEvent.click(screen.getByRole('button', { name: 'Wrong Ball' }));

        expect(screen.getByText('No eligible wrong-ball ranks left.')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Pot Wrong Ball' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
