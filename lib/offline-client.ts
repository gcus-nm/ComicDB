"use client";

import type { BookSummary } from "./types";

const DB_NAME = "comicdb-offline";
const STORE = "snapshots";
const KEY = "catalog";

export type OfflineSnapshot = {
  version: number;
  generatedAt: string;
  books: BookSummary[];
};

function openOfflineDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineSnapshot(snapshot: OfflineSnapshot) {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(snapshot, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function readOfflineSnapshot() {
  const db = await openOfflineDb();
  const snapshot = await new Promise<OfflineSnapshot | null>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve((request.result as OfflineSnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return snapshot;
}

export async function clearOfflineSnapshot() {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  await caches.delete("comicdb-media-v1");
}
