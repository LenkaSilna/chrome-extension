# Word Highlighter Chrome Extension

A Chrome extension that highlights important words on web pages and provides explanations using the Gemini API.

## Features

- Automatically highlights important words on web pages
- Shows tooltips with explanations when hovering over highlighted words
- Uses Google's Gemini API for intelligent text analysis
- Modern React-based popup interface
- Secure API key storage

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `dist` directory from this project

## Usage

1.	Click the extension icon in Chrome.
2.	Enter your Gemini API key in the popup.
3.	Turn on Highlighting – this enables manual highlighting.
4.	Turn on Auto-highlight words – words will be automatically highlighted, and tooltips with suggestions will appear on hover.
5.	Select text with your cursor – a tooltip will appear after selection, offering suggestions or explanations.
6.	Hover over highlighted words to see explanations.

## Development

- `npm run dev` - Start development server
- `npm run build` - Build the extension
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:e2e:ui` - Run end-to-end tests with UI

## Requirements

- Node.js 16+
- Chrome browser
- Gemini API key (get one from Google AI Studio)

## License

MIT 