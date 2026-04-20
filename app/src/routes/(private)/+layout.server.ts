import { redirect } from "@sveltejs/kit"

export const load = async ({ locals, url }) => {
	if (!locals.localUser) {
		throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname + url.search)}`)
	}
}
