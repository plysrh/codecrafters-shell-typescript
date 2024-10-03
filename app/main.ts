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
    }
    
    console.log(`${answer}: command not found`);
    repl();
  });
}

repl();
