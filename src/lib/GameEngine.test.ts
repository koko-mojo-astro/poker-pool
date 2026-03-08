import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from './GameEngine';
import { createCard, createPlayer, createRoomData } from '@/test/fixtures/gameFixtures';
import { createMockDb, mockMathRandom } from '@/test/fixtures/testUtils';

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
  id: () => `match-${idCounter++}`,
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

    expect(db.transact).toHaveBeenCalledTimes(1);
    const txs = db.transact.mock.calls[0][0] as TxOp[];

    const p1Update = findUpdateOp(txs, 'roomPlayers', 'p1');
    const p2Update = findUpdateOp(txs, 'roomPlayers', 'p2');
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id, (op) => Array.isArray(op.payload?.deck as unknown[]));

    expect((p1Update?.payload?.hand as unknown[]).length).toBe(7);
    expect((p2Update?.payload?.hand as unknown[]).length).toBe(7);
    expect(roomUpdate?.payload?.status).toBe('PLAYING');
    expect((roomUpdate?.payload?.deck as unknown[]).length).toBe(38);
    expect(roomUpdate?.payload?.turnOrder).toEqual(expect.arrayContaining(['p1', 'p2']));
  });

  it('revokes license and draws a valid penalty card on foul', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      pottedCards: ['A'],
      deck: [createCard('A', 'clubs', 'skip-card'), createCard('K', 'hearts', 'penalty-card')],
      players: [
        createPlayer({ id: 'p1', hasLicense: true, hand: [createCard('2', 'spades', 'in-hand')] }),
        createPlayer({ id: 'p2' }),
      ],
    });

    await GameEngine.markFoul(db, roomData, 'p1');

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const playerUpdateOps = txs.filter((op) => op.entity === 'roomPlayers' && op.id === 'p1' && op.action === 'update');
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);

    expect(playerUpdateOps.length).toBe(2);
    expect(playerUpdateOps[0].payload?.hasLicense).toBe(false);
    expect((playerUpdateOps[1].payload?.hand as unknown[]).length).toBe(2);
    expect((roomUpdate?.payload?.deck as unknown[]).length).toBe(1);
  });

  it('pots rank for all players and finishes game when someone reaches zero cards', async () => {
    const db = createMockDb();
    const p1 = createPlayer({
      id: 'p1',
      isCreator: true,
      hasLicense: false,
      hand: [createCard('A', 'spades', 'p1-a')],
      profile: [{ id: 'profile-1', displayName: 'Alice' }],
    });
    const p2 = createPlayer({
      id: 'p2',
      hand: [createCard('K', 'hearts', 'p2-k')],
      profile: [{ id: 'profile-2', displayName: 'Bob' }],
    });
    const roomData = createRoomData({
      status: 'PLAYING',
      players: [p1, p2],
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      pottedCards: [],
      totalSettlements: {},
    });

    await GameEngine.potCard(db, roomData, 'p1', { cardId: 'p1-a' });

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const p1Updates = txs.filter((op) => op.entity === 'roomPlayers' && op.id === 'p1' && op.action === 'update');
    const p2Update = findUpdateOp(txs, 'roomPlayers', 'p2');
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id, (op) => op.payload?.status === 'FINISHED');
    const matchUpdate = findUpdateOp(txs, 'matches', 'match-1');

    expect(p1Updates.some((op) => op.payload?.hasLicense === true)).toBe(true);
    expect((p1Updates[p1Updates.length - 1].payload?.hand as unknown[]).length).toBe(0);
    expect((p2Update?.payload?.hand as unknown[]).length).toBe(1);
    expect(roomUpdate?.payload?.status).toBe('FINISHED');
    expect(roomUpdate?.payload?.winnerId).toBe('p1');
    expect(roomUpdate?.payload?.totalSettlements).toEqual({ 'profile-1': 10, 'profile-2': -10 });
    expect(matchUpdate?.payload?.winnerId).toBe('p1');
    expect(matchUpdate?.links).toEqual([{ room: roomData.id }]);
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
    expect(db.transact).toHaveBeenCalledTimes(1);
    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    expect(roomUpdate?.payload?.status).toBe('WAITING');
  });

  it('allows wrong-ball potting, removes rank globally, and draws a penalty card without granting license', async () => {
    const db = createMockDb();
    const p1 = createPlayer({
      id: 'p1',
      hasLicense: false,
      hand: [createCard('2', 'spades', 'p1-2')],
    });
    const p2 = createPlayer({
      id: 'p2',
      hand: [createCard('Q', 'hearts', 'p2-q'), createCard('5', 'clubs', 'p2-5')],
    });
    const roomData = createRoomData({
      status: 'PLAYING',
      players: [p1, p2],
      pottedCards: [],
      deck: [createCard('Q', 'diamonds', 'skip-q'), createCard('K', 'clubs', 'draw-k')],
    });

    await GameEngine.potCard(db, roomData, 'p1', { rank: 'Q' });

    expect(db.transact).toHaveBeenCalledTimes(1);
    const txs = db.transact.mock.calls[0][0] as TxOp[];

    const pottedUpdate = findUpdateOp(txs, 'rooms', roomData.id, (op) => Array.isArray(op.payload?.pottedCards as unknown[]));
    const deckUpdate = findUpdateOp(txs, 'rooms', roomData.id, (op) => Array.isArray(op.payload?.deck as unknown[]));
    const p1Updates = txs.filter((op) => op.entity === 'roomPlayers' && op.id === 'p1' && op.action === 'update');
    const p2Update = findUpdateOp(txs, 'roomPlayers', 'p2');

    expect(pottedUpdate?.payload?.pottedCards).toEqual(['Q']);
    expect((p2Update?.payload?.hand as unknown[]).length).toBe(1);

    expect(p1Updates.some((op) => op.payload?.hasLicense === true)).toBe(false);
    expect((p1Updates[p1Updates.length - 1].payload?.hand as unknown[]).length).toBe(2);
    expect((deckUpdate?.payload?.deck as unknown[]).length).toBe(1);
  });

  it('treats wrong-ball pot as foul and revokes existing license', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      players: [
        createPlayer({
          id: 'p1',
          hasLicense: true,
          hand: [createCard('4', 'spades', 'p1-4')],
        }),
        createPlayer({ id: 'p2', hand: [createCard('7', 'hearts', 'p2-7')] }),
      ],
      pottedCards: [],
      deck: [createCard('K', 'clubs', 'draw-k')],
    });

    await GameEngine.potCard(db, roomData, 'p1', { rank: '7' });

    expect(db.transact).toHaveBeenCalledTimes(1);
    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const p1Updates = txs.filter((op) => op.entity === 'roomPlayers' && op.id === 'p1' && op.action === 'update');

    expect(p1Updates.some((op) => op.payload?.hasLicense === false)).toBe(true);
    expect(p1Updates.some((op) => op.payload?.hasLicense === true)).toBe(false);
  });

  it('blocks positive joker increment without license', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      players: [createPlayer({ id: 'p1', hasLicense: false, jokerBalls: { direct: 0, all: 0 } }), createPlayer({ id: 'p2' })],
    });

    await GameEngine.updateJokerCount(db, roomData, 'p1', 'direct', 1);
    expect(db.transact).not.toHaveBeenCalled();

    roomData.players[0].hasLicense = true;
    await GameEngine.updateJokerCount(db, roomData, 'p1', 'direct', 1);
    expect(db.transact).toHaveBeenCalledTimes(1);
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
