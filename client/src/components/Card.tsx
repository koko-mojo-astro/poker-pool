import type { Card as CardType, Suit } from '@shared/types';

interface CardProps {
    card: CardType;
    onPot: (cardId: string) => void;
    disabled: boolean;
}

export function Card({ card, onPot, disabled }: CardProps) {
    const getSuitSymbol = (suit: Suit) => {
        switch (suit) {
            case 'hearts': return '♥';
            case 'diamonds': return '♦';
            case 'clubs': return '♣';
            case 'spades': return '♠';
        }
    };

    const getColor = (suit: Suit) => {
        return (suit === 'hearts' || suit === 'diamonds') ? '#ef4444' : '#1e293b';
    };

    return (
        <div className="card-container" style={{
            backgroundColor: 'white',
            color: getColor(card.suit),
            width: 'min(58px, 14vw)',
            height: 'min(84px, 21vw)',
            borderRadius: '6px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.4)',
            position: 'relative',
            userSelect: 'none',
            flexShrink: 0
        }}>
            <div style={{ alignSelf: 'flex-start', fontSize: '0.9rem', fontWeight: 'bold', lineHeight: 1 }}>{card.rank}</div>
            <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>{getSuitSymbol(card.suit)}</div>
            <div style={{ alignSelf: 'flex-end', fontSize: '0.9rem', fontWeight: 'bold', transform: 'rotate(180deg)', lineHeight: 1 }}>{card.rank}</div>

            {!disabled && (
                <div style={{
                    position: 'absolute',
                    bottom: '-32px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10
                }}>
                    <button
                        onClick={() => onPot(card.id)}
                        style={{
                            background: 'var(--danger)',
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '10px',
                            padding: '3px 10px',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            boxShadow: '0 4px 8px rgba(239, 64, 64, 0.4)',
                            cursor: 'pointer'
                        }}
                    >
                        POT
                    </button>
                </div>
            )}
        </div>
    );
}
