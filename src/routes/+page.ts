import { redirect } from '@sveltejs/kit';

// No landing page: the app *is* the map. `/` lands on the Canvas view, which is
// the default renderer (same call as in logistica-oceanica).
export function load() {
  redirect(307, '/map/canvas');
}
