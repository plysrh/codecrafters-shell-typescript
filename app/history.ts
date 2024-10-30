/**
 * Reactive History Management Module
 * 
 * Asynchronous command history operations using RxJS streams.
 * 
 * Features:
 * - Non-blocking file I/O with fs.promises
 * - Observable-based history commands
 * - HISTFILE integration for persistence
 * - Stream-based error handling
 * 
 * Commands supported:
 * - history: Display command history
 * - history N: Show last N commands
 * - history -r file: Read history from file
 * - history -w file: Write history to file
 * - history -a file: Append new commands to file
 */

import { promises as fs } from "node:fs";
import { Observable, of, from } from "rxjs";
import { map, catchError } from "rxjs/operators";

/**
 * Loads command history from a file into memory asynchronously.
 * 
 * @param histfile - Path to the history file to load
 * @param commandHistory - Array to populate with loaded commands
 * @returns Observable of number of commands loaded (used as lastAppendedIndex)
 */
export function loadHistoryFromFile$(histfile: string, commandHistory: string[]): Observable<number> {
  return from(fs.readFile(histfile, "utf8")).pipe(
    map(fileContent => {
      const lines = fileContent.split("\n").filter(line => line.trim() !== "");

      commandHistory.push(...lines);

      return commandHistory.length;
    }),
    catchError(() => of(0))
  );
}

/**
 * Saves new command history entries to a file by appending them asynchronously.
 * Only saves commands that haven't been previously saved.
 * 
 * @param histfile - Path to the history file to append to
 * @param commandHistory - Array containing all commands
 * @param lastAppendedIndex - Index of last previously saved command
 */
export function saveHistoryToFile$(histfile: string, commandHistory: string[], lastAppendedIndex: number): Observable<void> {
  const newCommands = commandHistory.slice(lastAppendedIndex);

  if (newCommands.length === 0) {
    return of(void 0);
  }

  const appendContent = `${newCommands.join("\n")}\n`;

  return from(fs.appendFile(histfile, appendContent)).pipe(
    catchError(() => of(void 0))
  );
}

/**
 * Executes history command with various flags and arguments asynchronously.
 * Supports: history, history N, history -r file, history -w file, history -a file
 * 
 * @param args - Command arguments (excluding 'history' itself)
 * @param commandHistory - Array containing all commands
 * @param lastAppendedIndex - Index tracking last appended entry
 * @returns Observable with command output and updated append index
 */
export function executeHistoryCommand$(args: string[], commandHistory: string[], lastAppendedIndex: number): Observable<{ result: string, newLastAppendedIndex: number }> {
  if (args[0] === "-r" && args[1]) {
    // Read history from file and append to current history
    return from(fs.readFile(args[1], "utf8")).pipe(
      map(fileContent => {
        const lines = fileContent.split("\n").filter(line => line.trim() !== "");

        commandHistory.push(...lines);

        return { result: "", newLastAppendedIndex: lastAppendedIndex };
      }),
      catchError(() => of({ result: "", newLastAppendedIndex: lastAppendedIndex }))
    );
  } else if (args[0] === "-w" && args[1]) {
    // Write entire history to file (overwrite)
    const historyContent = `${commandHistory.join('\n')}\n`;

    return from(fs.writeFile(args[1], historyContent)).pipe(
      map(() => ({ result: "", newLastAppendedIndex: lastAppendedIndex })),
      catchError(() => of({ result: "", newLastAppendedIndex: lastAppendedIndex }))
    );
  } else if (args[0] === "-a" && args[1]) {
    // Append new history entries to file
    const newCommands = commandHistory.slice(lastAppendedIndex);
    
    if (newCommands.length === 0) {
      return of({ result: "", newLastAppendedIndex: lastAppendedIndex });
    }
    
    const appendContent = `${newCommands.join('\n')}\n`;

    return from(fs.appendFile(args[1], appendContent)).pipe(
      map(() => ({ result: "", newLastAppendedIndex: commandHistory.length })),
      catchError(() => of({ result: "", newLastAppendedIndex: lastAppendedIndex }))
    );
  } else {
    // Display history (optionally limited to last N entries)
    const limit = args[0] ? parseInt(args[0], 10) : commandHistory.length;
    const startIndex = Math.max(0, commandHistory.length - limit);
    let result = "";

    for (let i = startIndex; i < commandHistory.length; i++) {
      result += `    ${i + 1}  ${commandHistory[i]}\n`;
    }

    return of({ result, newLastAppendedIndex: lastAppendedIndex });
  }
}
