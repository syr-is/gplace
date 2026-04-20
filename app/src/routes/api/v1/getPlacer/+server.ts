import { error, json } from '@sveltejs/kit'
import { env as publicEnv } from '$env/dynamic/public';
import { getProfile } from '$lib/server/profile';

export const GET = async ({locals, url}) => {
  const PUBLIC_CURRENT_BOARD = publicEnv.PUBLIC_CURRENT_BOARD ?? ''
  if (PUBLIC_CURRENT_BOARD == '') {
    throw error(500, "No board selected")
  }
  const urlX = url.searchParams.get("x")
  const urlY = url.searchParams.get("y")
  if (!urlX || !urlY) {
    throw error(400, "Missing x or y")
  }
  const x = parseInt(urlX)
  const y = parseInt(urlY)
  const board = await locals.db.board.findUnique({
    where: {
      name: PUBLIC_CURRENT_BOARD
    }
  })
  if (!board) {
    throw error(500, "Board hasn't been set, contact admin.")
  }
  const pixel = await locals.db.pixel.findUnique({
    where: {
      PixelIdentifier: {
        boardId: board.id,
        x,
        y
      }
    },
    select: {
      user: {
        select: {
          id: true,
          role: true,
          syrInstanceUrl: true,
          totalPixelsChanged: true
        }
      }
    }
  })
  if (!pixel) {
    throw error(404, "Pixel not found")
  }
  if (!pixel.user) {
    throw error(404, "User not found")
  }
  const user = pixel.user
  const profile = await getProfile(user.id, user.syrInstanceUrl).catch(() => null)
  return json({
    id: user.id,
    role: user.role,
    syrInstanceUrl: user.syrInstanceUrl,
    totalPixelsChanged: user.totalPixelsChanged,
    username: profile?.displayName ?? profile?.username ?? user.id.slice(0, 12),
    avatar: profile?.avatarUrl ?? null,
    banner: profile?.bannerUrl ?? null,
    webProfileUrl: profile?.webProfileUrl ?? null
  })
}
