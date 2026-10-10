// Where the links the app hands out point (D100): share links, and the live link inside a copied
// image. One rule, so no host is ever spelled out anywhere else.
//
// On a production host — the canonical one or an alias that redirects to it — links point at the
// canonical origin, so a link copied on www.nedito.app still lands on nedito.app. Anywhere else (the dev server, tests, a preview deployment) they point back at the
// page itself, so a link made there can be opened there.
import { ALIAS_HOSTS, APP_ORIGIN, BRAND } from "./brand";

interface Place {
  hostname: string;
  origin: string;
  pathname: string;
}

/** Whether a host serves the real app: the canonical host or one that redirects to it. */
export function isProductionHost(hostname: string): boolean {
  return hostname === BRAND.host || ALIAS_HOSTS.includes(hostname);
}

/** The base a share link is built on: up to, not including, the `#`. */
export function appBaseUrl(place: Place = window.location): string {
  return isProductionHost(place.hostname) ? `${APP_ORIGIN}/` : `${place.origin}${place.pathname}`;
}
