/**
 * History Management Module
 * 
 * This module handles command history operations including loading from files,
 * saving to files, and executing history-related commands with various flags.
 */

import fs from "node:fs";

/**
 * Loads command history from a file into memory.
 * 
 * @param histfile - Path to the history file to load
 * @param commandHistory - Array to populate with loaded commands
 * @returns Number of commands loaded (used as lastAppendedIndex)
 */
export function loadHistoryFromFile(histfile: string, commandHistory: string[]): number {
  try {
    const fileContent = fs.readFileSync(histfile, "utf8");
    const lines = fileContent.split("\n").filter(line => line.trim() !== "");

    commandHistory.push(...lines);

    return commandHistory.length;
  } catch {
    return 0;
  }
}

/**
 * Saves new command history entries to a file by appending them.
 * Only saves commands that haven't been previously saved.
 * 
 * @param histfile - Path to the history file to append to
 * @param commandHistory - Array containing all commands
 * @param lastAppendedIndex - Index of last previously saved command
 */
export function saveHistoryToFile(histfile: string, commandHistory: string[], lastAppendedIndex: number): void {
  try {
    const newCommands = commandHistory.slice(lastAppendedIndex);

    if (newCommands.length > 0) {
      const appendContent = `${newCommands.join('\n')}\n`;

      fs.appendFileSync(histfile, appendContent);
    }
  } catch {}
}

/**
 * Executes history command with various flags and arguments.
 * Supports: history, history N, history -r file, history -w file, history -a file
 * 
 * @param args - Command arguments (excluding 'history' itself)
 * @param commandHistory - Array containing all commands
 * @param lastAppendedIndex - Index tracking last appended entry
 * @returns Object with command output and updated append index
 */
export function executeHistoryCommand(args: string[], commandHistory: string[], lastAppendedIndex: number): { result: string, newLastAppendedIndex: number } {
  if (args[0] === "-r" && args[1]) {
    // Read history from file and append to current history
    try {
      const fileContent = fs.readFileSync(args[1], "utf8");
      const lines = fileContent.split("\n").filter(line => line.trim() !== "");

      commandHistory.push(...lines);
    } catch {}
    return { result: "", newLastAppendedIndex: lastAppendedIndex };
  } else if (args[0] === "-w" && args[1]) {
    // Write entire history to file (overwrite)
    try {
      const historyContent = `${commandHistory.join('\n')}\n`;

      fs.writeFileSync(args[1], historyContent);
    } catch {}
    return { result: "", newLastAppendedIndex: lastAppendedIndex };
  } else if (args[0] === "-a" && args[1]) {
    // Append new history entries to file
    try {
      const newCommands = commandHistory.slice(lastAppendedIndex);

      if (newCommands.length > 0) {
        const appendContent = `${newCommands.join('\n')}\n`;

        fs.appendFileSync(args[1], appendContent);

        return { result: "", newLastAppendedIndex: commandHistory.length };
      }
    } catch {}
    return { result: "", newLastAppendedIndex: lastAppendedIndex };
  } else {
    // Display history (optionally limited to last N entries)
    const limit = args[0] ? parseInt(args[0], 10) : commandHistory.length;
    const startIndex = Math.max(0, commandHistory.length - limit);
    let result = "";

    for (let i = startIndex; i < commandHistory.length; i++) {
      result += `    ${i + 1}  ${commandHistory[i]}\n`;
    }

    return { result, newLastAppendedIndex: lastAppendedIndex };
  }
}
