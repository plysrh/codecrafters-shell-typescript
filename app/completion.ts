/**
 * Tab Completion Module
 * 
 * Provides intelligent command completion for the shell.
 * 
 * Features:
 * - Builtin command completion
 * - Executable file completion from PATH
 * - Longest common prefix calculation
 * - Multiple completion display
 * - Bell notification for no matches
 * 
 * Completion behavior:
 * - Single match: Auto-complete with space
 * - Multiple matches: Show common prefix or list all
 * - No matches: Bell sound
 * - Double-tab: Display all available completions
 */

import path from "node:path";
import fs from "node:fs";

// Tab completion state
let lastTabLine = "";
let tabCount = 0;

export function setupCompletion() {
  return (line: string) => {
    if (line !== lastTabLine) {
      tabCount = 1;
      lastTabLine = line;
    } else {
      tabCount++;
    }
    
    const completions = getCompletions(line);
    
    if (completions.length === 0) {
      process.stdout.write("\x07");

      return [[], line];
    }
    
    if (completions.length === 1) {
      return [[completions[0] + " "], line];
    }
    
    // Multiple completions - check for longest common prefix
    const lcp = getLongestCommonPrefix(completions);
    
    if (lcp.length > line.length) {
      return [[lcp], line];
    }
    
    // No further completion possible
    process.stdout.write("\x07");
    
    if (tabCount === 1) {
      return [[], line];
    } else {
      const sortedCompletions = completions.sort();

      process.stdout.write(`\n${sortedCompletions.join("  ")}\n`);
      setTimeout(() => {
        // Re-display prompt and current line
        process.stdout.write(`$ ${line}`);
      }, 0);

      return [[], line];
    }
  };
}

function getCompletions(line: string): string[] {
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

function getLongestCommonPrefix(strings: string[]): string {
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
