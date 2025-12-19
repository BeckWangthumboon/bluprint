import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generatePlan } from './src/agent/planAgent.js';
import { exit } from './src/exit.js';

await yargs(hideBin(process.argv))
  .scriptName('duo')
  .version('0.0.0')
  .command(
    'plan',
    'Generate implementation plan from spec',
    () => {},
    async () => {
      const result = await generatePlan();

      if (result.isErr()) {
        console.error('Error:', result.error.message);
        await exit(1);
      }

      await exit(0);
    }
  )
  .demandCommand(1, 'You must provide a command')
  .strict()
  .parseAsync();
