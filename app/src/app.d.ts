// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
// and what to do when importing types
import type { PrismaClient, User } from '@prisma/client';
import type { ProfileData } from '$lib/server/profile';

declare global {
    namespace App {
        interface Locals {
            session?: {
                sessionId: string;
                did: string;
                syrInstanceUrl: string;
                delegatePublicKey: string;
                platformToken: string;
            };
            localUser?: User;
            profile?: ProfileData;
            db: PrismaClient;
        }
    }
}

export {};
