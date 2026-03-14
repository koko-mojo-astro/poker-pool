/* @vitest-environment happy-dom */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockUseAuth,
  mockUseQuery,
  mockQueryOnce,
  mockTransact,
  mockApplyVisitActions,
  mockCommitVisit,
  mockStartGame,
  mockRestartGame,
  mockExitRoom,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseQuery: vi.fn(),
  mockQueryOnce: vi.fn(),
  mockTransact: vi.fn(),
  mockApplyVisitActions: vi.fn(),
  mockCommitVisit: vi.fn(),
  mockStartGame: vi.fn(),
  mockRestartGame: vi.fn(),
  mockExitRoom: vi.fn(),
}));

vi.mock('../lib/db', () => ({
  db: {
    useAuth: mockUseAuth,
    useQuery: mockUseQuery,
    queryOnce: mockQueryOnce,
    transact: mockTransact,
  },
}));

vi.mock('../lib/GameEngine.ts', () => ({
  GameEngine: {
    applyVisitActions: mockApplyVisitActions,
    commitVisit: mockCommitVisit,
    startGame: mockStartGame,
    restartGame: mockRestartGame,
    exitRoom: mockExitRoom,
  },
}));

vi.mock('@instantdb/react', () => ({
  id: () => 'generated-id',
  tx: {
    rooms: new Proxy({}, { get: () => ({ update: vi.fn(), link: vi.fn() }) }),
    roomPlayers: new Proxy({}, { get: () => ({ update: vi.fn(), link: vi.fn(), delete: vi.fn() }) }),
  },
}));

import { useGameState } from './useGameState';
import { AlertProvider } from '../components/AlertContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <AlertProvider>{children}</AlertProvider>;

function createRoom() {
  return {
    id: 'room-1',
    roomCode: 'ROOM1234',
    status: 'PLAYING',
    config: { gameAmount: 10, jokerAmount: 2 },
    pottedCards: [],
    deck: [],
    turnOrder: ['p1', 'p2'],
    winnerId: null,
    totalSettlements: {},
    matches: [],
    players: [
      {
        id: 'p1',
        hand: [{ id: 'a1', rank: 'A', suit: 'spades' }],
        hasLicense: false,
        jokerBalls: { direct: 0, all: 0 },
        isCreator: true,
        profile: [{ id: 'profile-1', displayName: 'Alice' }],
      },
      {
        id: 'p2',
        hand: [{ id: 'k1', rank: 'K', suit: 'hearts' }],
        hasLicense: false,
        jokerBalls: { direct: 0, all: 0 },
        isCreator: false,
        profile: [{ id: 'profile-2', displayName: 'Bob' }],
      },
    ],
  };
}

function createUserQueryData(room: ReturnType<typeof createRoom>) {
  return {
    $users: [
      {
        id: 'user-1',
        profile: {
          id: 'profile-1',
          roomPlayers: [
            {
              id: 'p1',
              room,
            },
          ],
        },
      },
    ],
  };
}

describe('useGameState gameplay actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyVisitActions.mockImplementation((room, _playerId, actions) => ({
      ...room,
      pottedCards: actions.some((action: { type: string }) => action.type === 'POT_CARD') ? ['A'] : room.pottedCards,
      players: room.players.map((player: { id: string; hand: Array<{ id: string }> }) => (
        player.id === 'p1' && actions.some((action: { type: string }) => action.type === 'POT_CARD')
          ? { ...player, hand: [], cardCount: 0 }
          : player
      )),
    }));
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1' },
      isLoading: false,
    });
  });

  it('stages a pot locally and updates the preview without querying the backend', async () => {
    const room = createRoom();

    mockUseQuery.mockReturnValue({
      data: createUserQueryData(room),
      isLoading: false,
    });

    const { result } = renderHook(() => useGameState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage({ type: 'POT_CARD', payload: { cardId: 'a1' } });
    });

    expect(mockQueryOnce).not.toHaveBeenCalled();
    expect(mockCommitVisit).not.toHaveBeenCalled();
    expect(mockApplyVisitActions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'room-1' }),
      'p1',
      [{ type: 'POT_CARD', payload: { cardId: 'a1' } }],
    );
    expect(result.current.gameState?.stagedVisitActions).toEqual([
      { type: 'POT_CARD', payload: { cardId: 'a1' } },
    ]);
  });

  it('commits the staged visit against a fresh room snapshot', async () => {
    const staleRoom = createRoom();
    const freshRoom = {
      ...createRoom(),
      pottedCards: ['K'],
    };

    mockUseQuery.mockReturnValue({
      data: createUserQueryData(staleRoom),
      isLoading: false,
    });
    mockQueryOnce.mockResolvedValue({
      data: {
        rooms: [freshRoom],
      },
    });

    const { result } = renderHook(() => useGameState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage({ type: 'POT_CARD', payload: { cardId: 'a1' } });
      await result.current.sendMessage({ type: 'COMMIT_VISIT' });
    });

    expect(mockQueryOnce).toHaveBeenCalledWith({
      rooms: {
        $: { where: { id: 'room-1' } },
        players: {
          profile: {},
        },
        matches: {},
      },
    });
    expect(mockCommitVisit).toHaveBeenCalledWith(
      expect.objectContaining({ queryOnce: mockQueryOnce }),
      expect.objectContaining({ id: 'room-1', pottedCards: ['K'] }),
      'p1',
      [{ type: 'POT_CARD', payload: { cardId: 'a1' } }],
    );
    expect(result.current.gameState?.stagedVisitActions).toEqual([]);
  });

  it('applies wrong-ball pot immediately without staging', async () => {
    const room = createRoom();
    mockUseQuery.mockReturnValue({
      data: createUserQueryData(room),
      isLoading: false,
    });
    mockQueryOnce.mockResolvedValue({
      data: { rooms: [room] },
    });

    const { result } = renderHook(() => useGameState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage({ type: 'POT_CARD', payload: { rank: 'Q' } });
    });

    expect(mockQueryOnce).toHaveBeenCalled();
    expect(mockCommitVisit).toHaveBeenCalledWith(
      expect.objectContaining({ queryOnce: mockQueryOnce }),
      expect.objectContaining({ id: 'room-1' }),
      'p1',
      [{ type: 'POT_CARD', payload: { rank: 'Q' } }],
    );
    expect(result.current.gameState?.stagedVisitActions).toEqual([]);
  });

  it('applies DRAW_CARD immediately without staging', async () => {
    const room = createRoom();
    mockUseQuery.mockReturnValue({
      data: createUserQueryData(room),
      isLoading: false,
    });
    mockQueryOnce.mockResolvedValue({
      data: { rooms: [room] },
    });

    const { result } = renderHook(() => useGameState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage({ type: 'DRAW_CARD' });
    });

    expect(mockQueryOnce).toHaveBeenCalled();
    expect(mockCommitVisit).toHaveBeenCalledWith(
      expect.objectContaining({ queryOnce: mockQueryOnce }),
      expect.objectContaining({ id: 'room-1' }),
      'p1',
      [{ type: 'DRAW_CARD' }],
    );
    expect(result.current.gameState?.stagedVisitActions).toEqual([]);
  });

  it('applies MARK_FOUL immediately without staging', async () => {
    const room = createRoom();
    mockUseQuery.mockReturnValue({
      data: createUserQueryData(room),
      isLoading: false,
    });
    mockQueryOnce.mockResolvedValue({
      data: { rooms: [room] },
    });

    const { result } = renderHook(() => useGameState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage({ type: 'MARK_FOUL' });
    });

    expect(mockQueryOnce).toHaveBeenCalled();
    expect(mockCommitVisit).toHaveBeenCalledWith(
      expect.objectContaining({ queryOnce: mockQueryOnce }),
      expect.objectContaining({ id: 'room-1' }),
      'p1',
      [{ type: 'MARK_FOUL' }],
    );
    expect(result.current.gameState?.stagedVisitActions).toEqual([]);
  });

  it('applies UPDATE_JOKER immediately without staging', async () => {
    const room = createRoom();
    mockUseQuery.mockReturnValue({
      data: createUserQueryData(room),
      isLoading: false,
    });
    mockQueryOnce.mockResolvedValue({
      data: { rooms: [room] },
    });

    const { result } = renderHook(() => useGameState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage({ type: 'UPDATE_JOKER', payload: { type: 'direct', delta: 1 } });
    });

    expect(mockQueryOnce).toHaveBeenCalled();
    expect(mockCommitVisit).toHaveBeenCalledWith(
      expect.objectContaining({ queryOnce: mockQueryOnce }),
      expect.objectContaining({ id: 'room-1' }),
      'p1',
      [{ type: 'UPDATE_JOKER', payload: { type: 'direct', delta: 1 } }],
    );
    expect(result.current.gameState?.stagedVisitActions).toEqual([]);
  });
});
