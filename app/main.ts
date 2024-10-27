import { createInterface } from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn, ChildProcess } from "node:child_process";

let lastTabLine = "";
let tabCount = 0;
let rl: any;
let commandHistory: string[] = [];
let lastAppendedIndex = 0;

function getCompletions(line: string): string[] {
  const words = line.split(" ");
  if (words.length !== 1) return [];
  
  const currentWord = words[0];
  const completions: string[] = [];
  
  // Check builtins
  const builtins = ["echo", "exit", "history"];
  for (const builtin of builtins) {
    if (builtin.startsWith(currentWord)) {
      completions.push(builtin);
    }
  }
  
  // Check PATH executables
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];
  for (const dir of pathDirs) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.startsWith(currentWord)) {
          const fullPath = path.join(dir, file);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.isFile() && (stats.mode & 0o111)) {
              completions.push(file);
            }
          } catch {}
        }
      }
    } catch {}
  }
  
  return [...new Set(completions)];
}

function getLongestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  if (strings.length === 1) return strings[0];
  
  const sorted = strings.sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  
  let i = 0;
  while (i < first.length && i < last.length && first[i] === last[i]) {
    i++;
  }
  
  return first.substring(0, i);
}

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

function parseCommand(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoteChar = "";
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    if (char === "\\" && i + 1 < input.length) {
      const nextChar = input[i + 1];

      if (!quoteChar) {
        // Outside quotes: escape any character
        current += nextChar;
        i++;
      } else if (quoteChar === '"' && (nextChar === '"' || nextChar === "\\")) {
        // Inside double quotes: only escape " and \
        current += nextChar;
        i++;
      } else {
        // Inside single quotes or unescapable char in double quotes: literal backslash
        current += char;
      }
    } else if ((char === "'" || char === '"') && !quoteChar) {
      quoteChar = char;
    } else if (char === quoteChar) {
      quoteChar = "";
    } else if (char === " " && !quoteChar) {
      if (current) {
        parts.push(current);

        current = "";
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    parts.push(current);
  }
  
  return parts;
}

function repl() {
  rl.question("$ ", (answer: string) => {
    const trimmed = answer.trim();
    if (trimmed) {
      commandHistory.push(trimmed);
    }
    const parts = parseCommand(trimmed);
    
    // Check for pipeline
    const pipeIndices = [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '|') {
        pipeIndices.push(i);
      }
    }
    
    if (pipeIndices.length > 0) {
      const commands = [];
      let start = 0;
      
      for (const pipeIndex of pipeIndices) {
        commands.push(parts.slice(start, pipeIndex));
        start = pipeIndex + 1;
      }
      commands.push(parts.slice(start));
      
      executeMultiPipeline(commands);
      return;
    }
    
    // Check for output redirection
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

      // Append new history to HISTFILE before exiting
      if (process.env.HISTFILE) {
        try {
          const newCommands = commandHistory.slice(lastAppendedIndex);
          if (newCommands.length > 0) {
            const appendContent = newCommands.join('\n') + '\n';
            fs.appendFileSync(process.env.HISTFILE, appendContent);
          }
        } catch {}
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
          const fileContent = fs.readFileSync(cmdParts[2], 'utf8');
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

      if (["echo", "exit", "type", "pwd", "cd", "history"].includes(targetCommand)) {
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

function isBuiltin(cmd: string): boolean {
  return ["echo", "exit", "type", "pwd", "cd", "history"].includes(cmd);
}

function executeBuiltin(cmd: string[], input?: string): string {
  const command = cmd[0];
  
  if (command === "echo") {
    return cmd.slice(1).join(" ") + "\n";
  } else if (command === "history") {
    if (cmd[1] === "-r" && cmd[2]) {
      try {
        const fileContent = fs.readFileSync(cmd[2], 'utf8');
        const lines = fileContent.split('\n').filter(line => line.trim() !== '');
        commandHistory.push(...lines);
      } catch {}
      return "";
    } else if (cmd[1] === "-w" && cmd[2]) {
      try {
        const historyContent = commandHistory.join('\n') + '\n';
        fs.writeFileSync(cmd[2], historyContent);
      } catch {}
      return "";
    } else if (cmd[1] === "-a" && cmd[2]) {
      try {
        const newCommands = commandHistory.slice(lastAppendedIndex);
        if (newCommands.length > 0) {
          const appendContent = newCommands.join('\n') + '\n';
          fs.appendFileSync(cmd[2], appendContent);
          lastAppendedIndex = commandHistory.length;
        }
      } catch {}
      return "";
    } else {
      const limit = cmd[1] ? parseInt(cmd[1], 10) : commandHistory.length;
      const startIndex = Math.max(0, commandHistory.length - limit);
      let result = "";
      for (let i = startIndex; i < commandHistory.length; i++) {
        result += `    ${i + 1}  ${commandHistory[i]}\n`;
      }
      return result;
    }
  } else if (command === "type") {
    const targetCommand = cmd[1];
    if (isBuiltin(targetCommand)) {
      return `${targetCommand} is a shell builtin\n`;
    } else {
      const pathDirs = process.env.PATH?.split(path.delimiter) || [];
      for (const dir of pathDirs) {
        const fullPath = path.join(dir, targetCommand);
        try {
          const stats = fs.statSync(fullPath);
          if (stats.isFile() && (stats.mode & 0o111)) {
            return `${targetCommand} is ${fullPath}\n`;
          }
        } catch {}
      }
      return `${targetCommand}: not found\n`;
    }
  }
  
  return "";
}

function findCommand(cmd: string): string | null {
  const pathDirs = process.env.PATH?.split(path.delimiter) || [];
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, cmd);
    try {
      const stats = fs.statSync(fullPath);
      if (stats.isFile() && (stats.mode & 0o111)) {
        return fullPath;
      }
    } catch {}
  }
  return null;
}



function executeMultiPipeline(commands: string[][]) {
  // Check if any command is builtin
  const hasBuiltin = commands.some(cmd => isBuiltin(cmd[0]));
  
  if (hasBuiltin) {
    // Use recursive approach for builtins
    executePipelineRecursive(commands, "");
  } else {
    // Use concurrent approach for all external commands
    const processes: ChildProcess[] = [];
    
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      const cmdName = cmd[0];
      const args = cmd.slice(1);
      
      const cmdPath = findCommand(cmdName);
      if (!cmdPath) {
        console.log(`${cmdName}: command not found`);
        repl();
        return;
      }
      
      let stdio: any;
      if (i === 0) {
        stdio = ['inherit', 'pipe', 'inherit'];
      } else if (i === commands.length - 1) {
        stdio = ['pipe', 'inherit', 'inherit'];
      } else {
        stdio = ['pipe', 'pipe', 'inherit'];
      }
      
      const childProcess = spawn(cmdPath, args, { argv0: cmdName, stdio });
      processes.push(childProcess);
    }
    
    // Connect pipes
    for (let i = 0; i < processes.length - 1; i++) {
      (processes[i].stdout as any)?.pipe(processes[i + 1].stdin);
    }
    
    processes[processes.length - 1].on('close', () => {
      repl();
    });
  }
}

function executePipelineRecursive(commands: string[][], input: string) {
  if (commands.length === 0) {
    if (input) process.stdout.write(input);
    repl();
    return;
  }
  
  const [currentCmd, ...remainingCmds] = commands;
  const cmdName = currentCmd[0];
  
  if (isBuiltin(cmdName)) {
    const output = executeBuiltin(currentCmd, input);
    executePipelineRecursive(remainingCmds, output);
  } else {
    const cmdPath = findCommand(cmdName);
    if (!cmdPath) {
      console.log(`${cmdName}: command not found`);
      repl();
      return;
    }
    
    let stdio: any;
    if (remainingCmds.length === 0) {
      stdio = ['pipe', 'inherit', 'inherit'];
    } else {
      stdio = 'pipe';
    }
    
    const childProcess = spawn(cmdPath, currentCmd.slice(1), { argv0: cmdName, stdio });
    
    if (input) {
      (childProcess.stdin as any)?.write(input);
      (childProcess.stdin as any)?.end();
    }
    
    if (remainingCmds.length === 0) {
      childProcess.on('close', () => {
        repl();
      });
    } else {
      let output = "";
      (childProcess.stdout as any)?.on('data', (data: any) => {
        output += data.toString();
      });
      
      childProcess.on('close', () => {
        executePipelineRecursive(remainingCmds, output);
      });
    }
  }
}

// Load history from HISTFILE on startup
if (process.env.HISTFILE) {
  try {
    const fileContent = fs.readFileSync(process.env.HISTFILE, 'utf8');
    const lines = fileContent.split('\n').filter(line => line.trim() !== '');
    commandHistory.push(...lines);
    lastAppendedIndex = commandHistory.length;
  } catch {}
}

repl();
