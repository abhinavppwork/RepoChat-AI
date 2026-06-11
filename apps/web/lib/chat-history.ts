import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { AskResponse, IndexRepoResponse } from "@/lib/api";

export type ChatEntry = {
  question: string;
  answer: AskResponse;
};

export type ChatSession = {
  id: string;
  repoId: string;
  repoUrl: string;
  title: string;
  fileCount: number | null;
  chunkCount: number | null;
  history: ChatEntry[];
  createdAt: number;
  updatedAt: number;
};

type FirestoreSession = {
  repoId: string;
  repoUrl: string;
  title: string;
  fileCount: number | null;
  chunkCount: number | null;
  history: ChatEntry[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

function sessionsCollection(userId: string) {
  return collection(db, "users", userId, "chatSessions");
}

function toMillis(value?: Timestamp) {
  return value ? value.toMillis() : Date.now();
}

function normalizeSession(id: string, data: FirestoreSession): ChatSession {
  return {
    id,
    repoId: data.repoId,
    repoUrl: data.repoUrl,
    title: data.title,
    fileCount: data.fileCount ?? null,
    chunkCount: data.chunkCount ?? null,
    history: data.history ?? [],
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  };
}

export function subscribeToChatSessions(
  userId: string,
  onChange: (sessions: ChatSession[]) => void,
  onError?: (error: Error) => void,
) {
  const q = query(sessionsCollection(userId), orderBy("updatedAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const sessions = snapshot.docs.map((snap) =>
        normalizeSession(snap.id, snap.data() as FirestoreSession),
      );
      onChange(sessions);
    },
    (error) => {
      onError?.(error);
    },
  );
}

export async function createChatSession(
  userId: string,
  repoUrl: string,
  indexed: IndexRepoResponse,
) {
  const title = indexed.repo_id;
  const ref = await addDoc(sessionsCollection(userId), {
    repoId: indexed.repo_id,
    repoUrl,
    title,
    fileCount: indexed.file_count,
    chunkCount: indexed.chunk_count,
    history: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function appendChatEntry(
  userId: string,
  sessionId: string,
  repoUrl: string,
  indexed: IndexRepoResponse,
  entry: ChatEntry,
) {
  const ref = doc(db, "users", userId, "chatSessions", sessionId);
  await updateDoc(ref, {
    repoId: indexed.repo_id,
    repoUrl,
    title: entry.question,
    fileCount: indexed.file_count,
    chunkCount: indexed.chunk_count,
    history: [...(await getExistingHistory(userId, sessionId)), entry],
    updatedAt: serverTimestamp(),
  });
}

async function getExistingHistory(userId: string, sessionId: string): Promise<ChatEntry[]> {
  const { getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(db, "users", userId, "chatSessions", sessionId));
  if (!snap.exists()) {
    return [];
  }
  const data = snap.data() as FirestoreSession;
  return data.history ?? [];
}
