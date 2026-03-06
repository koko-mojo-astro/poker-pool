// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
    // We inferred 10 attributes!
    // Take a look at this schema, and if everything looks good,
    // run `push schema` again to enforce the types.
    entities: {
        $files: i.entity({
            path: i.string().unique().indexed(),
            url: i.string(),
        }),
        $streams: i.entity({
            abortReason: i.string().optional(),
            clientId: i.string().unique().indexed(),
            done: i.boolean().optional(),
            size: i.number().optional(),
        }),
        $users: i.entity({
            email: i.string().unique().indexed().optional(),
            imageURL: i.string().optional(),
            type: i.string().optional(),
        }),
        matches: i.entity({
            netChanges: i.json(),
            playerSnapshots: i.json(),
            roomCode: i.string().optional(),
            settlements: i.json(),
            timestamp: i.number().indexed(),
            winnerId: i.string(),
            winnerName: i.string(),
        }),
        profiles: i.entity({
            displayName: i.string(),
            profilePicUrl: i.string().optional(),
        }),
        roomPlayers: i.entity({
            cardCount: i.number(),
            hand: i.json(),
            hasLicense: i.boolean(),
            isCreator: i.boolean(),
            jokerBalls: i.json(),
        }),
        rooms: i.entity({
            config: i.json(),
            deck: i.json(),
            pottedCards: i.json(),
            roomCode: i.string().unique().indexed().optional(),
            status: i.string(),
            totalSettlements: i.json().optional(),
            turnOrder: i.json().optional(),
            winnerId: i.string().optional(),
        }),
    },
    links: {
        $streams$files: {
            forward: {
                on: "$streams",
                has: "many",
                label: "$files",
            },
            reverse: {
                on: "$files",
                has: "one",
                label: "$stream",
                onDelete: "cascade",
            },
        },
        $usersLinkedPrimaryUser: {
            forward: {
                on: "$users",
                has: "one",
                label: "linkedPrimaryUser",
                onDelete: "cascade",
            },
            reverse: {
                on: "$users",
                has: "many",
                label: "linkedGuestUsers",
            },
        },
        matchesPlayers: {
            forward: {
                on: "matches",
                has: "many",
                label: "players",
            },
            reverse: {
                on: "profiles",
                has: "many",
                label: "matches",
            },
        },
        matchesRoom: {
            forward: {
                on: "matches",
                has: "one",
                label: "room",
            },
            reverse: {
                on: "rooms",
                has: "many",
                label: "matches",
            },
        },
        profilesUser: {
            forward: {
                on: "profiles",
                has: "one",
                label: "user",
                onDelete: "cascade",
            },
            reverse: {
                on: "$users",
                has: "one",
                label: "profile",
            },
        },
        roomPlayersProfile: {
            forward: {
                on: "roomPlayers",
                has: "one",
                label: "profile",
            },
            reverse: {
                on: "profiles",
                has: "many",
                label: "roomPlayers",
            },
        },
        roomPlayersRoom: {
            forward: {
                on: "roomPlayers",
                has: "one",
                label: "room",
                onDelete: "cascade",
            },
            reverse: {
                on: "rooms",
                has: "many",
                label: "players",
            },
        },
    },
    rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema { }
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
