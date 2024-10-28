/**
 * Pipeline Execution Module
 * 
 * This module handles execution of multi-command pipelines, supporting both
 * builtin commands and external programs with proper pipe connections.
 */

import { spawn, ChildProcess } from "node:child_process";
import { isBuiltin, executeBuiltin, findCommand } from "./builtins";

/**
 * Executes a multi-command pipeline with proper pipe connections.
 * Uses different strategies for pipelines containing builtins vs all-external commands.
 * 
 * @param commands - Array of command arrays (each command is [cmd, ...args])
 * @param commandHistory - Array containing all commands for builtin execution
 * @param lastAppendedIndex - Index tracking last appended history entry
 * @param replCallback - Function to call when pipeline completes
 * @returns Updated lastAppendedIndex value
 */
export function executeMultiPipeline(commands: string[][], commandHistory: string[], lastAppendedIndex: number, replCallback: () => void): number {
  const hasBuiltin = commands.some(cmd => isBuiltin(cmd[0]));
  
  if (hasBuiltin) {
    // Use recursive approach for pipelines containing builtins
    return executePipelineRecursive(commands, "", commandHistory, lastAppendedIndex, replCallback);
  } else {
    // Use concurrent approach for all-external command pipelines
    const processes: ChildProcess[] = [];
    
    // Spawn all processes with appropriate stdio configuration
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const cmdName = cmd[0];
      const args = cmd.slice(1);
      const cmdPath = findCommand(cmdName);

      if (!cmdPath) {
        console.log(`${cmdName}: command not found`);
        replCallback();
        return lastAppendedIndex;
      }
      
      // Configure stdio: first reads from terminal, last writes to terminal, middle uses pipes
      let stdio: any;
      if (i === 0) {
        stdio = ["inherit", "pipe", "inherit"];
      } else if (i === commands.length - 1) {
        stdio = ["pipe", "inherit", "inherit"];
      } else {
        stdio = ["pipe", "pipe", "inherit"];
      }
      
      const childProcess = spawn(cmdPath, args, { argv0: cmdName, stdio });
      processes.push(childProcess);
    }
    
    // Connect stdout of each process to stdin of the next
    for (let i = 0; i < processes.length - 1; i++) {
      (processes[i].stdout as any)?.pipe(processes[i + 1].stdin);
    }
    
    // Wait for the last process to complete
    processes[processes.length - 1].on("close", () => {
      replCallback();
    });
    
    return lastAppendedIndex;
  }
}

/**
 * Recursively executes pipeline commands, handling builtins and external commands.
 * This approach is used when the pipeline contains builtin commands that need
 * to be executed in-process.
 * 
 * @param commands - Remaining commands to execute
 * @param input - Input data from previous command
 * @param commandHistory - Array containing all commands
 * @param lastAppendedIndex - Index tracking last appended history entry
 * @param replCallback - Function to call when pipeline completes
 * @returns Updated lastAppendedIndex value
 */
function executePipelineRecursive(commands: string[][], input: string, commandHistory: string[], lastAppendedIndex: number, replCallback: () => void): number {
  // Base case: no more commands to execute
  if (commands.length === 0) {
    if (input) {
      process.stdout.write(input);
    }
    replCallback();
    return lastAppendedIndex;
  }
  
  const [currentCmd, ...remainingCmds] = commands;
  const cmdName = currentCmd[0];
  
  if (isBuiltin(cmdName)) {
    // Execute builtin command in-process
    const { result: output, newLastAppendedIndex } = executeBuiltin(currentCmd, commandHistory, lastAppendedIndex);

    return executePipelineRecursive(remainingCmds, output, commandHistory, newLastAppendedIndex, replCallback);
  } else {
    // Execute external command as separate process
    const cmdPath = findCommand(cmdName);

    if (!cmdPath) {
      console.log(`${cmdName}: command not found`);
      replCallback();

      return lastAppendedIndex;
    }
    
    // Configure stdio based on position in pipeline
    let stdio: any;

    if (remainingCmds.length === 0) {
      // Last command: output to terminal
      stdio = ["pipe", "inherit", "inherit"];
    } else {
      // Middle command: pipe both input and output
      stdio = "pipe";
    }
    
    const childProcess = spawn(cmdPath, currentCmd.slice(1), { argv0: cmdName, stdio });
    
    // Feed input from previous command
    if (input) {
      (childProcess.stdin as any)?.write(input);
      (childProcess.stdin as any)?.end();
    }
    
    if (remainingCmds.length === 0) {
      // Last command: wait for completion
      childProcess.on("close", () => {
        replCallback();
      });

      return lastAppendedIndex;
    } else {
      // Middle command: collect output and continue pipeline
      let output = "";

      (childProcess.stdout as any)?.on("data", (data: any) => {
        output += data.toString();
      });
      childProcess.on("close", () => {
        executePipelineRecursive(remainingCmds, output, commandHistory, lastAppendedIndex, replCallback);
      });

      return lastAppendedIndex;
    }
  }
}
