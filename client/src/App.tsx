/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from './lib/db';
import { LoginScreen } from './components/LoginScreen';
import { ProfileSettings } from './components/ProfileSettings';
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

  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>Loading...</div>;
  }

  if (!gameState) {
    return <Home sendMessage={sendMessage} error={error} />;
  }

  if (gameState.status === 'WAITING') {
    return <WaitingRoom gameState={gameState} playerId={playerId} sendMessage={sendMessage} />;
  }

  if (gameState.status === 'PLAYING') {
    return <GameScreen gameState={gameState} playerId={playerId} sendMessage={sendMessage} />;
  }

  if (gameState.status === 'FINISHED') {
    return <VictoryScreen gameState={gameState} playerId={playerId} sendMessage={sendMessage} />;
  }

  return <div>Unknown State</div>;
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
