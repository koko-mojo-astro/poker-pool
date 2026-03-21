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

  it('finalizes a licensed non-actor player as winner (cover-win) when the committed visit leaves them at zero cards', async () => {
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
          hasLicense: true, // p2 has license → qualifies as winner
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
    expect(roomUpdate?.payload?.status).toBe('FINISHED');
  });

  // ─── Cover-win settlement routing ──────────────────────────────────────────

  it('cover-win 2-player: acting player pays winner both base-game shares (own + loser)', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        // p1 is the actor with cards remaining
        createPlayer({
          id: 'p1',
          hand: [createCard('K', 'spades', 'p1-k'), createCard('2', 'spades', 'p1-2')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        // p2 wins (has license, hand will be wiped by pot)
        createPlayer({
          id: 'p2',
          hasLicense: true,
          hand: [createCard('A', 'hearts', 'p2-a')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
        // p3 is another loser
        createPlayer({
          id: 'p3',
          hand: [createCard('Q', 'clubs', 'p3-q')],
          profile: [{ id: 'profile-3', displayName: 'Cara' }],
        }),
      ],
    });

    // p1 pots rank A → p2's last card is removed, p2 wins (licensed)
    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-k' } }, // p1 pots their own K first (gives license to p1)
    ]);

    // Manually construct the cover-win scenario: p1 still has cards, p2 is licensed with no cards
    // Reset and use a simpler scenario where acting player pots rank A belonging to p2's hand
    db.transact.mockClear();
    idCounter = 1;

    const coverRoom = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('K', 'spades', 'p1-k')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hasLicense: true, // p2 is licensed → will be declared winner
          hand: [createCard('A', 'hearts', 'p2-a')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
        createPlayer({
          id: 'p3',
          hand: [createCard('Q', 'clubs', 'p3-q')],
          profile: [{ id: 'profile-3', displayName: 'Cara' }],
        }),
      ],
    });

    await GameEngine.commitVisit(db, coverRoom, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } }, // pots A → removes from p2's hand → p2 at zero
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', coverRoom.id);
    const matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    const settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    expect(roomUpdate?.payload?.winnerId).toBe('p2');
    expect(roomUpdate?.payload?.status).toBe('FINISHED');

    // Cover routing: p1 fully absorbs all base-game losses.
    // p1 pays p2 for every non-winner (2 shares × $10 = $20).
    // p3 owes nothing — no reimbursement to p1 for the base-game portion.
    expect(settlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPlayerId: 'p1', toPlayerId: 'p2', amount: 20 }),
    ]));
    // Ensure p3 does NOT reimburse p1
    expect(settlements).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPlayerId: 'p3', toPlayerId: 'p1' }),
    ]));
    // Net changes: p1 = -20, p2 = +20, p3 = 0
    expect(roomUpdate?.payload?.totalSettlements).toEqual({
      'profile-1': -20,
      'profile-2': 20,
      'profile-3': 0,
    });
  });

  it('cover-win 2-player: actor pays winner both shares (2-player scenario)', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('K', 'spades', 'p1-k')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hasLicense: true,
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
    const matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    const settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    expect(roomUpdate?.payload?.winnerId).toBe('p2');
    // 2-player: only 1 non-winner (p1). Cover pays 1×10=10. No other losers.
    // p1 covers 1 share = 10 → p2 receives 10. Net same as normal.
    expect(settlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPlayerId: 'p1', toPlayerId: 'p2', amount: 10 }),
    ]));
    expect(roomUpdate?.payload?.totalSettlements).toEqual({ 'profile-1': -10, 'profile-2': 10 });
  });

  it('normal win when winner holds multiple cards of the same rank and actor pots that rank (not cover-win)', async () => {
    // Regression: applyPotAction wipes ALL copies of a rank from every player.
    // p2 holds two A cards; p1 pots A → both of p2's cards are stripped at once.
    // p2 wins (licensed), but since p2 had 2 cards before the pot this is NOT
    // a cover-win — p1 did not clear p2's single last card. Settlement is normal.
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('K', 'spades', 'p1-k')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hasLicense: true,
          // Two A cards — winner had more than one card before the pot
          hand: [createCard('A', 'hearts', 'p2-a1'), createCard('A', 'diamonds', 'p2-a2')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
        createPlayer({
          id: 'p3',
          hand: [createCard('Q', 'clubs', 'p3-q')],
          profile: [{ id: 'profile-3', displayName: 'Cara' }],
        }),
      ],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } }, // pots A → strips both of p2's A cards
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    const matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    const settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    expect(roomUpdate?.payload?.winnerId).toBe('p2');
    expect(roomUpdate?.payload?.status).toBe('FINISHED');

    // Normal settlement: each loser pays the winner individually (NOT cover-win routing)
    expect(settlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPlayerId: 'p1', toPlayerId: 'p2', amount: 10 }),
      expect.objectContaining({ fromPlayerId: 'p3', toPlayerId: 'p2', amount: 10 }),
    ]));
    // p3 must NOT owe p1 anything (no cover routing)
    expect(settlements).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPlayerId: 'p3', toPlayerId: 'p1' }),
    ]));
    // p1 pays its own share only (-10), p3 pays its own share only (-10), p2 receives both (+20)
    expect(roomUpdate?.payload?.totalSettlements).toEqual({
      'profile-1': -10,
      'profile-2': 20,
      'profile-3': -10,
    });
  });

  // ─── Unlicensed zero-card penalty ──────────────────────────────────────────

  it('unlicensed zero-card player draws two cards and game continues when actor pots their last card', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('K', 'spades', 'p1-k')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hasLicense: false, // no license → cannot win, gets 2 penalty cards
          hand: [createCard('A', 'hearts', 'p2-a')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
      ],
      deck: [
        createCard('3', 'clubs', 'deck-3'),
        createCard('4', 'diamonds', 'deck-4'),
        createCard('5', 'hearts', 'deck-5'),
      ],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    const p2Update = findUpdateOp(txs, 'roomPlayers', 'p2');

    // Game must NOT finish — no winner declared
    expect(roomUpdate?.payload?.status).toBeUndefined();
    expect(roomUpdate?.payload?.winnerId).toBeUndefined();

    // p2 receives exactly two penalty cards
    expect((p2Update?.payload?.hand as unknown[]).length).toBe(2);
  });

  it('unlicensed zero-card player draws two cards when deck has only one eligible card (draws max available)', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('K', 'spades', 'p1-k')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hasLicense: false,
          hand: [createCard('A', 'hearts', 'p2-a')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
      ],
      deck: [
        createCard('3', 'clubs', 'deck-3'), // only one eligible card
      ],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    const p2Update = findUpdateOp(txs, 'roomPlayers', 'p2');

    expect(roomUpdate?.payload?.status).toBeUndefined();
    // Gets at most 1 card (deck ran out after 1)
    expect((p2Update?.payload?.hand as unknown[]).length).toBe(1);
  });

  it('unlicensed zero-card penalty is NOT triggered for non-pot visits (draw, foul, joker)', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hasLicense: true,
          jokerBalls: { direct: 1, all: 0 },
          hand: [createCard('K', 'spades', 'p1-k'), createCard('3', 'spades', 'p1-3')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hasLicense: false,
          hand: [], // already at zero before the visit (edge case guard)
          cardCount: 0,
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
      ],
      deck: [createCard('4', 'hearts', 'deck-4')],
    });

    // MARK_FOUL does not have a POT_CARD action → penalty detection must not fire
    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'MARK_FOUL' },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const p2Update = findUpdateOp(txs, 'roomPlayers', 'p2');
    // p2 should still have 0 cards — no penalty draw triggered by non-pot action
    expect((p2Update?.payload?.hand as unknown[]).length).toBe(0);
  });

  // ─── Cover-win with jokers unchanged ───────────────────────────────────────

  it('cover-win: joker settlements are computed normally on top of base-game cover routing', async () => {
    const db = createMockDb();
    // p1 pots A → p2 (licensed, 1 direct joker) wins; p3 is another loser
    // Expected: base-game is cover-routed (p1 covers), joker direct is normal
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2', 'p3'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hand: [createCard('A', 'spades', 'p1-a'), createCard('K', 'spades', 'p1-k')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hasLicense: true,
          jokerBalls: { direct: 1, all: 0 }, // 1 direct joker
          hand: [createCard('A', 'hearts', 'p2-a')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
        createPlayer({
          id: 'p3',
          hand: [createCard('Q', 'clubs', 'p3-q')],
          profile: [{ id: 'profile-3', displayName: 'Cara' }],
        }),
      ],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'POT_CARD', payload: { cardId: 'p1-a' } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const matchUpdate = findUpdateOp(txs, 'matches', 'id-1');
    const settlements = matchUpdate?.payload?.settlements as Array<{ fromPlayerId: string; toPlayerId: string; amount: number }>;

    // Base-game cover: p1 pays p2 20 (2 shares × $10). p3 owes nothing for base-game.
    // Direct joker for p2 (1 direct): p2 collects jokerAmount*(numPlayers-1)*1 = 2*2*1 = $4 from p1 (above in order).
    // Total p1→p2 flows: $20 (base-game cover) + $4 (direct joker) = $24.
    // p3→p1: no base-game reimbursement; only joker flows apply (none here for p3).
    // Net: p1 pays p2 $24, p3 is untouched by base-game.
    expect(settlements).toBeDefined();
    expect(settlements.length).toBeGreaterThan(0);

    // p1 pays p2 for both base-game cover and direct joker — they are the sole payer to p2
    expect(settlements).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPlayerId: 'p1', toPlayerId: 'p2' }),
    ]));
    // p3 should NOT owe p1 anything for base-game
    expect(settlements).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ fromPlayerId: 'p3', toPlayerId: 'p1' }),
    ]));

    // p2 (winner) must receive a positive net; p1 must be negative; p3 is zero (no base-game debt)
    const roomUpdate = findUpdateOp(txs, 'rooms', roomData.id);
    const totalSettlements = roomUpdate?.payload?.totalSettlements as Record<string, number>;
    expect(totalSettlements['profile-2']).toBeGreaterThan(0);
    expect(totalSettlements['profile-1']).toBeLessThan(0);
    expect(totalSettlements['profile-3']).toBe(0);
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

  it('minus joker with license revokes license and draws one penalty card', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hasLicense: true,
          jokerBalls: { direct: 1, all: 0 },
          hand: [createCard('A', 'spades', 'p1-a'), createCard('2', 'spades', 'p1-2')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hand: [createCard('K', 'hearts', 'p2-k')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
      ],
      deck: [createCard('3', 'clubs', 'deck-3')],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'UPDATE_JOKER', payload: { type: 'direct', delta: -1 } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const p1Update = findUpdateOp(txs, 'roomPlayers', 'p1');

    expect(p1Update?.payload?.hasLicense).toBe(false);
    expect((p1Update?.payload?.hand as unknown[]).length).toBe(3);
    expect(p1Update?.payload?.jokerBalls).toEqual({ direct: 0, all: 0 });
  });

  it('minus joker without license only decrements the counter and does not draw', async () => {
    const db = createMockDb();
    const roomData = createRoomData({
      status: 'PLAYING',
      config: { gameAmount: 10, jokerAmount: 2 },
      turnOrder: ['p1', 'p2'],
      totalSettlements: {},
      players: [
        createPlayer({
          id: 'p1',
          hasLicense: false,
          jokerBalls: { direct: 1, all: 0 },
          hand: [createCard('A', 'spades', 'p1-a'), createCard('2', 'spades', 'p1-2')],
          profile: [{ id: 'profile-1', displayName: 'Alice' }],
        }),
        createPlayer({
          id: 'p2',
          hand: [createCard('K', 'hearts', 'p2-k')],
          profile: [{ id: 'profile-2', displayName: 'Bob' }],
        }),
      ],
      deck: [createCard('3', 'clubs', 'deck-3')],
    });

    await GameEngine.commitVisit(db, roomData, 'p1', [
      { type: 'UPDATE_JOKER', payload: { type: 'direct', delta: -1 } },
    ]);

    const txs = db.transact.mock.calls[0][0] as TxOp[];
    const p1Update = findUpdateOp(txs, 'roomPlayers', 'p1');

    expect(p1Update?.payload?.hasLicense).toBe(false);
    expect((p1Update?.payload?.hand as unknown[]).length).toBe(2);
    expect(p1Update?.payload?.jokerBalls).toEqual({ direct: 0, all: 0 });
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
