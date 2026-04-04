# ROI Calculator Launch

This repo is set up so the deployable site lives in:

`/custom-software-roi-calculator`

That directory is self-contained for static hosting and includes:

- `index.html`
- `styles.css`
- `calculator.js`
- `favicon.svg`
- `robots.txt`
- `sitemap.xml`
- `_headers`
- `_redirects`

## GitHub

Recommended repo:

- `gera3d/why57-roi-calculator`

After push, GitHub Actions will publish a preview build from `custom-software-roi-calculator/`.

## Cloudflare Pages

1. Create a new Pages project from the GitHub repo.
2. Set the production branch to `main`.
3. Set the build command to blank.
4. Set the output directory to `custom-software-roi-calculator`.
5. Add the custom domain `roi.why57.com`.
6. In Cloudflare DNS, point `roi` at the Pages hostname Cloudflare gives you.

Cloudflare reference docs:

- Headers: `https://developers.cloudflare.com/pages/configuration/headers/`
- Redirects: `https://developers.cloudflare.com/pages/configuration/redirects/`

## Search Setup

1. Add `https://roi.why57.com/` as a URL-prefix property in Google Search Console.
2. Submit `https://roi.why57.com/sitemap.xml`.
3. Add the same URL-prefix property in Bing Webmaster Tools.
4. Make sure `why57.com` links to the calculator from at least:
   - the main navigation or services page
   - the custom software guide
   - one or two relevant blog or landing pages
5. After the subdomain is live, request indexing for the homepage in Google Search Console.

## SEO Notes

- The live canonical is already set to `https://roi.why57.com/`.
- `robots.txt` and `sitemap.xml` are present in the deploy directory.
- The page includes FAQ schema and WebPage schema.
- The GitHub Pages preview should be treated as a staging URL, not the canonical production URL.
