"use client";

import { EyeOff } from "lucide-react";
import { setR18Reveal, useR18Reveal } from "@/lib/client-preferences";

export function PrivacySettings() {
  const reveal = useR18Reveal();
  return (
    <div className="settings-card">
      <div className="settings-card-icon"><EyeOff size={22} /></div>
      <div className="settings-card-body">
        <h2>R18表紙の表示</h2>
        <p>会場などで開いたときのため、既定ではR18表紙をぼかします。</p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={reveal}
            onChange={(event) => {
              setR18Reveal(event.target.checked);
            }}
          />
          <span>この端末では常にR18表紙を表示する</span>
        </label>
      </div>
    </div>
  );
}
