/**
 * Tab Completion Module
 * 
 * This module provides tab completion functionality for the shell.
 * It supports completion of builtin commands and executable files in PATH.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Gets available completions for the current input line.
 * Only provides completions for single-word commands (no arguments).
 * 
 * @param line - The current input line to complete
 * @returns Array of possible completions
 */
export function getCompletions(line: string): string[] {
  const words = line.split(" ");

  // Only complete if there's exactly one word (the command)
  if (words.length !== 1) {
    return [];
  }
  
  const currentWord = words[0];
  const completions: string[] = [];
  // Check builtin commands for matches
  const builtins = ["echo", "exit", "history"];

  for (const builtin of builtins) {
    if (builtin.startsWith(currentWord)) {
      completions.push(builtin);
    }
  }
  
  // Check executable files in PATH directories
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];

  for (const dir of pathDirs) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (file.startsWith(currentWord)) {
          const fullPath = path.join(dir, file);

          try {
            const stats = fs.statSync(fullPath);

            // Only include executable files
            if (stats.isFile() && (stats.mode & 0o111)) {
              completions.push(file);
            }
          } catch {}
        }
      }
    } catch {}
  }
  
  // Remove duplicates and return
  return [...new Set(completions)];
}

/**
 * Calculates the longest common prefix among a set of strings.
 * Used for partial completion when multiple matches exist.
 * 
 * @param strings - Array of strings to find common prefix for
 * @returns The longest common prefix, or empty string if none
 */
export function getLongestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) {
    return "";
  }

  if (strings.length === 1) {
    return strings[0];
  }

  // Sort strings to compare first and last lexicographically
  const sorted = strings.sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let i = 0;

  // Find common prefix between first and last strings
  while (i < first.length && i < last.length && first[i] === last[i]) {
    i++;
  }
  
  return first.substring(0, i);
}
