import { useWebSocket } from './hooks/useWebSocket';
import { Home } from './components/Home';
import { WaitingRoom } from './components/WaitingRoom';
import { GameScreen } from './components/GameScreen';
import { VictoryScreen } from './components/VictoryScreen';

function App() {
  const { sendMessage, gameState, playerId, error, isConnected } = useWebSocket();

  if (!isConnected && !error) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>Connecting...</div>;
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

export default App;
