import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function repl() {
  rl.question("$ ", (answer) => {
    const parts = answer.trim().split(' ');
    const command = parts[0];
    
    if (command === 'exit') {
      const exitCode = parts[1] ? parseInt(parts[1]) : 0;
      process.exit(exitCode);
    } else if (command === 'echo') {
      console.log(parts.slice(1).join(' '));
    } else if (command === 'type') {
      const targetCommand = parts[1];

      if (['echo', 'exit', 'type'].includes(targetCommand)) {
        console.log(`${targetCommand} is a shell builtin`);
      } else {
        console.log(`${targetCommand}: not found`);
      }
    } else {
      console.log(`${answer}: command not found`);
    }
    repl();
  });
}

repl();
