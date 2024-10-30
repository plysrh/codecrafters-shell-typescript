/**
 * Reactive Command Executor
 * 
 * Core execution engine using reactive streams. Handles:
 * - Builtin vs external command routing
 * - I/O redirection (stdout, stderr)
 * - Pipeline detection and delegation
 * - Asynchronous process spawning
 * 
 * Reactive patterns:
 * - Observable-based command execution
 * - Stream-based I/O redirection
 * - Error handling with catchError
 * - Non-blocking process management
 */

import { Observable, of, from } from "rxjs";
import { map, tap, catchError } from "rxjs/operators";
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { isBuiltin, executeBuiltin$, findCommand } from "./builtins";
import { executePipeline$ } from "./pipeline";

export interface CommandResult {
  output?: string;
  newLastAppendedIndex?: number;
}

export function executeCommand$(
  parts: string[], 
  commandHistory: string[], 
  lastAppendedIndex: number
): Observable<CommandResult> {
  
  // Check for pipeline
  const pipeIndices = parts
    .map((part, index) => part === "|" ? index : -1)
    .filter(index => index !== -1);
  
  if (pipeIndices.length > 0) {
    return executePipeline$(parts, pipeIndices, commandHistory, lastAppendedIndex);
  }
  
  // Parse redirection
  const { cmdParts, redirectFile, appendFile, stderrRedirectFile, stderrAppendFile } = 
    parseRedirection(parts);
  
  const command = cmdParts[0];
  
  return executeSimpleCommand$(
    command, 
    cmdParts, 
    commandHistory, 
    lastAppendedIndex,
    { redirectFile, appendFile, stderrRedirectFile, stderrAppendFile }
  );
}

function executeSimpleCommand$(
  command: string,
  cmdParts: string[],
  commandHistory: string[],
  lastAppendedIndex: number,
  redirection: {
    redirectFile?: string;
    appendFile?: string;
    stderrRedirectFile?: string;
    stderrAppendFile?: string;
  }
): Observable<CommandResult> {
  
  if (isBuiltin(command)) {
    return executeBuiltinCommand$(cmdParts, commandHistory, lastAppendedIndex, redirection);
  }
  
  return executeExternalCommand$(cmdParts, redirection);
}

function executeBuiltinCommand$(
  cmdParts: string[],
  commandHistory: string[],
  lastAppendedIndex: number,
  redirection: any
): Observable<CommandResult> {
  
  const command = cmdParts[0];
  
  if (command === "echo") {
    const output = cmdParts.slice(1).join(" ");
    return handleOutput$(output, redirection).pipe(
      map(() => ({ newLastAppendedIndex: lastAppendedIndex }))
    );
  }
  
  if (command === "pwd") {
    return of(null).pipe(
      tap(() => console.log(process.cwd())),
      map(() => ({ newLastAppendedIndex: lastAppendedIndex }))
    );
  }
  
  if (command === "cd") {
    return of(null).pipe(
      tap(() => {
        let targetDir = cmdParts[1];
        if (targetDir === "~") {
          targetDir = process.env.HOME || "";
        }
        try {
          process.chdir(targetDir);
        } catch {
          console.log(`cd: ${cmdParts[1]}: No such file or directory`);
        }
      }),
      map(() => ({ newLastAppendedIndex: lastAppendedIndex }))
    );
  }
  
  if (command === "type") {
    return executeTypeCommand$(cmdParts[1]).pipe(
      map(() => ({ newLastAppendedIndex: lastAppendedIndex }))
    );
  }
  
  if (command === "history") {
    return executeBuiltin$(cmdParts, commandHistory, lastAppendedIndex).pipe(
      tap(({ result }) => {
        if (result) process.stdout.write(result);
      }),
      map(({ newLastAppendedIndex }) => ({ newLastAppendedIndex }))
    );
  }
  
  return of({ newLastAppendedIndex: lastAppendedIndex });
}

function executeTypeCommand$(targetCommand: string): Observable<void> {
  if (isBuiltin(targetCommand)) {
    return of(null).pipe(
      tap(() => console.log(`${targetCommand} is a shell builtin`)),
      map(() => void 0)
    );
  }
  
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];
  
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, targetCommand);
    try {
      const stats = require("fs").statSync(fullPath);
      if (stats.isFile() && (stats.mode & 0o111)) {
        console.log(`${targetCommand} is ${fullPath}`);
        return of(void 0);
      }
    } catch {}
  }
  
  console.log(`${targetCommand}: not found`);
  return of(void 0);
}

function executeExternalCommand$(
  cmdParts: string[],
  redirection: any
): Observable<CommandResult> {
  
  const command = cmdParts[0];
  const cmdPath = findCommand(command);
  
  if (!cmdPath) {
    return of(null).pipe(
      tap(() => console.log(`${command}: command not found`)),
      map(() => ({}))
    );
  }
  
  return executeProcess$(cmdPath, cmdParts.slice(1), command, redirection);
}

function executeProcess$(
  cmdPath: string,
  args: string[],
  command: string,
  redirection: any
): Observable<CommandResult> {
  return new Observable<CommandResult>(subscriber => {
    let stdio: any = "inherit";
    
    if (redirection.redirectFile || redirection.appendFile) {
      stdio = ["inherit", "pipe", "inherit"];
    } else if (redirection.stderrRedirectFile || redirection.stderrAppendFile) {
      stdio = ["inherit", "inherit", "pipe"];
    }
    
    const child = spawn(cmdPath, args, { argv0: command, stdio });
    
    if (redirection.redirectFile || redirection.appendFile) {
      let output = "";
      child.stdout?.on("data", (data) => {
        output += data.toString();
      });
      
      child.on("close", async () => {
        try {
          if (redirection.redirectFile) {
            await fs.writeFile(redirection.redirectFile, output || "");
          } else if (redirection.appendFile) {
            await fs.appendFile(redirection.appendFile, output || "");
          }
        } catch (error) {
          subscriber.error(error);
          return;
        }
        subscriber.next({});
        subscriber.complete();
      });
    } else if (redirection.stderrRedirectFile || redirection.stderrAppendFile) {
      let errorOutput = "";
      child.stderr?.on("data", (data) => {
        errorOutput += data.toString();
      });
      
      child.on("close", async () => {
        try {
          if (redirection.stderrRedirectFile) {
            await fs.writeFile(redirection.stderrRedirectFile, errorOutput || "");
          } else if (redirection.stderrAppendFile) {
            await fs.appendFile(redirection.stderrAppendFile, errorOutput || "");
          }
        } catch (error) {
          subscriber.error(error);
          return;
        }

        subscriber.next({});
        subscriber.complete();
      });
    } else {
      child.on("close", () => {
        subscriber.next({});
        subscriber.complete();
      });
    }
    
    child.on("error", (error) => {
      subscriber.error(error);
    });
  });
}

function parseRedirection(parts: string[]) {
  let redirectFile = "";
  let appendFile = "";
  let stderrRedirectFile = "";
  let stderrAppendFile = "";
  let cmdParts = parts;
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === ">" || parts[i] === "1>") {
      redirectFile = parts[i + 1];
      cmdParts = parts.slice(0, i);

      break;
    } else if (parts[i] === ">>" || parts[i] === "1>>") {
      appendFile = parts[i + 1];
      cmdParts = parts.slice(0, i);

      break;
    } else if (parts[i] === "2>") {
      stderrRedirectFile = parts[i + 1];
      cmdParts = parts.slice(0, i);

      break;
    } else if (parts[i] === "2>>") {
      stderrAppendFile = parts[i + 1];
      cmdParts = parts.slice(0, i);

      break;
    }
  }
  
  return { cmdParts, redirectFile, appendFile, stderrRedirectFile, stderrAppendFile };
}

function handleOutput$(output: string, redirection: any): Observable<void> {
  if (redirection.redirectFile) {
    return from(fs.writeFile(redirection.redirectFile, `${output}\n`));
  } else if (redirection.appendFile) {
    return from(fs.appendFile(redirection.appendFile, `${output}\n`));
  } else if (redirection.stderrRedirectFile) {
    console.log(output);
    return from(fs.writeFile(redirection.stderrRedirectFile, ""));
  } else if (redirection.stderrAppendFile) {
    console.log(output);
    return from(fs.access(redirection.stderrAppendFile)).pipe(
      catchError(() => from(fs.writeFile(redirection.stderrAppendFile, ""))),
      map(() => void 0)
    );
  } else {
    console.log(output);

    return of(void 0);
  }
}
