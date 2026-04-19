export const load = async ({ locals }) => {
    return {
        localUser: locals.localUser,
        profile: locals.profile ?? null
    }
}
