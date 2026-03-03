import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Supabase — baked in, read-only via RLS
export const SUPABASE_URL = "https://syyfwalfncgaezuellsr.supabase.co";
export const SUPABASE_ANON_KEY =
  "sb_publishable_qS7_Piy10dAz9-YXmbkMMQ_EiqkS1Iw";

// Service key for ingestion (write access). Only used by ingest script.
export const SUPABASE_SERVICE_KEY = process.env["SUPABASE_SERVICE_KEY"] || "";

const CONFIG_DIR = join(homedir(), ".legacylens");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface LegacyLensConfig {
  openai_api_key?: string;
  anthropic_api_key?: string;
}

function loadConfigFile(): LegacyLensConfig {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as LegacyLensConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: LegacyLensConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getOpenAIKey(): string | undefined {
  return process.env["OPENAI_API_KEY"] || loadConfigFile().openai_api_key;
}

export function getAnthropicKey(): string | undefined {
  return process.env["ANTHROPIC_API_KEY"] || loadConfigFile().anthropic_api_key;
}

export function requireKeys(): { openaiKey: string; anthropicKey: string } {
  const openaiKey = getOpenAIKey();
  const anthropicKey = getAnthropicKey();
  if (!openaiKey || !anthropicKey) {
    console.error(
      "Missing API keys. Run `legacylens init` to configure, or set OPENAI_API_KEY and ANTHROPIC_API_KEY env vars."
    );
    process.exit(1);
  }
  return { openaiKey, anthropicKey };
}
