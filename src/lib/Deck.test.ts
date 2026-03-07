import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Deck } from './Deck';

let idCounter = 1;

vi.mock('@instantdb/react', () => ({
  id: () => `mock-card-${idCounter++}`,
}));

describe('Deck', () => {
  beforeEach(() => {
    idCounter = 1;
  });

  it('creates a full 52-card deck and draw drains it', () => {
    const deck = new Deck();
    const seenIds = new Set<string>();

    for (let i = 0; i < 52; i += 1) {
      const card = deck.draw();
      expect(card).toBeDefined();
      seenIds.add(card!.id);
    }

    expect(seenIds.size).toBe(52);
    expect(deck.draw()).toBeUndefined();
    expect(deck.remaining).toBe(0);
  });

  it('reduces remaining count after each draw', () => {
    const deck = new Deck();
    const before = deck.remaining;
    deck.draw();
    expect(deck.remaining).toBe(before - 1);
  });

  it('checks whether a card rank is already potted', () => {
    expect(Deck.isValuePotted({ id: '1', suit: 'hearts', rank: 'A' }, ['A', 'K'])).toBe(true);
    expect(Deck.isValuePotted({ id: '2', suit: 'spades', rank: 'Q' }, ['A', 'K'])).toBe(false);
  });
});
