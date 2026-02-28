# pdf-spoiler

Web app that renders PDFs in the browser and lets you hide solutions behind overlays. Useful for problem sets or other study materials where you want to attempt the questions first before seeing the answer.

## Features

- Pixel-perfect PDF rendering via [PDF.js](https://mozilla.github.io/pdf.js/)
- Configurable solution detection through inputting a list of text patterns
- Fully client-side and local - no data leaves the browser

## Some limitations (may fix in the future)

- Does not work with images, only text can be parsed
- Cannot parse answers that don't start with a pattern like `Answer: `

## License

See [LICENSE](LICENSE).