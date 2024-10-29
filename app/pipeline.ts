/**
 * Reactive Pipeline Executor
 * 
 * Manages multi-command pipelines with reactive streams. Features:
 * - Mixed builtin/external command pipelines
 * - Stream-based data flow between commands
 * - Recursive pipeline processing
 * - Concurrent external process management
 * 
 * Pipeline strategies:
 * - Builtin pipelines: Sequential with stream passing
 * - External pipelines: Concurrent with pipe connections
 * - Error propagation through the pipeline chain
 */

import { Observable, of } from "rxjs";
import { map } from "rxjs/operators";
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { isBuiltin, executeBuiltin$, findCommand } from "./builtins";
import type { CommandResult } from "./executor";

/**
 * Executes a multi-command pipeline using reactive streams.
 * 
 * Analyzes the pipeline composition and chooses the appropriate execution strategy:
 * - Mixed pipelines (with builtins): Sequential execution with stream passing
 * - External-only pipelines: Concurrent execution with pipe connections
 * 
 * @param parts - Complete command line parts including pipe operators
 * @param pipeIndices - Positions of pipe operators in the parts array
 * @param commandHistory - Shell command history for builtin commands
 * @param lastAppendedIndex - History tracking index
 * @returns Observable that emits the pipeline execution result
 * 
 * @example
 * // "echo hello | wc" -> ["echo", "hello", "|", "wc"]
 * executePipeline$(["echo", "hello", "|", "wc"], [2], history, 0)
 */
export function executePipeline$(
  parts: string[],
  pipeIndices: number[],
  commandHistory: string[],
  lastAppendedIndex: number
): Observable<CommandResult> {
  
  // Split command line into individual commands at pipe boundaries
  const commands = splitIntoCommands(parts, pipeIndices);
  
  // Determine execution strategy based on command types
  const hasBuiltin = commands.some(cmd => isBuiltin(cmd[0]));
  
  if (hasBuiltin) {
    // Use sequential execution for pipelines containing builtin commands
    return executeBuiltinPipeline$(commands, commandHistory, lastAppendedIndex);
  }
  
  // Use concurrent execution for external-only pipelines
  return executeExternalPipeline$(commands);
}

/**
 * Splits command line parts into individual commands at pipe boundaries.
 * 
 * @param parts - Array of command line tokens including pipe operators
 * @param pipeIndices - Positions where pipe operators ("|") are located
 * @returns Array of command arrays, each representing one command in the pipeline
 * 
 * @example
 * splitIntoCommands(["ls", "-l", "|", "grep", "txt"], [2])
 * // Returns: [["ls", "-l"], ["grep", "txt"]]
 */
function splitIntoCommands(parts: string[], pipeIndices: number[]): string[][] {
  const commands = [];
  let start = 0;
  
  // Extract each command segment between pipe operators
  for (const pipeIndex of pipeIndices) {
    commands.push(parts.slice(start, pipeIndex));
  
    start = pipeIndex + 1;
  }
  // Add the final command after the last pipe
  commands.push(parts.slice(start));
  
  return commands;
}

/**
 * Executes pipelines containing builtin commands using sequential processing.
 * 
 * Builtin commands must be executed in-process, so this strategy processes
 * commands sequentially, passing output as strings between commands.
 * 
 * @param commands - Array of command arrays to execute in sequence
 * @param commandHistory - Shell command history for builtin execution
 * @param lastAppendedIndex - History tracking index
 * @returns Observable that emits when the entire pipeline completes
 */
function executeBuiltinPipeline$(
  commands: string[][],
  commandHistory: string[],
  lastAppendedIndex: number
): Observable<CommandResult> {
  
  // Start recursive execution with empty input
  return executePipelineRecursive$(commands, "", commandHistory, lastAppendedIndex);
}

/**
 * Recursively executes pipeline commands with string-based data flow.
 * 
 * This function processes one command at a time, passing output as strings
 * between commands. It handles both builtin and external commands within
 * the same pipeline.
 * 
 * @param commands - Remaining commands to execute in the pipeline
 * @param input - String input from the previous command in the pipeline
 * @param commandHistory - Shell command history for builtin execution
 * @param lastAppendedIndex - History tracking index
 * @returns Observable that emits when the current command and all remaining commands complete
 * 
 * @example
 * // Execute "echo hello | wc" recursively
 * executePipelineRecursive$([["echo", "hello"], ["wc"]], "", history, 0)
 */
function executePipelineRecursive$(
  commands: string[][],
  input: string,
  commandHistory: string[],
  lastAppendedIndex: number
): Observable<CommandResult> {
  
  // Base case: no more commands to execute
  if (commands.length === 0) {
    if (input) {
      process.stdout.write(input);
    }

    return of({ newLastAppendedIndex: lastAppendedIndex });
  }
  
  const [currentCmd, ...remainingCmds] = commands;
  const cmdName = currentCmd[0];
  
  if (isBuiltin(cmdName)) {
    // Execute builtin command and pass result to next command
    return executeBuiltin$(currentCmd, commandHistory, lastAppendedIndex).pipe(
      map(({ result, newLastAppendedIndex }) => {
        if (remainingCmds.length === 0) {
          // Last command: output directly to stdout
          if (result) {
            process.stdout.write(result);
          }
          return { newLastAppendedIndex };
        } else {
          // Continue pipeline with command output as input
          executePipelineRecursive$(remainingCmds, result, commandHistory, newLastAppendedIndex).subscribe();
          return { newLastAppendedIndex };
        }
      })
    );
  } else {
    // Handle external command in pipeline
    const cmdPath = findCommand(cmdName);

    if (!cmdPath) {
      console.log(`${cmdName}: command not found`);

      return of({ newLastAppendedIndex: lastAppendedIndex });
    }
    
    return new Observable<CommandResult>(subscriber => {
      // Configure stdio: last command outputs to terminal, others to pipe
      const stdio = remainingCmds.length === 0 ? ["pipe", "inherit", "inherit"] as any : "pipe";
      const childProcess = spawn(cmdPath, currentCmd.slice(1), { argv0: cmdName, stdio }) as any;
      
      // Feed input from previous command
      if (input && childProcess.stdin) {
        childProcess.stdin.write(input);
        childProcess.stdin.end();
      }
      
      if (remainingCmds.length === 0) {
        // Last command: wait for completion
        childProcess.on("close", () => {
          subscriber.next({ newLastAppendedIndex: lastAppendedIndex });
          subscriber.complete();
        });
      } else {
        // Middle command: collect output and continue pipeline
        let output = "";
        if (childProcess.stdout) {
          childProcess.stdout.on("data", (data: any) => {
            output += data.toString();
          });
        }
        
        childProcess.on("close", () => {
          // Continue with collected output
          executePipelineRecursive$(remainingCmds, output, commandHistory, lastAppendedIndex).subscribe({
            next: (result) => {
              subscriber.next(result);
              subscriber.complete();
            }
          });
        });
      }
    });
  }
}

/**
 * Executes external-only pipelines using concurrent process management.
 * 
 * This strategy spawns all processes simultaneously and connects them with
 * native pipes for optimal performance. Only used when all commands in the
 * pipeline are external programs.
 * 
 * @param commands - Array of external commands to execute concurrently
 * @returns Observable that emits when the entire pipeline completes
 * 
 * @example
 * // Execute "ls | grep .txt | wc -l" with concurrent processes
 * executeExternalPipeline$([["ls"], ["grep", ".txt"], ["wc", "-l"]])
 */
function executeExternalPipeline$(commands: string[][]): Observable<CommandResult> {
  return new Observable<CommandResult>(subscriber => {
    const processes: ChildProcess[] = [];
    
    // Spawn all processes concurrently
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const cmdPath = findCommand(cmd[0]);
      
      if (!cmdPath) {
        console.log(`${cmd[0]}: command not found`);
        subscriber.next({});
        subscriber.complete();

        return;
      }
      
      // Configure stdio based on position in pipeline
      let stdio: any;

      if (i === 0) {
        // First process: inherit stdin, pipe stdout
        stdio = ["inherit", "pipe", "inherit"] as any;
      } else if (i === commands.length - 1) {
        // Last process: pipe stdin, inherit stdout
        stdio = ["pipe", "inherit", "inherit"] as any;
      } else {
        // Middle process: pipe both stdin and stdout
        stdio = ["pipe", "pipe", "inherit"] as any;
      }
      
      const childProcess = spawn(cmdPath, cmd.slice(1), { argv0: cmd[0], stdio }) as any;

      processes.push(childProcess);
    }
    
    // Connect stdout of each process to stdin of the next
    for (let i = 0; i < processes.length - 1; i++) {
      if (processes[i].stdout && processes[i + 1].stdin) {
        (processes[i].stdout as any).pipe(processes[i + 1].stdin);
      }
    }
    
    // Wait for the last process to complete (indicates entire pipeline is done)
    processes[processes.length - 1].on("close", () => {
      subscriber.next({});
      subscriber.complete();
    });
  });
}
