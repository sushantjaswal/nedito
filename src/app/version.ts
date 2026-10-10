// The app's version, read from package.json rather than written out anywhere else, so the About
// dialog (N4) and every file the app writes (D110) can never disagree with the release.
//
// A default import with the JSON import attribute, not a named one: the E2E specs load app modules
// through plain Node, whose JSON modules have only a default export and require the attribute.
import pkg from "../../package.json" with { type: "json" };

export const APP_VERSION: string = pkg.version;
