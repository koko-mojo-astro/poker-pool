import React, { useState } from 'react';
import type { ClientMessage } from '@shared/types';

interface HomeProps {
    sendMessage: (msg: ClientMessage) => void;
    error: string | null;
}

export function Home({ sendMessage, error }: HomeProps) {
    const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
    const [name, setName] = useState('');
    const [isLinked, setIsLinked] = useState(false);

    // Create State
    const [gameAmount, setGameAmount] = useState('2');
    const [jokerAmount, setJokerAmount] = useState('0.50');

    // Join State
    const [roomCode, setRoomCode] = useState('');

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            setRoomCode(room.toUpperCase());
            setActiveTab('join');
            setIsLinked(true);
        }
    }, []);

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;
        sendMessage({
            type: 'CREATE_ROOM',
            payload: {
                gameAmount: parseFloat(gameAmount),
                jokerAmount: parseFloat(jokerAmount),
                creatorName: name
            }
        });
    };

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !roomCode) return;
        sendMessage({
            type: 'JOIN_ROOM',
            payload: {
                roomId: roomCode.toUpperCase(),
                name
            }
        });
    };

    return (
        <div className="container" style={{ justifyContent: 'flex-start' }}>
            <h1 style={{
                fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
                fontWeight: 900,
                marginBottom: 'var(--gap-xl)',
                background: 'linear-gradient(to right, #a78bfa, #f472b6)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textAlign: 'center',
                letterSpacing: '-0.02em'
            }}>
                Poker Pool
            </h1>

            <div className="glass-panel" style={{ width: '100%', boxSizing: 'border-box' }}>
                {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--danger)', color: '#fca5a5', padding: 'var(--gap-md)', borderRadius: '12px', marginBottom: 'var(--gap-lg)', fontSize: '0.9rem' }}>
                        {error}
                    </div>
                )}

                {!isLinked && (
                    <div style={{ display: 'flex', marginBottom: 'var(--gap-lg)', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '14px', padding: '4px' }}>
                        <button
                            onClick={() => setActiveTab('create')}
                            style={{
                                flex: 1,
                                padding: '12px 10px',
                                borderRadius: '10px',
                                border: 'none',
                                background: activeTab === 'create' ? 'var(--primary)' : 'transparent',
                                color: activeTab === 'create' ? 'white' : 'var(--text-muted)',
                                fontWeight: 700,
                                fontSize: '0.9rem'
                            }}
                        >
                            Create Room
                        </button>
                        <button
                            onClick={() => setActiveTab('join')}
                            style={{
                                flex: 1,
                                padding: '12px 10px',
                                borderRadius: '10px',
                                border: 'none',
                                background: activeTab === 'join' ? 'var(--primary)' : 'transparent',
                                color: activeTab === 'join' ? 'white' : 'var(--text-muted)',
                                fontWeight: 700,
                                fontSize: '0.9rem'
                            }}
                        >
                            Join Room
                        </button>
                    </div>
                )}

                {isLinked && (
                    <div style={{ textAlign: 'center', marginBottom: 'var(--gap-lg)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: 'var(--gap-md)', borderRadius: '12px' }}>
                        Joining Room: <strong style={{ color: 'var(--primary)', fontSize: '1.25rem', fontFamily: 'monospace' }}>{roomCode}</strong>
                    </div>
                )}

                <div className="animate-fade-in">
                    <div style={{ marginBottom: 'var(--gap-md)' }}>
                        <label style={{ display: 'block', marginBottom: 'var(--gap-xs)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your Name</label>
                        <input
                            type="text"
                            placeholder="e.g. Alice"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {activeTab === 'create' ? (
                        <form onSubmit={handleCreate}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap-md)', marginBottom: 'var(--gap-lg)' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 'var(--gap-xs)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Game Amount</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={gameAmount}
                                        onChange={(e) => setGameAmount(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: 'var(--gap-xs)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Joker Amount</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={jokerAmount}
                                        onChange={(e) => setJokerAmount(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="btn-primary" style={{ width: '100%', height: '48px' }}>Create Room</button>
                        </form>
                    ) : (
                        <form onSubmit={handleJoin}>
                            {!isLinked && (
                                <div style={{ marginBottom: 'var(--gap-lg)' }}>
                                    <label style={{ display: 'block', marginBottom: 'var(--gap-xs)', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Room Code</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. ABC1234"
                                        value={roomCode}
                                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                                        maxLength={6}
                                        style={{ fontFamily: 'monospace', letterSpacing: '2px', fontSize: '1.2rem', textAlign: 'center' }}
                                    />
                                </div>
                            )}
                            <button type="submit" className="btn-primary" style={{ width: '100%', height: '48px' }}>Join Game</button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
