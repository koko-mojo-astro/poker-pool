---
name: game-engine-extension
description: How to add new game actions to GameEngine.ts and wire them through useGameState.ts and the UI components.
---

# Game Engine Extension Skill

This skill explains the full pattern for adding a new game action (e.g., a new player move, a new room lifecycle event) to the poker-pool app.

## Architecture Overview

```
UI Component
    │  calls sendMessage({ type: 'MY_NEW_ACTION', payload: { ... } })
    ▼
useGameState.ts (sendMessage dispatcher)
    │  switch (msg.type) → case 'MY_NEW_ACTION'
    ▼
GameEngine.ts (static async method)
    │  validates state, computes changes
    ▼
db.transact([...txs])  ← single atomic write to InstantDB
    │
    ▼
InstantDB reactively updates all subscribed clients via useQuery
```

## Step 1: Define the Message Type

In `src/types.ts`, add to the `ClientMessage` union:
```ts
export type ClientMessage =
  | { type: 'MY_NEW_ACTION'; payload: { someParam: string } }
  // ... existing types
```

If the server needs to respond with new server event types, add to `ServerMessage` too (though currently all responses are through reactive DB updates, not explicit server messages).

## Step 2: Add the GameEngine Method

In `src/lib/GameEngine.ts`, add a new `static async` method:

```ts
static async myNewAction(
  db: any,
  roomData: any,
  playerId: string,
  someParam: string
) {
  // 1. Guard: validate preconditions
  if (!roomData || roomData.status !== 'PLAYING') return;
  const player = roomData.players.find((p: any) => p.id === playerId);
  if (!player) return;

  // 2. Compute what changes
  const txs: any[] = [];
  
  // 3. Build transactions
  txs.push(tx.roomPlayers[playerId].update({ /* changes */ }));
  txs.push(tx.rooms[roomData.id].update({ /* changes */ }));
  
  // 4. Atomic write
  await db.transact(txs);
}
```

### Rules for GameEngine methods
- Always guard with status check first (`roomData.status === 'PLAYING'` etc.)
- Always guard with player existence check
- Use spread to avoid mutating existing arrays: `const newHand = [...player.hand]`
- **Batch all writes** into one `db.transact(txs)` — never call transact multiple times
- Get player profile display name via: `p.profile?.[0]?.displayName || p.profile?.displayName || 'Player'`

## Step 3: Wire Into useGameState

In `src/hooks/useGameState.ts`, the `sendMessage` function's `switch` statement:

```ts
case 'MY_NEW_ACTION':
  if (activeRoom && activePlayerId) {
    await GameEngine.myNewAction(
      db,
      roomData,
      activePlayerId,
      msg.payload.someParam
    );
  }
  break;
```

The `roomData` variable is already prepared:
```ts
const roomData = activeRoom ? {
  ...activeRoom,
  players: activeRoom.players || []
} : null;
```

## Step 4: Add UI

In the relevant component (e.g., `GameScreen.tsx`):

```tsx
const handleMyAction = () => {
  sendMessage({ type: 'MY_NEW_ACTION', payload: { someParam: 'value' } });
};

// Render
<button onClick={handleMyAction} className="btn-primary">
  Do Action
</button>
```

### Design rules for action buttons
- Use `.btn-primary` for primary CTA actions
- Use `style={{ background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}` for destructive actions
- Always `confirm()` before destructive actions (foul, exit room, disband)

## Step 5: Test

1. Open two browser tabs (two different accounts)
2. Create a room in Tab 1, join in Tab 2
3. Trigger the new action in one tab
4. Verify the other tab updates **without a page refresh** (InstantDB real-time)
5. Run `npx tsc --noEmit` to confirm no type errors

## Common Patterns

### Recording a match event
```ts
const matchId = id();
txs.push(
  tx.matches[matchId].update({
    winnerId,
    winnerName,
    timestamp: Date.now(),
    netChanges,
    playerSnapshots,
    settlements
  }).link({ room: roomData.id })
);
// Link all players' profiles to the match
roomData.players.forEach((p: any) => {
  const profileId = p.profile?.[0]?.id;
  if (profileId) txs.push(tx.matches[matchId].link({ players: profileId }));
});
```

### Resetting a player's state
```ts
txs.push(tx.roomPlayers[playerId].update({
  hand: [],
  hasLicense: false,
  jokerBalls: { direct: 0, all: 0 },
  cardCount: 0
}));
```

### Drawing from the deck (skip potted ranks)
```ts
const deck = [...(roomData.deck || [])];
let cardToDraw = null;
while (deck.length > 0) {
  cardToDraw = deck.pop();
  if (cardToDraw && !(roomData.pottedCards || []).includes(cardToDraw.rank)) break;
  cardToDraw = null;
}
if (cardToDraw) {
  txs.push(tx.rooms[roomData.id].update({ deck }));
  txs.push(tx.roomPlayers[playerId].update({
    hand: [...player.hand, cardToDraw],
    cardCount: player.hand.length + 1
  }));
}
```
