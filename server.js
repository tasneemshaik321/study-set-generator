import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const envPath = path.resolve(__dirname, '.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true })
} else {
  dotenv.config({ path: path.resolve(__dirname, '.env.example'), override: true })
}

const app = express()
const port = process.env.PORT || 3001

app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

function extractJson(text) {
  const trimmed = `${text || ''}`.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fencedMatch ? fencedMatch[1] : trimmed
  return JSON.parse(candidate)
}

function normalizeDifficulty(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (!raw) return 'medium'
  if (['easy', 'easier', 'simple', 'low', 'beginner', '1', 'one'].includes(raw)) return 'easy'
  if (['medium', 'moderate', 'middle', 'normal', 'intermediate', '2', 'two'].includes(raw)) return 'medium'
  if (['hard', 'difficult', 'challenging', 'high', '3', 'three'].includes(raw)) return 'hard'
  return 'medium'
}

function validateStudySet(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : 'Study set'

  const cards = Array.isArray(payload.cards)
    ? payload.cards
        .map((card) => {
          if (!card || typeof card !== 'object') {
            return null
          }

          const front = typeof card.front === 'string' ? card.front.trim() : ''
          const back = typeof card.back === 'string' ? card.back.trim() : ''
          const difficulty = normalizeDifficulty(card.difficulty)

          if (!front || !back) {
            return null
          }

          return {
            front,
            back,
            difficulty,
          }
        })
        .filter(Boolean)
    : []

  if (cards.length === 0) {
    return null
  }

  return {
    title,
    cards,
  }
}

async function callModel(prompt) {
  const requestedProvider = `${process.env.AI_PROVIDER || ''}`.trim().toLowerCase()
  const model = process.env.AI_MODEL || 'openai/gpt-4o-mini'
  const providers = []

  if (process.env.GROQ_API_KEY) providers.push('groq')
  if (process.env.GEMINI_API_KEY) providers.push('gemini')
  if (process.env.OPENROUTER_API_KEY) providers.push('openrouter')

  const selectedProvider = requestedProvider && providers.includes(requestedProvider)
    ? requestedProvider
    : providers[0]

  if (!selectedProvider) {
    throw new Error('No AI API key has been configured. Add OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY to the environment.')
  }

  if (selectedProvider === 'groq') {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'llama-3.1-8b-instant',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You produce concise study flashcards. Return valid JSON with a title string and cards array of {front, back, difficulty} objects. difficulty must be one of easy, medium, or hard.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Groq request failed (${response.status})`)
    }

    const data = await response.json()
    return data?.choices?.[0]?.message?.content || ''
  }

  if (selectedProvider === 'gemini') {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `Return compact JSON only. Schema: {"title":"...","cards":[{"front":"...","back":"...","difficulty":"easy|medium|hard"}]}. Use only one of easy, medium, or hard for each difficulty. ${prompt}`,
          }],
        }],
      }),
    })

    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status})`)
    }

    const data = await response.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:5173',
      'X-Title': 'Study Assistant',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Generate a short study set. Return a JSON object with title and cards array. Each card must contain front, back, and difficulty. Use only easy, medium, or hard values for difficulty.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter request failed (${response.status})`)
  }

  const data = await response.json()
  return data?.choices?.[0]?.message?.content || ''
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.post('/api/flashcards', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : ''

  if (!prompt) {
    return res.status(400).json({ error: 'Please share a topic or notes to turn into flashcards.' })
  }

  try {
    const aiPrompt = `Turn these notes into a compact study set for a learner: ${prompt}`
    const rawText = await callModel(aiPrompt)
    const parsed = extractJson(rawText)
    const studySet = validateStudySet(parsed)

    if (!studySet) {
      return res.status(502).json({ error: 'The model returned an unexpected study structure. Please try again.' })
    }

    return res.json(studySet)
  } catch (error) {
    console.error(error)
    return res.status(502).json({ error: error.message || 'The model call failed. Please try again.' })
  }
})

app.listen(port, () => {
  console.log(`Study assistant API running on http://localhost:${port}`)
})
