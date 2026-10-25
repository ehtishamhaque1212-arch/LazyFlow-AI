# LazyFlow AI 🦥

**Do less. Get more done.** LazyFlow AI is a privacy-conscious productivity website built with HTML, CSS, and vanilla JavaScript. Its AI tools connect to an open-weight model running on your own computer through Ollama.

## Files

```text
LazyFlow-AI/
├── index.html  # Website structure
├── style.css   # Styling and responsive layout
├── script.js   # Interactions, task manager, storage, and local AI integration
└── README.md   # Setup and usage instructions
```

## Features

- AI Assistant for questions and brainstorming
- Smart Writer to improve drafts
- Text Summarizer
- Task Planner to break goals into steps
- Study Helper for explanations, notes, quizzes, and flashcards
- Task manager with priorities, filters, completion, and deletion
- Browser-local history and saved preferences
- Dark/light appearance and responsive layout
- Open-weight AI through Ollama; no hosted AI API key required

## Requirements

- A modern browser
- Python 3 (or another local static web server)
- [Ollama](https://ollama.com/download) and a model, such as `gemma3:1b`, for AI features

## Run the website

1. Install Ollama, then download the suggested model by running this command in a terminal:

   ```bash
   ollama run gemma3:1b
   ```

2. Keep Ollama running. In a second terminal, change into this folder and start a local web server:

   ```bash
   py -m http.server 8000
   ```

   If `py` is not available, try `python -m http.server 8000`.

3. Open `http://localhost:8000` in your browser.
4. Use **Configure model** or the gear icon to set the Ollama address (`http://localhost:11434`) and model name (`gemma3:1b`), then click **Test connection**.
5. Open an AI tool and enter a prompt. Task management and saved browser preferences work without AI.

## Troubleshooting

- If AI does not connect, confirm Ollama is running and the model name matches `ollama list`.
- Browser CORS/origin restrictions may prevent requests to Ollama. Configure Ollama's allowed origins for your local site origin (for example, `http://localhost:8000`) using the [Ollama FAQ](https://github.com/ollama/ollama/blob/main/docs/faq.md), then restart Ollama.
- Smaller models generally use fewer system resources.

## Why open-source AI?

Running a model locally gives you more control over the model and where prompts are processed. Tasks and history are saved in your browser. AI prompts are sent to the Ollama address you configure, so use a trusted local address.

## License

This project is provided as-is for learning and modification.
