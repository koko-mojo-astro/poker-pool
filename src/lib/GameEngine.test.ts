import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { createCard, createPlayer, createRoomData } from '@/test/fixtures/gameFixtures';
import { createMockDb, mockMathRandom } from '@/test/fixtures/testUtils';
import type { VisitAction } from '@/types';

type TxOp = {
  entity: string;
  id: string;
  action: 'update' | 'delete' | 'link';
  payload?: Record<string, unknown>;
  links: Array<Record<string, string>>;
  link?: (payload: Record<string, string>) => TxOp;
};

let idCounter = 1;

function makeOp(entity: string, id: string, action: TxOp['action'], payload?: Record<string, unknown>): TxOp {
  const op: TxOp = {
    entity,
    id,
    action,
    payload,
    links: [],
  };
  op.link = (linkPayload: Record<string, string>) => {
    op.links.push(linkPayload);
    return op;
  };
  return op;
}

function makeEntityProxy(entity: string) {
  return new Proxy(
    {},
    {
      get(_target, entityId: string) {
        return {
          update: (payload: Record<string, unknown>) => makeOp(entity, entityId, 'update', payload),
          delete: () => makeOp(entity, entityId, 'delete'),
          link: (payload: Record<string, string>) => makeOp(entity, entityId, 'link').link!(payload),
        };
      },
    },
  );
}

vi.mock('@instantdb/react', () => ({
  id: () => `id-${idCounter++}`,
  tx: {
    rooms: makeEntityProxy('rooms'),
    roomPlayers: makeEntityProxy('roomPlayers'),
    matches: makeEntityProxy('matches'),
  },
}));

function findUpdateOp(
  txs: TxOp[],
  entity: string,
  id: string,
  predicate?: (op: TxOp) => boolean,
) {
  return txs.find((op) => {
    if (op.entity !== entity || op.id !== id || op.action !== 'update') return false;
    return predicate ? predicate(op) : true;
  });
}

function findDeleteOp(txs: TxOp[], entity: string, id: string) {
  return txs.find((op) => op.entity === entity && op.id === id && op.action === 'delete');
}

describe('GameEngine', () => {
  beforeEach(() => {
    idCounter = 1;
    vi.restoreAllMocks();
  });

  it('does not start game when initiator is not creator', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'WAITING',
      players: [
        createPlayer({ id: 'p1', isCreator: false }),
        createPlayer({ id: 'p2', isCreator: true }),
      ],
    });

    await GameEngine.startGame(db, roomData, 'p1');
    expect(db.transact).not.toHaveBeenCalled();
  });

  it('starts game for creator and distributes cards', async () => {
    const db = createMockDb();
    const randomSpy = mockMathRandom([0, 0, 0, 0, 0, 0]);
    const roomData = createRoomData({
      status: 'WAITING',
      players: [
        createPlayer({ id: 'p1', isCreator: true, hand: [] }),
        createPlayer({ id: 'p2', isCreator: false, hand: [] }),
      ],
    });

    await GameEngine.startGame(db, roomData, 'p1');
    randomSpy.mockRestore();

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);

    expect(findUpdateOp(txs, 'roomPlayers', 'p1')?.payload?.hand).toHaveLength(7);
    expect(findUpdateOp(txs, 'roomPlayers', 'p2')?.payload?.hand).toHaveLength(7);
    expect(roomUpdate?.payload?.status).toBe('PLAYING');
    expect(roomUpdate?.payload?.turnOrder).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('previews a wrong-ball visit with penalty draw and no winner finalization', () => {
    const roomData = createRoomData({
      status: 'PLAYING',
      players: [
        createPlayer({ id: 'p1', hasLicense: true, hand: [createCard('2', 'spades', 'p1-2')] }),
        createPlayer({ id: 'p2', hand: [createCard('Q', 'hearts', 'p2-q'), createCard('5', 'clubs', 'p2-5')] }),
      ],
      deck: [createCard('Q', 'diamonds', 'skip-q'), createCard('K', 'clubs', 'draw-k')],
    });

    const preview = GameEngine.applyVisitActions(roomData, 'p1', [
      { type: 'POT_CARD', payload: { rank: 'Q' } },
    ]);

    expect(preview.pottedCards).toEqual(['Q']);
    expect(preview.players.find((player: { id: string }) => player.id === 'p2')?.hand).toHaveLength(1);
    const actingPlayer = preview.players.find((player: { id: string }) => player.id === 'p1');
    expect(actingPlayer?.hasLicense).toBe(false);
    expect(actingPlayer?.hand).toHaveLength(2);
    expect(preview.status).toBe('PLAYING');
  });

  it('lets the acting player win after committing the full staged visit', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('2', 'spades', 'p1-2')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hand: [createCard('A', 'hearts', 'p2-a')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
      ],
    });

    const actions: VisitAction[] = [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } },
      { type: 'POT_CARD', payload: { cardId: 'p1-2' } },
    ];

    await GameEngine.commitVisit(db, roomData, 'p1', actions);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    const matchUpdate = findUpdateOp(txs, 'matches', 'id-1');

    expect(roomUpdate?.payload?.status).toBe('FINISHED');
    expect(roomUpdate?.payload?.winnerId).toBe('p1');
    expect(roomUpdate?.payload?.totalSettlements).toEqual({ 'profile-1': 10, 'profile-2': -10 });
    expect(matchUpdate?.payload?.winnerId).toBe('p1');
  });

  it('can finalize another player as winner when the committed visit leaves them at zero cards', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('2', 'spades', 'p1-2')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hand: [createCard('A', 'hearts', 'p2-a')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
      ],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    expect(roomUpdate?.payload?.winnerId).toBe('p2');
  });

  it('rejects a stale visit when the fresh room no longer supports the staged action', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      pottedCards: ['A'],
      players: [
        createPlayer({ id: 'p1', hand: [createCard('A', 'spades', 'p1-a')] }),
        createPlayer({ id: 'p2', hand: [createCard('K', 'hearts', 'p2-k')] }),
      ],
    });

    await expect(
      GameEngine.commitVisit(db, roomData, 'p1', [{ type: 'POT_CARD', payload: { cardId: 'p1-a' } }]),
    ).rejects.toThrow('already been potted');
    expect(db.transact).not.toHaveBeenCalled();
  });

  it('supports batching license and joker updates into one committed visit', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        createPlayer({ id: 'p1', hand: [createCard('A', 'spades', 'p1-a')], profile: [{ id: 'profile-1', displayName: 'Alice' }] }),
        createPlayer({ id: 'p2', hand: [createCard('Q', 'hearts', 'p2-q')], jokerBalls: { direct: 1, all: 0 }, profile: [{ id: 'profile-2', displayName: 'Bob' }] }),
        createPlayer({ id: 'p3', hand: [createCard('K', 'clubs', 'p3-k')], profile: [{ id: 'profile-3', displayName: 'Cara' }] }),
      ],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } },
      { type: 'UPDATE_JOKER', payload: { type: 'direct', delta: 1 } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    const settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    expect(settlements).toEqual(expect.arrayContaining([
      { fromPlayerId: 'p2', toPlayerId: 'p1', amount: 6, breakdown: '$10.00 −$4.00 offset' },
      { fromPlayerId: 'p3', toPlayerId: 'p1', amount: 14, breakdown: '$14.00' },
    ]));
  });

  it('reverses direct settlement when the joker count is negative', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        createPlayer({ id: 'p1', hand: [createCard('A', 'spades', 'p1-a')], profile: [{ id: 'profile-1', displayName: 'Alice' }] }),
        createPlayer({ id: 'p2', hand: [createCard('K', 'hearts', 'p2-k')], jokerBalls: { direct: -1, all: 0 }, profile: [{ id: 'profile-2', displayName: 'Bob' }] }),
        createPlayer({ id: 'p3', hand: [createCard('Q', 'clubs', 'p3-q')], profile: [{ id: 'profile-3', displayName: 'Cara' }] }),
      ],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    const matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    const settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    expect(settlements).toEqual(expect.arrayContaining([
      { fromPlayerId: 'p2', toPlayerId: 'p1', amount: 14, breakdown: '$14.00' },
      { fromPlayerId: 'p3', toPlayerId: 'p1', amount: 10, breakdown: '$10.00' },
    ]));
    expect(roomUpdate?.payload?.totalSettlements).toEqual({ 'profile-1': 24, 'profile-2': -14, 'profile-3': -10 });
  });

  it('reverses winner and loser all-joker settlements when the joker count is negative', async () => {
    const db = createMockDb();
    const winnerAllRoom = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        createPlayer({ id: 'p1', hand: [createCard('A', 'spades', 'winner-a')], jokerBalls: { direct: 0, all: -1 }, profile: [{ id: 'profile-1', displayName: 'Alice' }] }),
        createPlayer({ id: 'p2', hand: [createCard('K', 'hearts', 'winner-k')], profile: [{ id: 'profile-2', displayName: 'Bob' }] }),
        createPlayer({ id: 'p3', hand: [createCard('Q', 'clubs', 'winner-q')], profile: [{ id: 'profile-3', displayName: 'Cara' }] }),
      ],
    });

    await GameEngine.commitVisit(db, winnerAllRoom, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'winner-a' } },
    ]);

    let txs = db.transact.mock.calls[0][0] as TxOp[];
    let roomUpdate = findUpdateOp(txs, 'rooms', winnerAllRoom.id);
    let matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    let settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    expect(settlements).toEqual(expect.arrayContaining([
      { fromPlayerId: 'p2', toPlayerId: 'p1', amount: 8, breakdown: '$10.00 −$2.00 offset' },
      { fromPlayerId: 'p3', toPlayerId: 'p1', amount: 8, breakdown: '$10.00 −$2.00 offset' },
    ]));
    expect(roomUpdate?.payload?.totalSettlements).toEqual({ 'profile-1': 16, 'profile-2': -8, 'profile-3': -8 });

    db.transact.mockClear();
    idCounter = 1;

    const loserAllRoom = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        createPlayer({ id: 'p1', hand: [createCard('A', 'diamonds', 'loser-a')], profile: [{ id: 'profile-1', displayName: 'Alice' }] }),
        createPlayer({ id: 'p2', hand: [createCard('K', 'spades', 'loser-k')], jokerBalls: { direct: 0, all: -1 }, profile: [{ id: 'profile-2', displayName: 'Bob' }] }),
        createPlayer({ id: 'p3', hand: [createCard('Q', 'hearts', 'loser-q')], profile: [{ id: 'profile-3', displayName: 'Cara' }] }),
      ],
    });

    await GameEngine.commitVisit(db, loserAllRoom, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'loser-a' } },
    ]);

    txs = db.transact.mock.calls[0][0] as TxOp[];
    roomUpdate = findUpdateOp(txs, 'rooms', loserAllRoom.id);
    matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    expect(settlements).toEqual(expect.arrayContaining([
      { fromPlayerId: 'p2', toPlayerId: 'p1', amount: 12, breakdown: '$12.00' },
      { fromPlayerId: 'p3', toPlayerId: 'p1', amount: 10, breakdown: '$10.00' },
      { fromPlayerId: 'p2', toPlayerId: 'p3', amount: 2, breakdown: '$2.00' },
    ]));
    expect(roomUpdate?.payload?.totalSettlements).toEqual({ 'profile-1': 22, 'profile-2': -14, 'profile-3': -8 });
  });

  it('only creator can restart a finished game', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'FINISHED',
      players: [createPlayer({ id: 'p1', isCreator: true }), createPlayer({ id: 'p2' })],
    });

    await GameEngine.restartGame(db, roomData, 'p2');
    expect(db.transact).not.toHaveBeenCalled();

    await GameEngine.restartGame(db, roomData, 'p1');
    const txs = db.transact.mock.calls[0][0] as TxOp[];
    expect(findUpdateOp(txs, 'rooms', roomData.id)?.payload?.status).toBe('WAITING');
  });

  it('deletes full room when creator exits and only own record when guest exits', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      players: [createPlayer({ id: 'p1', isCreator: true }), createPlayer({ id: 'p2' })],
    });

    await GameEngine.exitRoom(db, roomData, 'p2');
    let txs = db.transact.mock.calls[0][0] as TxOp[];
    expect(findDeleteOp(txs, 'roomPlayers', 'p2')).toBeTruthy();
    expect(findDeleteOp(txs, 'rooms', roomData.id)).toBeFalsy();

    db.transact.mockClear();
    await GameEngine.exitRoom(db, roomData, 'p1');
    txs = db.transact.mock.calls[0][0] as TxOp[];
    expect(findDeleteOp(txs, 'roomPlayers', 'p1')).toBeTruthy();
    expect(findDeleteOp(txs, 'roomPlayers', 'p2')).toBeTruthy();
    expect(findDeleteOp(txs, 'rooms', roomData.id)).toBeTruthy();
  });
});
