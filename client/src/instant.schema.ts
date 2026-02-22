import { i } from '@instantdb/react';

// Room Config
const roomConfig = i.json();



const _schema = i.schema({
    entities: {
        $users: i.entity({
            email: i.string().unique().indexed().optional(),
        }),
        profiles: i.entity({
            displayName: i.string(),
            profilePicUrl: i.string().optional(),
        }),
        rooms: i.entity({
            roomCode: i.string().unique().indexed().optional(),
            config: roomConfig,
            status: i.string(), // 'WAITING' | 'PLAYING' | 'FINISHED'
            pottedCards: i.json(), // array of ranks e.g., ['7', 'K']
            deck: i.json(), // Array of Card objects
            winnerId: i.string().optional(),
            totalSettlements: i.json().optional(), // Record<string, number> - accumulated net changes
        }),
        roomPlayers: i.entity({
            hand: i.json(), // Array of Card objects
            hasLicense: i.boolean(),
            jokerBalls: i.json(), // { direct: number, all: number }
            isCreator: i.boolean(),
            cardCount: i.number(),
        }),
        matches: i.entity({
            winnerId: i.string(),
            winnerName: i.string(),
            timestamp: i.number().indexed(),
            netChanges: i.json(), // Record<string, number>
            playerSnapshots: i.json(), // PlayerSnapshot[]
            settlements: i.json(), // PairwiseSettlement[]
        }),
    },
    links: {
        userProfile: {
            forward: { on: "profiles", has: "one", label: "user", onDelete: "cascade" },
            reverse: { on: "$users", has: "one", label: "profile" },
        },
        roomToPlayers: {
            forward: { on: "roomPlayers", has: "one", label: "room", onDelete: "cascade" },
            reverse: { on: "rooms", has: "many", label: "players" },
        },
        playerToProfile: {
            forward: { on: "roomPlayers", has: "one", label: "profile" },
            reverse: { on: "profiles", has: "many", label: "roomPlayers" },
        },
        matchPlayers: {
            forward: { on: "matches", has: "many", label: "players" },
            reverse: { on: "profiles", has: "many", label: "matches" },
        },
        roomMatches: {
            forward: { on: "matches", has: "one", label: "room", onDelete: "cascade" },
            reverse: { on: "rooms", has: "many", label: "matches" },
        }
    },
});

export type AppSchema = typeof _schema;
export default _schema;
