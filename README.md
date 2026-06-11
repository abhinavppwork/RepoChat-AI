# RepoChat AI

AI that reads GitHub repositories and answers questions about the codebase with source-backed responses.

## Overview

RepoChat AI is a full-stack RAG application for understanding public GitHub repositories faster.

You paste a repository URL, the backend fetches and filters relevant files, chunks them, generates embeddings, stores them in ChromaDB, and answers questions using retrieved repository context. The app is protected with Firebase Authentication, and indexed data is isolated per user.


## Features

- Index any public GitHub repository
- Ask natural-language questions about the repo
- Get answers grounded in retrieved source chunks
- View source file citations for each response
- Sign in with Firebase Authentication
- Keep indexed data scoped to the signed-in user
- Save and reopen chat sessions from Firestore
- Run embeddings locally with BGE and persist vectors in ChromaDB

## Architecture

The project has two applications:

- `apps/web` - Next.js frontend
- `apps/api` - FastAPI backend

The backend pipeline looks like this:

1. Accept a GitHub repository URL
2. Fetch the repo tree and raw file contents from the GitHub API
3. Filter supported files and skip noisy directories
4. Split file content into chunks with LangChain text splitters
5. Generate embeddings with `BAAI/bge-small-en-v1.5`
6. Store vectors plus metadata in local ChromaDB
7. Embed the user question
8. Retrieve the most relevant chunks for that user and repo
9. Generate a grounded answer with Groq Llama 3.3

## Tech Stack

### Frontend

- Next.js 16
- React 19
- Tailwind CSS v4
- Firebase Web SDK
- `react-markdown`
- `rehype-highlight`

### Backend

- FastAPI
- Python 3.11+
- LangChain text splitters
- `sentence-transformers`
- ChromaDB
- Groq Python SDK
- Firebase Admin SDK
- GitHub REST API

## Authentication

The app uses Firebase Authentication on the frontend and Firebase Admin on the backend.

- The frontend signs users in and sends a Firebase ID token with each protected API request
- The backend verifies the token before indexing or answering questions
- Indexed chunks are stored with `user_id` metadata
- Retrieval is filtered by both `user_id` and `repo_id`

This means one signed-in user cannot query another user’s indexed repository data.

## Repository Structure

```text
repochat-ai/
├── apps/
│   ├── api/
│   │   ├── main.py
│   │   ├── auth.py
│   │   ├── repo_loader.py
│   │   ├── chunker.py
│   │   ├── embeddings.py
│   │   ├── rag.py
│   │   ├── requirements.txt
│   │   └── .env.example
│   └── web/
│       ├── app/
│       ├── lib/
│       ├── public/
│       ├── package.json
│       └── .env
└── data/
    └── chroma/
```

## Backend Modules

- `main.py` - FastAPI app, routes, request models, CORS
- `auth.py` - Firebase token verification
- `repo_loader.py` - GitHub repo parsing, tree fetch, file filtering, raw file download
- `chunker.py` - language-aware chunking
- `embeddings.py` - local BGE embeddings and ChromaDB storage
- `rag.py` - retrieval and answer generation with Groq
- `chat-history.ts` - Firestore-backed chat sessions for each signed-in user

## Supported File Types

The current backend indexes these file types:

- `.md`
- `.py`
- `.ts`
- `.tsx`
- `.js`
- `.jsx`
- `.json`

It also skips common noise like:

- `node_modules`
- `.git`
- `.next`
- `dist`
- `build`
- `venv`
- `__pycache__`

## API Endpoints

### `GET /health`

Basic health check.

### `POST /index-repo`

Indexes a public GitHub repository for the authenticated user.

Request:

```json
{
  "repo_url": "https://github.com/owner/repo"
}
```

Response:

```json
{
  "repo_id": "owner/repo",
  "file_count": 47,
  "chunk_count": 148
}
```

### `POST /ask`

Answers a question about an indexed repository for the authenticated user.

Request:

```json
{
  "repo_id": "owner/repo",
  "question": "How does authentication work?"
}
```

## Chat History

Chat history is stored in Firestore under the signed-in user, so each account keeps its own saved repo sessions.

- Indexing a repo creates a new chat session
- Each question and answer is appended to that session
- The UI shows a modern sidebar with recent conversations
- Opening a past session restores the repo, messages, and source context

Response:

```json
{
  "answer": "Authentication is handled by ...",
  "sources": [
    { "path": "src/auth.ts", "chunk_index": 4, "distance": 0.187 },
    { "path": "src/middleware.ts", "chunk_index": 0, "distance": 0.213 }
  ]
}
```

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- A Groq API key
- A Firebase project with Google sign-in enabled
- A Firebase service account key for backend verification
- Optional GitHub personal access token for higher GitHub API limits

## Environment Variables

### Frontend: `apps/web/.env`

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Backend: `apps/api/.env`

```env
GROQ_API_KEY=...
GITHUB_TOKEN=...
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"...","universe_domain":"googleapis.com"}
```

Important:

- `FIREBASE_SERVICE_ACCOUNT_JSON` must be a single-line JSON string
- the `private_key` inside it should use escaped newlines like `\\n`
- do not commit your `.env` files

## Running Locally

### 1. Start the backend

```powershell
cd "repochat-ai\apps\api"
..\..\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

Backend runs at:

- `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`

Note:

- BGE embeddings run locally
- on first use, the model may take time to load or download

### 2. Start the frontend

```powershell
cd "repochat-ai\apps\web"
npm install
npm run dev
```

Frontend runs at:

- `http://localhost:3000`

## How to Use

1. Sign in with Google
2. Paste a public GitHub repository URL
3. Click `Index`
4. Wait for indexing to complete
5. Ask questions about the repository
6. Open cited source links to inspect the relevant files
7. Reopen any saved chat session from the sidebar

## Notes

- `data/chroma` stores the local vector database
- you can delete `data/chroma` to reset indexed data
- deleting it does not affect the source code
- after deleting it, repositories must be indexed again


## Future Improvements

- Repo management per user
- Delete and re-index endpoints
- Streaming answers
- Line-range citations
- Better large-repo handling
- Hybrid retrieval and reranking
