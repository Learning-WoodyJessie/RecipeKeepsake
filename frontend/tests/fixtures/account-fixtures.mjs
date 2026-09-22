// Two canonical account shapes, reused across the account-sweep regression
// tests and for manual verification. NEW_ACCOUNT is what every brand-new
// sign-in looks like from the API's point of view — no group, no people, no
// memories — the exact shape that crashed the Account page (missed .group
// null check) and broke the People page (blank share links) in Sep 2026.
// ESTABLISHED_ACCOUNT is a normal account with a group, people, and memories,
// to catch the opposite class of bug (code that only works when data exists).

export const NEW_ACCOUNT = {
  group: { group: null, portal_url: null, invite_url: null },
  familyRecipes: { recipes: [] },
  people: { people: [] },
  recipes: { recipes: [] },
}

const GROUP = { id: 'g1', name: 'Test Family', portal_token: 'pt1', invite_token: 'it1' }
const PERSON = { id: 'p1', name: 'Amma', relationship: 'Mother', emoji: '👩', photo_url: null, bio: '', notes: '' }
const RECIPE = {
  token: 'tok12345', slug: 'ammas-pickle-tok12345', title: "Amma's Pickle", narrator: 'Amma',
  recorded_at: '2026-01-01T00:00:00Z', image_url: null, audio_url: null,
  tags: ['recipe'], type: 'recipe', recorded_by_name: 'Amma', portal_visible: true,
}

export const ESTABLISHED_ACCOUNT = {
  group: {
    group: GROUP,
    portal_url: 'https://www.theechoesofhome.com/family?p=pt1',
    invite_url: 'https://www.theechoesofhome.com/join?invite=it1',
  },
  familyRecipes: { recipes: [RECIPE] },
  people: { people: [PERSON] },
  recipes: { recipes: [RECIPE] },
}

// Installs a window.fetch stub that answers every endpoint these six pages
// call on load (Home, Recipes, Moments, Search, People, Collection) from one
// fixture. Must run synchronously during render (before the target page's
// own effects fire), same as the ad-hoc stubs used earlier this session.
export function installAccountStub(fixture) {
  if (typeof window === 'undefined') return
  window.fetch = async (input) => {
    const url = String(input)
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/family/groups/me')) return json(fixture.group)
    if (url.includes('/family/recipes')) return json(fixture.familyRecipes)
    if (url.includes('/people')) return json(fixture.people)
    if (url.includes('/recipes')) return json(fixture.recipes)
    return json({})
  }
}
