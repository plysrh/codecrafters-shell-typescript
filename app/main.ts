/**
 * Shell Main Module
 * 
 * This is the main entry point for the shell application. It coordinates
 * between all other modules to provide a complete shell experience including
 * command parsing, execution, history management, and tab completion.
 */

import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getCompletions, getLongestCommonPrefix } from "./completion";
import { parseCommand } from "./parser";
import { isBuiltin } from "./builtins";
import { executeMultiPipeline } from "./pipeline";
import { loadHistoryFromFile, saveHistoryToFile } from "./history";

// Tab completion state
let lastTabLine = "";
let tabCount = 0;

// Readline interface
let rl: any;

// Command history management
let commandHistory: string[] = [];
let lastAppendedIndex = 0;



// Initialize readline interface with tab completion support
rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line: string) => {
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
      setTimeout(() => rl.prompt(true), 0);

      return [[], line];
    }
  }
});



/**
 * Main REPL (Read-Eval-Print Loop) function.
 * Handles user input, command parsing, execution, and output.
 */
function repl() {
  rl.question("$ ", (answer: string) => {
    const trimmed = answer.trim();
    // Add non-empty commands to history
    if (trimmed) {
      commandHistory.push(trimmed);
    }
    const parts = parseCommand(trimmed);
    // Check for pipeline commands (containing '|')
    const pipeIndices = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "|") {
        pipeIndices.push(i);
      }
    }
    
    if (pipeIndices.length > 0) {
      // Split command into pipeline segments
      const commands = [];
      let start = 0;
      
      for (const pipeIndex of pipeIndices) {
        commands.push(parts.slice(start, pipeIndex));
        start = pipeIndex + 1;
      }
      commands.push(parts.slice(start));
      
      // Execute pipeline and update history index
      lastAppendedIndex = executeMultiPipeline(commands, commandHistory, lastAppendedIndex, repl);
      return;
    }
    
    // Parse output redirection operators
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
    
    const command = cmdParts[0];
    
    if (command === "exit") {
      const exitCode = parts[1] ? parseInt(parts[1], 10) : 0;

      // Save unsaved history to HISTFILE before exiting
      if (process.env.HISTFILE) {
        saveHistoryToFile(process.env.HISTFILE, commandHistory, lastAppendedIndex);
      }

      process.exit(exitCode);
    } else if (command === "echo") {
      const output = cmdParts.slice(1).join(" ");

      if (redirectFile) {
        fs.writeFileSync(redirectFile, `${output}\n`);
      } else if (appendFile) {
        fs.appendFileSync(appendFile, `${output}\n`);
      } else if (stderrRedirectFile) {
        // echo doesn't write to stderr, so output normally and create empty file
        console.log(output);
        fs.writeFileSync(stderrRedirectFile, "");
      } else if (stderrAppendFile) {
        // echo doesn't write to stderr, so output normally and create empty file if needed
        console.log(output);

        if (!fs.existsSync(stderrAppendFile)) {
          fs.writeFileSync(stderrAppendFile, "");
        }
      } else {
        console.log(output);
      }
    } else if (command === "pwd") {
      console.log(process.cwd());
    } else if (command === "cd") {
      let targetDir = parts[1];
      
      if (targetDir === "~") {
        targetDir = process.env.HOME || "";
      }

      try {
        process.chdir(targetDir);
      } catch {
        console.log(`cd: ${parts[1]}: No such file or directory`);
      }
    } else if (command === "history") {
      if (cmdParts[1] === "-r" && cmdParts[2]) {
        try {
          const fileContent = fs.readFileSync(cmdParts[2], "utf8");
          const lines = fileContent.split('\n').filter(line => line.trim() !== '');

          commandHistory.push(...lines);
        } catch {
          console.log(`history: ${cmdParts[2]}: No such file or directory`);
        }
      } else if (cmdParts[1] === "-w" && cmdParts[2]) {
        try {
          const historyContent = commandHistory.join('\n') + '\n';

          fs.writeFileSync(cmdParts[2], historyContent);
        } catch {
          console.log(`history: ${cmdParts[2]}: Permission denied`);
        }
      } else if (cmdParts[1] === "-a" && cmdParts[2]) {
        try {
          const newCommands = commandHistory.slice(lastAppendedIndex);

          if (newCommands.length > 0) {
            const appendContent = newCommands.join('\n') + '\n';

            fs.appendFileSync(cmdParts[2], appendContent);

            lastAppendedIndex = commandHistory.length;
          }
        } catch {
          console.log(`history: ${cmdParts[2]}: Permission denied`);
        }
      } else {
        const limit = cmdParts[1] ? parseInt(cmdParts[1], 10) : commandHistory.length;
        const startIndex = Math.max(0, commandHistory.length - limit);

        for (let i = startIndex; i < commandHistory.length; i++) {
          console.log(`    ${i + 1}  ${commandHistory[i]}`);
        }
      }
    } else if (command === "type") {
      const targetCommand = parts[1];

      if (isBuiltin(targetCommand)) {
        console.log(`${targetCommand} is a shell builtin`);
      } else {
        const pathDirs = process.env.PATH?.split(path.delimiter) || [];
        let found = false;
        
        for (const dir of pathDirs) {
          const fullPath = path.join(dir, targetCommand);

          try {
            const stats = fs.statSync(fullPath);

            if (stats.isFile() && (stats.mode & 0o111)) {
              console.log(`${targetCommand} is ${fullPath}`);

              found = true;

              break;
            }
          } catch {}
        }
        
        if (!found) {
          console.log(`${targetCommand}: not found`);
        }
      }
    } else {
      const pathDirs = process.env.PATH?.split(path.delimiter) || [];
      let found = false;
      
      for (const dir of pathDirs) {
        const fullPath = path.join(dir, command);

        try {
          const stats = fs.statSync(fullPath);

          if (stats.isFile() && (stats.mode & 0o111)) {
            if (redirectFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "pipe", "inherit"]
              });

              if (result.stdout) {
                fs.writeFileSync(redirectFile, result.stdout);
              }
            } else if (appendFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "pipe", "inherit"]
              });

              if (result.stdout) {
                fs.appendFileSync(appendFile, result.stdout);
              }
            } else if (stderrRedirectFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "inherit", "pipe"]
              });

              if (result.stderr) {
                fs.writeFileSync(stderrRedirectFile, result.stderr);
              }
            } else if (stderrAppendFile) {
              const result = spawnSync(fullPath, cmdParts.slice(1), { 
                argv0: command,
                stdio: ["inherit", "inherit", "pipe"]
              });

              if (result.stderr) {
                fs.appendFileSync(stderrAppendFile, result.stderr);
              }
            } else {
              spawnSync(fullPath, cmdParts.slice(1), { stdio: "inherit", argv0: command });
            }

            found = true;

            break;
          }
        } catch {}
      }
      
      if (!found) {
        console.log(`${answer}: command not found`);
      }
    }

    repl();
  });
}



// Initialize shell: load history from HISTFILE if specified
if (process.env.HISTFILE) {
  lastAppendedIndex = loadHistoryFromFile(process.env.HISTFILE, commandHistory);
}

// Start the main REPL loop
repl();
