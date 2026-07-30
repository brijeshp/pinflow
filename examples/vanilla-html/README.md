# Vanilla HTML Example

The simplest possible Pinflow integration — one `<script>` tag.

## Run locally

Open `index.html` in a browser, or serve it:

```bash
npx serve .
```

Then open `http://localhost:3000/?reviewer=YourName` and click any element to leave a comment.

## How it works

```html
<script
  src="https://cdn.jsdelivr.net/npm/@brijeshp/pinflow@latest"
  data-project="vanilla-demo"
></script>
```

That's the entire integration. No npm, no build step, no config file.

## Builder mode

Open `http://localhost:3000/?mode=builder` to see all comments left by all reviewers on this browser.
