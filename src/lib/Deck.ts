import type { Card, Suit, Rank } from '../types';
import { id } from '@instantdb/react';

export class Deck {
    private cards: Card[] = [];

    constructor() {
        this.reset();
    }

    reset() {
        this.cards = [];
        const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

        for (const suit of suits) {
            for (const rank of ranks) {
                this.cards.push({
                    suit,
                    rank,
                    id: id()
                });
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    draw(): Card | undefined {
        return this.cards.pop();
    }

    get remaining(): number {
        return this.cards.length;
    }

    static isValuePotted(card: Card, pottedCards: Rank[]): boolean {
        return pottedCards.includes(card.rank);
    }
}
