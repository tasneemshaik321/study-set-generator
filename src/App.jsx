import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const INITIAL_PROMPT = 'Biology chapter on cell transport, with focus on osmosis and active transport.'

const shuffleArray = (values) => {
  const copy = [...values]

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }

  return copy
}

const buildMcqQuestions = (sourceCards) =>
  sourceCards.map((card) => {
    const correctAnswer = card.back?.trim() || 'Answer'
    const distractors = sourceCards
      .filter((candidate) => candidate.back?.trim().toLowerCase() !== correctAnswer.toLowerCase())
      .map((candidate) => candidate.back?.trim())
      .filter(Boolean)

    const optionPool = [correctAnswer, ...distractors.slice(0, 3)]
    const uniqueOptions = Array.from(new Set(optionPool.filter(Boolean)))

    const options = shuffleArray(uniqueOptions).slice(0, 4)

    if (!options.includes(correctAnswer)) {
      options[0] = correctAnswer
    }

    return {
      ...card,
      options,
      correctAnswer,
    }
  })

function App() {
  const [prompt, setPrompt] = useState(INITIAL_PROMPT)
  const [cards, setCards] = useState([])
  const [title, setTitle] = useState('Study set')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [reviewMode, setReviewMode] = useState('all')
  const latestRequestIdRef = useRef(0)
  const activeAbortControllerRef = useRef(null)
  const [theme, setTheme] = useState(() => localStorage.getItem('flam-theme') || 'light')
  const [mode, setMode] = useState('review')
  const [quizQuestions, setQuizQuestions] = useState([])
  const [quizIndex, setQuizIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState('')
  const [quizFeedback, setQuizFeedback] = useState(null)
  const [quizResults, setQuizResults] = useState([])
  const [quizComplete, setQuizComplete] = useState(false)

  const visibleCards = useMemo(() => {
    if (reviewMode === 'easy') return cards.filter((card) => String(card.difficulty).toLowerCase() === 'easy')
    if (reviewMode === 'hard') return cards.filter((card) => String(card.difficulty).toLowerCase() === 'hard')
    return cards
  }, [cards, reviewMode])

  const currentCard = visibleCards[currentIndex] || null
  const currentQuizCard = quizQuestions[quizIndex] || null
  const quizScore = quizResults.filter((result) => result.correct).length
  const missedQuestions = quizResults.filter((result) => !result.correct)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('flam-theme', theme)
  }, [theme])

  const resetReviewState = () => {
    setCurrentIndex(0)
    setFlipped(false)
  }

  const resetQuizState = () => {
    setQuizQuestions([])
    setQuizIndex(0)
    setSelectedOption('')
    setQuizFeedback(null)
    setQuizResults([])
    setQuizComplete(false)
  }

  const startQuiz = (retestWrong = false) => {
    if (!cards.length) return

    const source = retestWrong
      ? quizResults.filter((result) => !result.correct).map((result) => result.card)
      : cards

    if (!source.length) {
      setQuizQuestions([])
      setQuizIndex(0)
      setSelectedOption('')
      setQuizFeedback(null)
      setQuizComplete(true)
      return
    }

    setMode('quiz')
    setQuizQuestions(buildMcqQuestions(source))
    setQuizIndex(0)
    setSelectedOption('')
    setQuizFeedback(null)
    setQuizResults(retestWrong ? [] : [])
    setQuizComplete(false)
  }

  const submitPrompt = async (promptText) => {
    const requestId = latestRequestIdRef.current + 1
    latestRequestIdRef.current = requestId

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort()
    }

    const controller = new AbortController()
    activeAbortControllerRef.current = controller

    setIsLoading(true)
    setError('')
    setCards([])
    setTitle('Study set')
    resetReviewState()
    resetQuizState()

    try {
      const response = await fetch('http://localhost:3001/api/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
        signal: controller.signal,
      })

      if (requestId !== latestRequestIdRef.current) return

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || 'The model request failed.')
      }

      if (!Array.isArray(data?.cards) || data.cards.length === 0) {
        throw new Error('The model did not return any cards.')
      }

      setTitle(data.title || 'Study set')
      setCards(data.cards)
      setReviewMode('all')
      setMode('review')
    } catch (caughtError) {
      if (requestId !== latestRequestIdRef.current) return
      if (caughtError.name === 'AbortError') return
      setError(caughtError.message || 'Something went wrong while generating your study set.')
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    submitPrompt(prompt)
  }

  const handleRetry = () => {
    submitPrompt(prompt)
  }

  const handleNext = () => {
    if (!visibleCards.length) return
    setCurrentIndex((index) => (index + 1) % visibleCards.length)
    setFlipped(false)
  }

  const handlePrev = () => {
    if (!visibleCards.length) return
    setCurrentIndex((index) => (index - 1 + visibleCards.length) % visibleCards.length)
    setFlipped(false)
  }

  const handleReset = () => {
    setCards([])
    setTitle('Study set')
    setError('')
    resetReviewState()
    resetQuizState()
    setMode('review')
  }

  const handleQuizSubmit = (event) => {
    event.preventDefault()

    if (!currentQuizCard) return

    const isCorrect = selectedOption === currentQuizCard.correctAnswer

    setQuizResults((previous) => [
      ...previous,
      {
        card: currentQuizCard,
        correct: isCorrect,
        answer: selectedOption,
      },
    ])
    setQuizFeedback(isCorrect ? 'correct' : 'incorrect')
  }

  const handleQuizNext = () => {
    if (!quizQuestions.length) return

    if (quizIndex >= quizQuestions.length - 1) {
      setQuizComplete(true)
      setQuizFeedback(null)
      setSelectedOption('')
      return
    }

    setQuizIndex((value) => value + 1)
    setSelectedOption('')
    setQuizFeedback(null)
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Study assistant</p>
        <h1>Turn rough notes into a guided review set.</h1>
        <p className="hero-copy">
          Paste a topic or lecture notes, and the app will generate flashcards that you can flip through, review, and filter by difficulty.
        </p>

        <form className="input-panel" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="notes">Topic or notes</label>
          <textarea
            id="notes"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            placeholder="Example: Photosynthesis, with emphasis on light-dependent reactions and Calvin cycle"
          />
          <div className="actions-row">
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Generating…' : 'Generate study set'}
            </button>
            <button type="button" className="secondary" onClick={handleReset}>
              Clear
            </button>
          </div>
        </form>
      </section>

      <section className="content-card">
        <div className="content-header">
          <div>
            <p className="eyebrow">Review flow</p>
            <h2>{title}</h2>
          </div>
          <div className="chip-row">
            <button type="button" className={mode === 'review' ? 'chip active' : 'chip'} onClick={() => setMode('review')}>
              Cards
            </button>
            <button type="button" className={mode === 'quiz' ? 'chip active' : 'chip'} onClick={() => startQuiz(false)}>
              Quiz
            </button>
            <button type="button" className="chip theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
              {theme === 'light' ? '🌙 Dark mode' : '☀️ Light mode'}
            </button>
            <button className={reviewMode === 'all' ? 'chip active' : 'chip'} onClick={() => { setReviewMode('all'); resetReviewState() }}>
              All
            </button>
            <button className={reviewMode === 'easy' ? 'chip active' : 'chip'} onClick={() => { setReviewMode('easy'); resetReviewState() }}>
              Easy
            </button>
            <button className={reviewMode === 'hard' ? 'chip active' : 'chip'} onClick={() => { setReviewMode('hard'); resetReviewState() }}>
              Hard
            </button>
          </div>
        </div>

        {isLoading && <div className="state-card">Generating a study set…</div>}
        {!isLoading && error && (
          <div className="state-card error">
            <p>{error}</p>
            <div className="controls">
              <button type="button" className="secondary" onClick={handleRetry}>
                Retry
              </button>
            </div>
          </div>
        )}
        {!isLoading && !error && cards.length === 0 && (
          <div className="state-card">Add a topic to generate your first flashcard deck.</div>
        )}

        {!isLoading && !error && mode === 'review' && currentCard && (
          <div className="card-stack">
            <div className="progress-row">
              <span className="progress-pill">
                Card {currentIndex + 1} of {visibleCards.length}
              </span>
              <span className="progress-pill muted">
                {reviewMode === 'all' ? 'All cards' : reviewMode === 'easy' ? 'Easy only' : 'Hard only'}
              </span>
            </div>

            <div className="flashcard" onClick={() => setFlipped((value) => !value)}>
              <div className={`flashcard-face ${flipped ? 'flipped' : ''}`}>
                <span className="badge">{currentCard.difficulty}</span>
                <p>{flipped ? currentCard.back : currentCard.front}</p>
              </div>
            </div>

            <div className="controls">
              <button type="button" onClick={handlePrev}>
                Previous
              </button>
              <button type="button" className="secondary" onClick={() => setFlipped((value) => !value)}>
                {flipped ? 'Show front' : 'Show answer'}
              </button>
              <button type="button" onClick={handleNext}>
                Next
              </button>
            </div>
          </div>
        )}

        {!isLoading && !error && mode === 'quiz' && (
          <div className="quiz-stack">
            {!quizComplete && currentQuizCard && (
              <>
                <div className="progress-row">
                  <span className="progress-pill">
                    Question {quizIndex + 1} of {quizQuestions.length}
                  </span>
                  <span className="progress-pill muted">
                    {quizScore} correct so far
                  </span>
                </div>

                <div className="quiz-card">
                  <p className="quiz-label">Multiple choice</p>
                  <h3>{currentQuizCard.front}</h3>
                  <form className="quiz-form" onSubmit={handleQuizSubmit}>
                    <div className="option-grid">
                      {currentQuizCard.options.map((option) => {
                        const isSelected = selectedOption === option
                        const isCorrectOption = quizFeedback && option === currentQuizCard.correctAnswer
                        const isWrongSelection = quizFeedback && isSelected && !isCorrectOption

                        return (
                          <button
                            key={option}
                            type="button"
                            className={[
                              'option-button',
                              isSelected ? 'selected' : '',
                              quizFeedback && isCorrectOption ? 'correct-option' : '',
                              quizFeedback && isWrongSelection ? 'wrong-option' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => !quizFeedback && setSelectedOption(option)}
                            disabled={Boolean(quizFeedback)}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                    <div className="controls">
                      <button type="submit" disabled={!selectedOption || Boolean(quizFeedback)}>
                        Check answer
                      </button>
                    </div>
                  </form>
                </div>

                {quizFeedback && (
                  <div className={`quiz-feedback ${quizFeedback}`}>
                    <p>{quizFeedback === 'correct' ? 'Correct answer.' : 'Not quite — review the solution and continue.'}</p>
                    <p className="feedback-answer">{currentQuizCard.back}</p>
                    <button type="button" className="secondary" onClick={handleQuizNext}>
                      {quizIndex >= quizQuestions.length - 1 ? 'Finish quiz' : 'Next question'}
                    </button>
                  </div>
                )}
              </>
            )}

            {quizComplete && (
              <div className="quiz-summary">
                <h3>Quiz complete</h3>
                <p>
                  You got {quizScore} out of {quizResults.length} correct.
                </p>
                {missedQuestions.length > 0 && (
                  <div className="quiz-feedback incorrect">
                    <p>Re-test the questions you missed.</p>
                    <div className="controls">
                      <button type="button" onClick={() => startQuiz(true)}>
                        Re-test wrong answers
                      </button>
                      <button type="button" className="secondary" onClick={() => startQuiz(false)}>
                        Start again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
