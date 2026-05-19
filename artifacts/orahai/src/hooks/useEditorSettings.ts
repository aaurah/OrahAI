import { useState, useCallback } from "react";

export interface EditorSettings {
  fontSize: number;
  wordWrap: "on" | "off" | "wordWrapColumn" | "bounded";
  minimap: boolean;
  tabSize: number;
  lineNumbers: "on" | "off" | "relative";
  formatOnSave: boolean;
  theme: "vs-dark" | "vs" | "hc-black";
}

const DEFAULTS: EditorSettings = {
  fontSize: 13,
  wordWrap: "on",
  minimap: false,
  tabSize: 2,
  lineNumbers: "on",
  formatOnSave: false,
  theme: "vs-dark",
};

const KEY = "orahai_editor_settings";

function load(): EditorSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return { ...DEFAULTS }; }
}

export function useEditorSettings() {
  const [settings, setSettings] = useState<EditorSettings>(load);

  const update = useCallback(<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    setSettings({ ...DEFAULTS });
  }, []);

  return { settings, update, reset };
}
