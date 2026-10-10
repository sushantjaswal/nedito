// A sitemap.
//
// Pages, not features: each box is a URL someone can land on, which is what makes a sitemap
// useful for navigation design rather than a second copy of the backlog. Three levels, with the
// utility pages kept off to one side because they hang off the whole site rather than off Home.
import { ACCENT, BRANCH, PLAIN, SOFT, indent, link, node, page } from "./thinkKit";
import { templateDoc } from "../starters/basicFlowchart";

const PAGE = "general/rect";

const SECTIONS: [string, string, [string, string][]][] = [
  ["Products", "/products", [["Category", "/products/:category"], ["Product detail", "/p/:sku"], ["Compare", "/compare"]]],
  ["Basket", "/basket", [["Checkout", "/checkout"], ["Order confirmed", "/checkout/done"]]],
  ["Account", "/account", [["Orders", "/account/orders"], ["Addresses", "/account/addresses"], ["Preferences", "/account/settings"]]],
];
const UTILITY: [string, string][] = [["Search", "/search"], ["Help", "/help"], ["Legal", "/legal"]];

const COL = 290;
const X0 = 60;
/** Each page shows its name and its URL: a sitemap is a map of places someone can land. */
const label = (name: string, path: string) => `${name}\n${path}`;

const diagram = page(
  "dSitemap",
  "Sitemap",
  [
    node("smHome", PAGE, label("Home", "/"), X0 + 1.5 * COL - 10, 40, 220, 60, 1, ACCENT),
    ...SECTIONS.flatMap(([section, path, pages], s) => [
      node(`smS${s}`, PAGE, label(section, path), X0 + s * COL, 170, 220, 56, 2 + s, PLAIN),
      ...pages.map(([p, url], i) => node(`smP${s}x${i}`, PAGE, label(p, url), X0 + s * COL + 40, 270 + i * 76, 210, 52, 6 + s * 3 + i, SOFT)),
    ]),
    // Utility pages hang off every page (the footer), not off Home's navigation, so the line to
    // them is dashed.
    node("smUtil", PAGE, label("Utility", "footer links"), X0 + 3 * COL, 170, 220, 56, 20, { ...PLAIN, stroke: "#66707D" }),
    ...UTILITY.map(([p, url], i) => node(`smU${i}`, PAGE, label(p, url), X0 + 3 * COL + 40, 270 + i * 76, 210, 52, 21 + i, SOFT)),
  ],
  [
    ...SECTIONS.flatMap(([, , pages], s) => [
      link(`smHS${s}`, "smHome", `smS${s}`, BRANCH, undefined, ["bottom", "top"]),
      ...pages.map((_, i) => indent(`smSP${s}x${i}`, `smS${s}`, `smP${s}x${i}`)),
    ]),
    link("smHU", "smHome", "smUtil", { ...BRANCH, dash: "dashed" }, undefined, ["bottom", "top"]),
    ...UTILITY.map((_, i) => indent(`smUU${i}`, "smUtil", `smU${i}`)),
  ],
);

export default templateDoc("Sitemap", [diagram]);
