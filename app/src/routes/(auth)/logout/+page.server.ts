import { redirect } from "@sveltejs/kit"
import { prisma } from "$lib/server"

export const load = () => {
  throw redirect(302, '/')
}

export const actions = {
  default: async ({ cookies }) => {
    const id = cookies.get('gplace_session')
    if (id) await prisma.session.delete({ where: { id } }).catch(() => {})
    cookies.delete('gplace_session', { path: '/' })
    throw redirect(302, '/')
  }
}
