import React, { useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { db } from '../lib/db';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_NAME = import.meta.env.VITE_INSTANT_CLIENT_NAME || 'google-web';

export const LoginScreen: React.FC = () => {
    const [nonce] = useState(crypto.randomUUID());

    return (
        <div className="container" style={{ justifyContent: 'center' }}>
            <div className="glass-panel animate-fade-in" style={{ textAlign: 'center' }}>
                <h1 style={{
                    fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
                    fontWeight: 900,
                    marginBottom: 'var(--gap-sm)',
                    background: 'linear-gradient(to right, #a78bfa, #f472b6)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    letterSpacing: '-0.02em'
                }}>
                    Poker Pool
                </h1>
                <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--gap-xl)' }}>
                    Sign in to play and track your stats
                </p>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
                        <GoogleLogin
                            nonce={nonce}
                            onError={() => alert('Login failed')}
                            onSuccess={({ credential }) => {
                                if (!credential) return;
                                db.auth.signInWithIdToken({
                                    clientName: GOOGLE_CLIENT_NAME,
                                    idToken: credential,
                                    nonce,
                                }).catch((err) => {
                                    alert('Authentication error: ' + (err.body?.message || err.message));
                                });
                            }}
                        />
                    </GoogleOAuthProvider>
                </div>

                {import.meta.env.DEV && (
                    <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px dashed var(--glass-border)' }}>
                        <h3 style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>Developer Playground Auth</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                            {[1, 2, 3, 4].map(num => (
                                <button
                                    key={num}
                                    onClick={() => db.auth.sendMagicCode({ email: `tunmin.koko305+test${num}@gmail.com` }).then(() => alert(`Sent code to test${num}!`)).catch(e => alert(e.message))}
                                    className="btn-primary"
                                    style={{ fontSize: '0.75rem', padding: '8px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid var(--primary)' }}
                                >
                                    Send Code to Test {num}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="email"
                                id="dev-email-input"
                                placeholder="Email (e.g. tunmin.koko305+test1@gmail.com)"
                                style={{ flex: 1, padding: '8px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: 'white', fontSize: '0.8rem' }}
                            />
                            <input
                                type="text"
                                id="dev-code-input"
                                placeholder="Code"
                                style={{ width: '80px', padding: '8px', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: 'white', fontSize: '0.8rem' }}
                            />
                            <button
                                onClick={() => {
                                    const email = (document.getElementById('dev-email-input') as HTMLInputElement).value;
                                    const code = (document.getElementById('dev-code-input') as HTMLInputElement).value;
                                    if (email && code) db.auth.signInWithMagicCode({ email, code }).catch(e => alert(e.message));
                                }}
                                className="btn-primary"
                                style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                            >
                                Login
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
