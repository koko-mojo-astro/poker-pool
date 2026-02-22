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
            </div>
        </div>
    );
};
