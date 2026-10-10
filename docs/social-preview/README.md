# Social preview

`social-preview.png` is the 1280×640 picture GitHub shows when the repository's link is shared
(D150). It shows the Azure landing zone template at its top level, with a zoom from the Retail
spoke Nested Block into the level inside it, next to the name and tagline.

| File | What it is |
|---|---|
| `social-preview.png` | The picture, as uploaded to GitHub |
| `card.html` | The card's layout: text, colours, and where the two views and the zoom sit |
| `top.png`, `inside.png` | The two views, captured from the app |

## Regenerating it

After the app's look or the template changes:

```powershell
npm run dev
npm run social-preview
```

The second command captures both views again and renders `card.html` to `social-preview.png`.
The highlight and the zoom in `card.html` are placed for the current captures, so check the
result and move them if the template's layout has changed.

Then upload it on GitHub: **Settings › General › Social preview › Edit › Upload an image**. GitHub
has no API for this, so it is always a manual step.
