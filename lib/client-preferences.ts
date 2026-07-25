"use client";

import { useSyncExternalStore } from "react";

const EVENT = "comicdb-preferences";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function snapshot() {
  return localStorage.getItem("comicdb-r18-reveal") === "true";
}

export function useR18Reveal() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export function setR18Reveal(value: boolean) {
  localStorage.setItem("comicdb-r18-reveal", String(value));
  window.dispatchEvent(new Event(EVENT));
}
