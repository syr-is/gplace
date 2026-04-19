import { error } from "@sveltejs/kit"
import { getProfile } from "$lib/server/profile"

export const load = async ({locals}) => {
  const getTopChangers = async () => {
    const rows = await locals.db.user.findMany({
      orderBy: {
        totalPixelsChanged: 'desc'
      },
      take: 10,
      select: {
        id: true,
        totalPixelsChanged: true,
        syrInstanceUrl: true,
        role: true
      }
    })
    if (!rows) {
      throw error(500, "Error while fetching top changers")
    }
    const enriched = await Promise.all(rows.map(async (r) => {
      const p = await getProfile(r.id, r.syrInstanceUrl).catch(() => null)
      return {
        id: r.id,
        role: r.role,
        totalPixelsChanged: r.totalPixelsChanged,
        username: p?.displayName ?? p?.username ?? r.id.slice(0, 12),
        avatar: p?.avatarUrl ?? null,
        banner: p?.bannerUrl ?? null,
        webProfileUrl: p?.webProfileUrl ?? null
      }
    }))
    return enriched
  }
  return {lazy: {
    topChangers: getTopChangers()
  }}
}
