/**
 * Builtin Commands Module
 * 
 * This module handles shell builtin commands and external command resolution.
 * Builtin commands are executed directly within the shell process, while
 * external commands are found in the system PATH.
 */

import fs from "node:fs";
import path from "node:path";
import { executeHistoryCommand } from "./history";

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
 * Executes a builtin command and returns the result.
 * 
 * @param cmd - Array containing the command and its arguments
 * @param commandHistory - Array of previously executed commands
 * @param lastAppendedIndex - Index tracking last appended history entry
 * @returns Object containing the command output and updated append index
 */
export function executeBuiltin(cmd: string[], commandHistory: string[], lastAppendedIndex: number): { result: string, newLastAppendedIndex: number } {
  const command = cmd[0];
  
  if (command === "echo") {
    // Echo command: outputs its arguments separated by spaces
    return { result: `${cmd.slice(1).join(" ")}\n`, newLastAppendedIndex: lastAppendedIndex };
  } else if (command === "history") {
    // History command: delegates to history module for processing
    return executeHistoryCommand(cmd.slice(1), commandHistory, lastAppendedIndex);
  } else if (command === "type") {
    // Type command: identifies whether a command is builtin or external
    const targetCommand = cmd[1];

    if (isBuiltin(targetCommand)) {
      return { result: `${targetCommand} is a shell builtin\n`, newLastAppendedIndex: lastAppendedIndex };
    } else {
      // Search for external command in PATH directories
      const pathDirs = process.env.PATH?.split(path.delimiter) || [];

      for (const dir of pathDirs) {
        const fullPath = path.join(dir, targetCommand);

        try {
          const stats = fs.statSync(fullPath);

          // Check if file exists and is executable (has execute permission)
          if (stats.isFile() && (stats.mode & 0o111)) {
            return { result: `${targetCommand} is ${fullPath}\n`, newLastAppendedIndex: lastAppendedIndex };
          }
        } catch {}
      }

      return { result: `${targetCommand}: not found\n`, newLastAppendedIndex: lastAppendedIndex };
    }
  }
  
  return { result: "", newLastAppendedIndex: lastAppendedIndex };
}

/**
 * Finds an external command in the system PATH.
 * 
 * @param cmd - The command name to search for
 * @returns Full path to the command if found, null otherwise
 */
export function findCommand(cmd: string): string | null {
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];

  // Search through each directory in PATH
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);

    try {
      const stats = fs.statSync(fullPath);
      // Return path if file exists and is executable
      if (stats.isFile() && (stats.mode & 0o111)) {
        return fullPath;
      }
    } catch {}
  }
  return null;
}
