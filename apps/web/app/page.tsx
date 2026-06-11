"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { ask, indexRepo, type AskResponse, type IndexRepoResponse } from "@/lib/api";
import {
  appendChatEntry,
  createChatSession,
  subscribeToChatSessions,
  type ChatSession,
} from "@/lib/chat-history";
import { auth } from "@/lib/firebase";

type HistoryEntry = {
  question: string;
  answer: AskResponse;
};

const SUGGESTIONS = [
  "What does this project do?",
  "How is the code organized?",
  "How do I run this locally?",
];

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [repoUrl, setRepoUrl] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexed, setIndexed] = useState<IndexRepoResponse | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [askError, setAskError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      setIndexed(null);
      setHistory([]);
      setSessions([]);
      setCurrentSessionId(null);
      setPendingQuestion(null);
      setIndexError(null);
      setAskError(null);
      setHistoryError(null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    setHistoryLoading(true);
    setHistoryError(null);

    const unsubscribe = subscribeToChatSessions(
      user.uid,
      (nextSessions) => {
        setSessions(nextSessions);
        setHistoryLoading(false);
      },
      (error) => {
        setHistoryLoading(false);
        setHistoryError(error.message);
      },
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (history.length === 0 && !pendingQuestion) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, pendingQuestion]);

  async function handleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Unable to sign in");
    }
  }

  async function handleSignOut() {
    setAuthError(null);
    await signOut(auth);
  }

  function handleNewChat() {
    setRepoUrl("");
    setIndexed(null);
    setHistory([]);
    setQuestion("");
    setPendingQuestion(null);
    setIndexError(null);
    setAskError(null);
    setCurrentSessionId(null);
  }

  function handleOpenSession(session: ChatSession) {
    setRepoUrl(session.repoUrl);
    setIndexed({
      repo_id: session.repoId,
      file_count: session.fileCount ?? 0,
      chunk_count: session.chunkCount ?? 0,
    });
    setHistory(session.history);
    setQuestion("");
    setPendingQuestion(null);
    setIndexError(null);
    setAskError(null);
    setCurrentSessionId(session.id);
  }

  async function handleIndex() {
    if (!repoUrl.trim() || !user) return;

    setIndexing(true);
    setIndexError(null);
    setHistory([]);
    setPendingQuestion(null);
    setAskError(null);

    try {
      const result = await indexRepo(repoUrl.trim());
      setIndexed(result);
      const sessionId = await createChatSession(user.uid, repoUrl.trim(), result);
      setCurrentSessionId(sessionId);
    } catch (err) {
      setIndexError(err instanceof Error ? err.message : "Unknown error");
      setIndexed(null);
      setCurrentSessionId(null);
    } finally {
      setIndexing(false);
    }
  }

  async function handleAsk(qOverride?: string) {
    const q = (qOverride ?? question).trim();
    if (!indexed || !q || !user || !currentSessionId) return;

    if (qOverride) setQuestion(qOverride);
    setAsking(true);
    setAskError(null);
    setPendingQuestion(q);

    try {
      const result = await ask(indexed.repo_id, q);
      const entry = { question: q, answer: result };
      setHistory((current) => [...current, entry]);
      await appendChatEntry(user.uid, currentSessionId, repoUrl.trim(), indexed, entry);
      setQuestion("");
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAsking(false);
      setPendingQuestion(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="hidden w-80 shrink-0 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex lg:flex-col">
          <Sidebar
            user={user}
            authLoading={authLoading}
            authError={authError}
            historyLoading={historyLoading}
            historyError={historyError}
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSignIn={() => void handleSignIn()}
            onSignOut={() => void handleSignOut()}
            onNewChat={handleNewChat}
            onOpenSession={handleOpenSession}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase text-zinc-500">
                  RepoChat AI
                </p>
                <h1 className="truncate text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                  {indexed?.repo_id ?? "Repository workspace"}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {indexed && (
                  <div className="hidden items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 sm:flex">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>{indexed.file_count} files</span>
                    <span className="text-zinc-300 dark:text-zinc-700">/</span>
                    <span>{indexed.chunk_count} chunks</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleNewChat}
                  disabled={!user}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700"
                >
                  New chat
                </button>
              </div>
            </div>
          </header>

          <main className="flex flex-1 flex-col px-4 py-5 sm:px-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0">
                <RepoPanel
                  user={user}
                  repoUrl={repoUrl}
                  indexing={indexing}
                  indexed={indexed}
                  indexError={indexError}
                  onRepoUrlChange={setRepoUrl}
                  onIndex={() => void handleIndex()}
                />

                <Conversation
                  indexed={indexed}
                  history={history}
                  pendingQuestion={pendingQuestion}
                  asking={asking}
                />

                <Composer
                  user={user}
                  indexed={indexed}
                  currentSessionId={currentSessionId}
                  question={question}
                  asking={asking}
                  askError={askError}
                  onQuestionChange={setQuestion}
                  onAsk={() => void handleAsk()}
                  onSuggestion={(value) => void handleAsk(value)}
                />

                <div ref={bottomRef} aria-hidden="true" />
              </section>

              <aside className="hidden xl:block">
                <DetailsPanel
                  user={user}
                  authLoading={authLoading}
                  authError={authError}
                  indexed={indexed}
                  sessions={sessions}
                  history={history}
                  onSignIn={() => void handleSignIn()}
                  onSignOut={() => void handleSignOut()}
                />
              </aside>
            </div>
          </main>
        </div>
      </div>

      <div className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:hidden">
        <Sidebar
          compact
          user={user}
          authLoading={authLoading}
          authError={authError}
          historyLoading={historyLoading}
          historyError={historyError}
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSignIn={() => void handleSignIn()}
          onSignOut={() => void handleSignOut()}
          onNewChat={handleNewChat}
          onOpenSession={handleOpenSession}
        />
      </div>
    </div>
  );
}

function Sidebar({
  compact = false,
  user,
  authLoading,
  authError,
  historyLoading,
  historyError,
  sessions,
  currentSessionId,
  onSignIn,
  onSignOut,
  onNewChat,
  onOpenSession,
}: {
  compact?: boolean;
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  historyLoading: boolean;
  historyError: string | null;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onNewChat: () => void;
  onOpenSession: (session: ChatSession) => void;
}) {
  return (
    <div className={compact ? "p-4" : "flex h-screen flex-col p-4"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-950 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
              R
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                RepoChat
              </p>
              <p className="text-xs text-zinc-500">RAG workspace</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={!user}
          className="rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          New
        </button>
      </div>

      <div className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
        {user ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                {user.displayName ?? user.email ?? "Signed in"}
              </p>
              <p className="truncate text-xs text-zinc-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onSignIn}
            disabled={authLoading}
            className="w-full rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
          >
            {authLoading ? "Checking session" : "Sign in with Google"}
          </button>
        )}
        {authError && <p className="mt-2 text-xs text-red-600">{authError}</p>}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-zinc-500">History</p>
        {historyLoading && <span className="text-xs text-zinc-400">Syncing</span>}
      </div>

      {historyError && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          Firestore permissions need updating.
        </p>
      )}

      <div className={compact ? "mt-3 flex gap-2 overflow-x-auto pb-1" : "mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"}>
        {sessions.length === 0 ? (
          <div className="rounded-md border border-dashed border-zinc-200 px-3 py-5 text-sm text-zinc-500 dark:border-zinc-800">
            {user ? "No saved chats yet." : "Sign in to save chat history."}
          </div>
        ) : (
          sessions.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => onOpenSession(session)}
              className={`w-full min-w-64 rounded-md border px-3 py-3 text-left transition ${
                currentSessionId === session.id
                  ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700"
              }`}
            >
              <p className="truncate text-sm font-medium">{session.title}</p>
              <p className="mt-1 truncate font-mono text-xs opacity-70">
                {session.repoId}
              </p>
              <p className="mt-2 text-xs opacity-60">
                {session.history.length} messages / {formatUpdatedAt(session.updatedAt)}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function RepoPanel({
  user,
  repoUrl,
  indexing,
  indexed,
  indexError,
  onRepoUrlChange,
  onIndex,
}: {
  user: User | null;
  repoUrl: string;
  indexing: boolean;
  indexed: IndexRepoResponse | null;
  indexError: string | null;
  onRepoUrlChange: (value: string) => void;
  onIndex: () => void;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <label className="text-xs font-semibold uppercase text-zinc-500">
            GitHub repository
          </label>
          <input
            type="url"
            value={repoUrl}
            onChange={(event) => onRepoUrlChange(event.target.value)}
            placeholder="https://github.com/owner/repo"
            disabled={indexing || !user}
            className="mt-2 h-11 w-full rounded-md border border-zinc-200 bg-white px-3.5 font-mono text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-600 dark:focus:ring-zinc-900"
          />
        </div>
        <button
          type="button"
          onClick={onIndex}
          disabled={indexing || !repoUrl.trim() || !user}
          className="inline-flex h-11 min-w-32 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {indexing ? (
            <>
              <Spinner />
              <span className="ml-2">Indexing</span>
            </>
          ) : (
            "Index repo"
          )}
        </button>
      </div>

      {indexError && <ErrorText>{indexError}</ErrorText>}

      {indexed && (
        <div className="mt-4 grid gap-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-900 sm:grid-cols-3">
          <Metric label="Repo" value={indexed.repo_id} mono />
          <Metric label="Files" value={indexed.file_count.toString()} />
          <Metric label="Chunks" value={indexed.chunk_count.toString()} />
        </div>
      )}
    </section>
  );
}

function Conversation({
  indexed,
  history,
  pendingQuestion,
  asking,
}: {
  indexed: IndexRepoResponse | null;
  history: HistoryEntry[];
  pendingQuestion: string | null;
  asking: boolean;
}) {
  if (!indexed) {
    return (
      <section className="mt-5 flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <div className="max-w-md">
          <p className="text-sm font-semibold uppercase text-zinc-500">
            Ready when you are
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
            Index a repository to start a grounded chat.
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            RepoChat will fetch source files, create embeddings, and keep the
            conversation tied to your Firebase account.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5 min-h-[420px] rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-100 px-5 py-4 dark:border-zinc-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-medium text-zinc-950 dark:text-zinc-50">
              {indexed.repo_id}
            </p>
            <p className="text-xs text-zinc-500">
              {history.length === 0 ? "No questions yet" : `${history.length} saved messages`}
            </p>
          </div>
          <span className="w-fit rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Indexed
          </span>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5">
        {history.length === 0 && !asking && (
          <div className="rounded-md bg-zinc-50 px-4 py-5 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            Ask a question below or use a suggested prompt to begin.
          </div>
        )}

        {history.map((entry, index) => (
          <MessageBlock
            key={`${entry.question}-${index}`}
            entry={entry}
            repoId={indexed.repo_id}
          />
        ))}

        {asking && pendingQuestion && (
          <div className="space-y-4">
            <div className="rounded-md bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              {pendingQuestion}
            </div>
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Spinner />
              Reading indexed source context
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MessageBlock({ entry, repoId }: { entry: HistoryEntry; repoId: string }) {
  return (
    <article className="space-y-4">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-md bg-zinc-950 px-4 py-3 text-sm text-white dark:bg-zinc-100 dark:text-zinc-950">
          {entry.question}
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-zinc-950 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:dark:bg-zinc-900">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {entry.answer.answer}
          </Markdown>
        </div>

        {entry.answer.sources.length > 0 && (
          <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-900">
            <p className="text-xs font-semibold uppercase text-zinc-500">
              Sources
            </p>
            <ul className="mt-3 grid gap-2">
              {entry.answer.sources.map((source) => (
                <li key={`${source.path}-${source.chunk_index}`}>
                  <a
                    href={`https://github.com/${repoId}/blob/HEAD/${source.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <span className="truncate font-mono text-zinc-800 dark:text-zinc-200">
                      {source.path}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-500">
                      chunk {source.chunk_index}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

function Composer({
  user,
  indexed,
  currentSessionId,
  question,
  asking,
  askError,
  onQuestionChange,
  onAsk,
  onSuggestion,
}: {
  user: User | null;
  indexed: IndexRepoResponse | null;
  currentSessionId: string | null;
  question: string;
  asking: boolean;
  askError: string | null;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
  onSuggestion: (value: string) => void;
}) {
  const disabled = !indexed || !user || !currentSessionId;

  return (
    <section className="sticky bottom-0 mt-5 border-t border-zinc-200 bg-zinc-100 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      {indexed && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              disabled={disabled || asking}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-zinc-700"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onAsk();
        }}
        className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <input
          type="text"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder={indexed ? "Ask about architecture, setup, auth, APIs..." : "Index a repo first"}
          disabled={disabled || asking}
          className="h-11 min-w-0 flex-1 rounded-md border-0 bg-transparent px-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:text-zinc-400 dark:text-zinc-50"
        />
        <button
          type="submit"
          disabled={disabled || asking || !question.trim()}
          className="inline-flex h-11 min-w-24 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {asking ? (
            <>
              <Spinner />
              <span className="ml-2">Ask</span>
            </>
          ) : (
            "Ask"
          )}
        </button>
      </form>

      {askError && <ErrorText>{askError}</ErrorText>}
    </section>
  );
}

function DetailsPanel({
  user,
  authLoading,
  authError,
  indexed,
  sessions,
  history,
  onSignIn,
  onSignOut,
}: {
  user: User | null;
  authLoading: boolean;
  authError: string | null;
  indexed: IndexRepoResponse | null;
  sessions: ChatSession[];
  history: HistoryEntry[];
  onSignIn: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="sticky top-20 space-y-5">
      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-semibold uppercase text-zinc-500">Account</p>
        {user ? (
          <>
            <p className="mt-3 truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
              {user.displayName ?? user.email ?? "Signed in"}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-500">{user.email}</p>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-4 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onSignIn}
              disabled={authLoading}
              className="mt-4 w-full rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
            >
              {authLoading ? "Checking session" : "Sign in with Google"}
            </button>
            {authError && <ErrorText>{authError}</ErrorText>}
          </>
        )}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-xs font-semibold uppercase text-zinc-500">
          Workspace
        </p>
        <div className="mt-4 grid gap-3">
          <Metric label="Saved chats" value={sessions.length.toString()} />
          <Metric label="Messages" value={history.length.toString()} />
          <Metric label="Active repo" value={indexed?.repo_id ?? "None"} mono />
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50 ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
      {children}
    </p>
  );
}

function formatUpdatedAt(value: number) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
