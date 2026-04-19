import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server';

export const POST = async ({ cookies }) => {
    const sessionId = cookies.get('gplace_session');
    if (sessionId) {
        await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    cookies.delete('gplace_session', { path: '/' });
    return json({ ok: true });
};
