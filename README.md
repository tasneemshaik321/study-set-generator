# Study Assistant

A small React app that turns free-form notes into a structured flashcard study set. The UI parses AI output into interactive flashcards, filters by difficulty, and handles fallback states when the model returns malformed or empty content.

## Stack

- Frontend: React with hooks and Vite
- Backend: Express + Node.js
- AI providers supported: OpenRouter, Groq, Gemini
- Environment management: dotenv

## AI usage note

The app routes AI requests through a server-side proxy in `server.js` so the API key is never exposed to the browser. It expects structured JSON with a title and cards array. If the model returns malformed JSON, empty responses, or the wrong shape, the app shows an error and allows retrying instead of crashing.

## AI tools used

- GitHub Copilot for code suggestions and implementation guidance
- Local reasoning and review for final behavior and UI decisions

## Demo

- [Watch the project demo](https://drive.google.com/file/d/1B_M8zr_K6vdmbn6x-f-qhcJKMqbsjLBj/view?usp=sharing)

## Features
- Free-form note input
- Structured AI response parsed into flashcards
- Flip-through review experience
- Difficulty filtering
- Loading, error, and empty states
- Mobile-friendly layout

## Run locally
1. Copy .env.example to .env and add an API key.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm start
   ```
4. Open http://localhost:5173

If you prefer separate terminals, you can also run the backend and frontend individually:

```bash
node server.js
npm run dev
```

## AI usage note
The app calls a server-side AI proxy instead of exposing an API key in the browser. It expects a structured JSON response with a title and cards array. If the model returns malformed JSON or the wrong shape, the app surfaces an error state instead of crashing.

## Known limitations
- The app depends on a valid API key from OpenRouter, Groq, or Gemini.
- The server uses a simple JSON parser and validation layer, so very unusual model output may still trigger a retry/error state.
- The current experience focuses on flashcards rather than multi-block rendering.

## Time spent
- Initial scaffold and app structure: ~1 hour
- UI and review flow: ~2 hours
- Backend proxy and error handling: ~2.5 hours
- Polish and documentation: ~1 hour
