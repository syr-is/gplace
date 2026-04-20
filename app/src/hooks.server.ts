import { prisma } from '$lib/server';
import { getProfile } from '$lib/server/profile';
import type { Handle } from '@sveltejs/kit';
import { enhance } from '@zenstackhq/runtime';

const auth = (async ({ event, resolve }) => {
    const sessionId = event.cookies.get('gplace_session');
    if (sessionId) {
        const session = await prisma.session
            .findUnique({
                where: { id: sessionId },
                include: { user: true }
            })
            .catch(() => null);

        if (session && session.tokenExpiresAt > new Date()) {
            event.locals.session = {
                sessionId: session.id,
                did: session.did,
                syrInstanceUrl: session.syrInstanceUrl,
                delegatePublicKey: session.delegatePublicKey,
                platformToken: session.platformToken
            };
            event.locals.localUser = session.user;
            const profile = await getProfile(session.did, session.syrInstanceUrl).catch(
                () => null
            );
            if (profile) event.locals.profile = profile;
        } else {
            if (session) {
                await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
            }
            event.cookies.delete('gplace_session', { path: '/' });
        }
    }

    event.locals.db = enhance(prisma, {
        user: event.locals.localUser ? { ...event.locals.localUser } : undefined
    });

    return resolve(event);
}) satisfies Handle;

export const handle = auth;
