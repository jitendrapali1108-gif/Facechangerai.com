# Face Changer AI — GitHub-ready frontend

Single Face Swap · Multiple Face Swap · Video Face Swap

A static HTML/CSS/JavaScript frontend based on the previously working Netlify build. The model dropdown and Connect API control are not in this frontend. Video swapping automatically attempts API-advertised ready models in order.

## Upload to GitHub

1. Create a new repository at https://github.com/new (for example `facechanger-ai`).
2. Extract `FaceChangerAI-GitHub-Ready.zip` **on your PC**. Do not upload the ZIP as a single file expecting GitHub to extract it.
3. Upload **the contents** of the extracted folder (including `index.html`, `assets/`, `style.css`, all `.js` files, `netlify.toml` and `.github/workflows/`) into the repository root, then commit. If the browser uploader skips hidden `.github`, use the Git instructions below or create the workflow through GitHub's web editor.
4. For a production, ad-supported or paid website, connect the repository to **Netlify**: Netlify → Add new project → Import an existing project → GitHub → choose the repository. `netlify.toml` configures the static publish directory. No build command is required.
5. Add your deployment domain to Firebase Authentication **Authorized domains** for Google Sign-in. Configure backend CORS for your site's exact origin.

### Git commands (optional, easiest way to preserve hidden files)

```bash
git init
git add .
git commit -m "Initial FaceChanger AI frontend"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

## Optional GitHub Pages preview

This repository has a **manually triggered** GitHub Actions workflow at `.github/workflows/pages-preview.yml`. For a non-commercial demo only, enable Settings → Pages → Source: **GitHub Actions**; go to Actions → `Publish static preview to GitHub Pages` → Run workflow. Then visit the published page URL shown in the workflow.

> GitHub Pages is not permitted as a free hosting service to run a commercial online business or a commercial software-as-a-service (SaaS) website. For your premium/advertising FaceChanger service, use **GitHub for source control and Netlify for frontend hosting**, with a separate API host.
> GitHub's policy: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## Backend

Configured in `api-config.js`:

`https://lyric-scroll-weekends-towns.trycloudflare.com`

The Python/FastAPI backend, models, and video processing **cannot run on GitHub Pages or as static files on Netlify**. Your local Windows FastAPI backend and Cloudflare Tunnel must both be running, or use a suitable cloud backend. A Cloudflare Quick Tunnel URL can change when restarted; if it changes, edit `api-config.js`, commit, and let Netlify redeploy.

## Included UI

- Single Face / Multiple Face / Video Face tabs
- Photo + video upload, progress and MP4 download UI
- Automatic model fallback on API model-specific failures when the backend reports models ready
- No Connect API button or model selector
- Hero assets and existing login UI

### Testing limitations

This package was statically checked for missing assets and JavaScript syntax. The live Tunnel/API, Google login, actual face swap, and GitHub Pages/Netlify deployment were not exercised as part of this packaging step.
