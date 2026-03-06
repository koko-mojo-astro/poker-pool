/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import { db } from './lib/db';
import { LoginScreen } from './components/LoginScreen';
import { ProfileSettings } from './components/ProfileSettings';
import { ProfileModal } from './components/ProfileModal';
import { useGameState } from './hooks/useGameState.ts';
import { Home } from './components/Home';
import { WaitingRoom } from './components/WaitingRoom';
import { GameScreen } from './components/GameScreen';
import { VictoryScreen } from './components/VictoryScreen';

function ProfileGuard({ children }: { children: React.ReactNode }) {
  const { user } = db.useAuth();
  const { data, isLoading } = db.useQuery(user ? { $users: { $: { where: { id: user.id } }, profile: {} } } : null);

  if (isLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>Loading Profile...</div>;

  const profileData = data?.$users?.[0]?.profile as any;
  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  if (!profile) {
    return <ProfileSettings isInitialSetup={true} />;
  }

  return <>{children}</>;
}

function MainApp() {
  const { sendMessage, gameState, playerId, error, isLoading } = useGameState();
  const [showProfile, setShowProfile] = useState(false);

  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  let screen: React.ReactNode;

  if (!gameState) {
    screen = <Home sendMessage={sendMessage} error={error} />;
  } else if (gameState.status === 'WAITING') {
    screen = <WaitingRoom gameState={gameState} playerId={playerId} sendMessage={sendMessage} />;
  } else if (gameState.status === 'PLAYING') {
    screen = <GameScreen gameState={gameState} playerId={playerId} sendMessage={sendMessage} />;
  } else if (gameState.status === 'FINISHED') {
    screen = <VictoryScreen gameState={gameState} playerId={playerId} sendMessage={sendMessage} />;
  } else {
    screen = <div>Unknown State</div>;
  }

  return (
    <>
      {screen}

      {/* Global floating profile button — visible on all screens */}
      {!showProfile && (
        <button
          onClick={() => setShowProfile(true)}
          title="Profile & History"
          style={{
            position: 'fixed',
            top: 'var(--gap-lg)',
            right: 'var(--gap-lg)',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-main)',
            zIndex: 100,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </button>
      )}

      {/* Global profile modal overlay */}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  );
}

function App() {
  const { isLoading, error } = db.useAuth();

  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>Authenticating...</div>;
  }

  if (error) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'red' }}>Auth Error: {error.message}</div>;
  }

  return (
    <>
      <db.SignedIn>
        <ProfileGuard>
          <MainApp />
        </ProfileGuard>
      </db.SignedIn>
      <db.SignedOut>
        <LoginScreen />
      </db.SignedOut>
    </>
  );
}

export default App;
