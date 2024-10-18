const { createInterface } = require('readline');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line) => {
    console.log(`\nDEBUG: completer called with line: "${line}"`);
    
    if (line === 'ech') {
      console.log('DEBUG: returning ["echo "] for "ech"');
      return [['echo '], line];
    }
    
    console.log('DEBUG: no match, returning empty');
    return [[], line];
  }
});

rl.question('$ ', (answer) => {
  console.log(`You entered: ${answer}`);
  rl.close();
});