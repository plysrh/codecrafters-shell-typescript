/**
 * Builtin Commands Module
 * 
 * Reactive implementations of shell builtin commands and PATH resolution.
 * 
 * Builtin commands:
 * - echo: Output text with stream-based redirection
 * - type: Command identification with async PATH search
 * - history: Delegated to history module
 * 
 * External commands:
 * - findCommand: Synchronous PATH search for immediate results
 * - findCommand$: Asynchronous PATH search with observables
 * 
 * All functions return observables for consistent reactive patterns.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Observable, of, from } from "rxjs";
import { map, switchMap, catchError, mergeMap, filter } from "rxjs/operators";
import { executeHistoryCommand$ } from "./history";

/**
 * Checks if a command is a shell builtin.
 * 
 * @param cmd - The command name to check
 * @returns True if the command is a builtin, false otherwise
 */
export function isBuiltin(cmd: string): boolean {
  return ["echo", "exit", "type", "pwd", "cd", "history"].includes(cmd);
}

/**
 * Finds an external command in the system PATH asynchronously.
 * 
 * @param cmd - The command name to search for
 * @returns Observable of full path to the command if found, null otherwise
 */
export function findCommand(cmd: string): string | null {
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];

  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);

    try {
      const stats = require('fs').statSync(fullPath);

      if (stats.isFile() && (stats.mode & 0o111)) {
        return fullPath;
      }
    } catch {}
  }
  return null;
}

export function findCommand$(cmd: string): Observable<string | null> {
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];

  return from(pathDirs).pipe(
    mergeMap(dir => {
      const fullPath = path.join(dir, cmd);

      return from(fs.stat(fullPath)).pipe(
        map(stats => {
          if (stats.isFile() && (stats.mode & 0o111)) {
            return fullPath;
          }

          return null;
        }),
        catchError(() => of(null))
      );
    }),
    filter(result => result !== null),
    map(result => result as string)
  ).pipe(
    switchMap(result => of(result)),
    catchError(() => of(null))
  );
}

/**
 * Executes a builtin command asynchronously and returns the result.
 * 
 * @param cmd - Array containing the command and its arguments
 * @param commandHistory - Array of previously executed commands
 * @param lastAppendedIndex - Index tracking last appended history entry
 * @returns Observable containing the command output and updated append index
 */
export function executeBuiltin$(cmd: string[], commandHistory: string[], lastAppendedIndex: number): Observable<{ result: string, newLastAppendedIndex: number }> {
  const command = cmd[0];
  
  if (command === "echo") {
    return of({ result: `${cmd.slice(1).join(" ")}\n`, newLastAppendedIndex: lastAppendedIndex });
  } else if (command === "history") {
    return executeHistoryCommand$(cmd.slice(1), commandHistory, lastAppendedIndex);
  } else if (command === "type") {
    const targetCommand = cmd[1];

    if (isBuiltin(targetCommand)) {
      return of({ result: `${targetCommand} is a shell builtin\n`, newLastAppendedIndex: lastAppendedIndex });
    } else {
      return findCommand$(targetCommand).pipe(
        map(fullPath => {
          if (fullPath) {
            return { result: `${targetCommand} is ${fullPath}\n`, newLastAppendedIndex: lastAppendedIndex };
          } else {
            return { result: `${targetCommand}: not found\n`, newLastAppendedIndex: lastAppendedIndex };
          }
        })
      );
    }
  }
  
  return of({ result: "", newLastAppendedIndex: lastAppendedIndex });
}
