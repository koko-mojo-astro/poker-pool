import type { Card, Rank, RoomConfig, Suit } from '@/types';

type PartialDeep<T> = {
  [K in keyof T]?: T[K] extends object ? PartialDeep<T[K]> : T[K];
};

interface RoomPlayerFixture {
  id: string;
  profile: { id: string; displayName: string } | Array<{ id: string; displayName: string }>;
  hand: Card[];
  hasLicense: boolean;
  jokerBalls: { direct: number; all: number };
  isCreator: boolean;
  cardCount: number;
}

interface RoomDataFixture {
  id: string;
  roomCode: string;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  config: RoomConfig;
  pottedCards: Rank[];
  deck: Card[];
  turnOrder: string[];
  winnerId: string | null;
  players: RoomPlayerFixture[];
  totalSettlements: Record<string, number>;
}

let nextCardId = 1;

export function createCard(rank: Rank, suit: Suit = 'spades', id?: string): Card {
  return {
    rank,
    suit,
    id: id ?? `card-${nextCardId++}`,
  };
}

export function createPlayer(overrides: PartialDeep<RoomPlayerFixture> & { id: string }): RoomPlayerFixture {
  const name = (Array.isArray(overrides.profile) ? overrides.profile[0]?.displayName : overrides.profile?.displayName)
    ?? `${overrides.id}-name`;
  const profileId = (Array.isArray(overrides.profile) ? overrides.profile[0]?.id : overrides.profile?.id)
    ?? `${overrides.id}-profile`;

  const defaultHand = [createCard('2', 'hearts', `${overrides.id}-c1`)];
  const hand = overrides.hand ? [...(overrides.hand as Card[])] : defaultHand;

  return {
    id: overrides.id,
    profile: overrides.profile ?? [{ id: profileId, displayName: name }],
    hand,
    hasLicense: overrides.hasLicense ?? false,
    jokerBalls: {
      direct: overrides.jokerBalls?.direct ?? 0,
      all: overrides.jokerBalls?.all ?? 0,
    },
    isCreator: overrides.isCreator ?? false,
    cardCount: hand.length,
  };
}

export function createRoomData(overrides: PartialDeep<RoomDataFixture> = {}): RoomDataFixture {
  const playerA = createPlayer({ id: 'p1', isCreator: true });
  const playerB = createPlayer({ id: 'p2' });
  const players = (overrides.players as RoomPlayerFixture[] | undefined) ?? [playerA, playerB];

  return {
    id: overrides.id ?? 'room-1',
    roomCode: overrides.roomCode ?? 'ROOM1234',
    status: overrides.status ?? 'WAITING',
    config: {
      gameAmount: overrides.config?.gameAmount ?? 10,
      jokerAmount: overrides.config?.jokerAmount ?? 2,
    },
    pottedCards: (overrides.pottedCards as Rank[] | undefined) ?? [],
    deck: (overrides.deck as Card[] | undefined) ?? [],
    turnOrder: (overrides.turnOrder as string[] | undefined) ?? players.map((p) => p.id),
    winnerId: overrides.winnerId ?? null,
    players,
    totalSettlements: overrides.totalSettlements ?? {},
  };
}
