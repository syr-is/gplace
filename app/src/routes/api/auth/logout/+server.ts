import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server';

export const POST = async ({ cookies }) => {
    const sessionId = cookies.get('gplace_session');
    if (sessionId) {
        // deleteMany tolerates missing rows (no throw) but still propagates real DB errors,
        // so we don't ack a logout if server-side revocation actually failed.
        await prisma.session.deleteMany({ where: { id: sessionId } });
    }
    cookies.delete('gplace_session', { path: '/' });
    return json({ ok: true });
};
