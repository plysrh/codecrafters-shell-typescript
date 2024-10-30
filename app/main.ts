/**
 * Reactive Shell Main Module
 * 
 * Entry point for the reactive shell implementation. Orchestrates multiple RxJS streams:
 * - Input stream: Processes readline events
 * - Exit stream: Handles shell termination
 * - Command stream: Executes parsed commands
 * 
 * Key reactive patterns:
 * - Event-driven architecture with fromEvent
 * - Stream composition with operators
 * - Asynchronous history management
 * - Non-blocking command execution
 */

import { createInterface } from "node:readline";
import { fromEvent, EMPTY } from "rxjs";
import { map, filter, switchMap, tap, catchError, share } from "rxjs/operators";
import { parseCommand } from "./parser";
import { executeCommand$ } from "./executor";
import { loadHistoryFromFile$, saveHistoryToFile$ } from "./history";
import { setupCompletion } from "./completion";

// Global state
let commandHistory: string[] = [];
let lastAppendedIndex = 0;

// Create readline interface
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: setupCompletion()
});

// Input stream from readline
const input$ = fromEvent(rl, "line").pipe(
  map((line: unknown) => (line as string).trim()),
  filter(line => line.length > 0),
  tap(line => commandHistory.push(line)),
  share()
);

// Exit command stream
const exit$ = input$.pipe(
  filter(line => line.startsWith("exit")),
  map(line => parseCommand(line)[1] ? parseInt(parseCommand(line)[1], 10) : 0),
  tap(exitCode => {
    if (process.env.HISTFILE) {
      saveHistoryToFile$(process.env.HISTFILE, commandHistory, lastAppendedIndex).subscribe({
        complete: () => process.exit(exitCode)
      });
    } else {
      process.exit(exitCode);
    }
  })
);

// Regular command stream
const command$ = input$.pipe(
  filter(line => !line.startsWith("exit")),
  map(line => parseCommand(line)),
  switchMap(parts => executeCommand$(parts, commandHistory, lastAppendedIndex)),
  tap(result => {
    if (result.newLastAppendedIndex !== undefined) {
      lastAppendedIndex = result.newLastAppendedIndex;
    }
    // Prompt after command completes
    setTimeout(() => rl.prompt(), 0);
  }),
  catchError(error => {
    console.error(`Error: ${error.message}`);
    setTimeout(() => rl.prompt(), 0);
    return EMPTY;
  })
);

// Initialize shell
function initShell() {
  if (process.env.HISTFILE) {
    loadHistoryFromFile$(process.env.HISTFILE, commandHistory).subscribe(
      index => {
        lastAppendedIndex = index;
        startShell();
      }
    );
  } else {
    startShell();
  }
}

function startShell() {
  // Subscribe to streams
  exit$.subscribe();
  command$.subscribe();
  
  // Set prompt
  rl.setPrompt("$ ");
  rl.prompt();
}

// Start the reactive shell
initShell();
