import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runLoop } from './src/agent/loop.js';
import { generatePlan } from './src/agent/planAgent.js';
import { exit } from './src/exit.js';
import {
  handleModelsAdd,
  handleModelsRemove,
  handleModelsList,
  handleModelsValidate,
} from './src/cli/config/models.js';

process.once('SIGINT', () => void exit(130));
process.once('SIGTERM', () => void exit(143));
process.once('uncaughtException', (error) => {
  console.error(error);
  void exit(1);
});
process.once('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  void exit(1);
});

await yargs(hideBin(process.argv))
  .scriptName('bluprint')
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
  .command(
    'build',
    'Run the agent loop',
    () => {},
    async () => {
      const result = await runLoop();

      if (result.isErr()) {
        console.error('Error:', result.error.message);
        await exit(1);
      }

      await exit(0);
    }
  )
  .command(
    'config',
    'Manage Bluprint configuration',
    (yargs) =>
      yargs
        .command(
          'models',
          'Manage the model pool',
          (yargs) =>
            yargs
              .command(
                'add',
                'Add models to the pool from SDK providers',
                () => {},
                async () => {
                  await handleModelsAdd();
                }
              )
              .command(
                'remove',
                'Remove models from the pool',
                () => {},
                async () => {
                  await handleModelsRemove();
                }
              )
              .command(
                'list',
                'List all models in the pool',
                () => {},
                async () => {
                  await handleModelsList();
                }
              )
              .command(
                'validate',
                'Validate models still exist in SDK',
                () => {},
                async () => {
                  await handleModelsValidate();
                }
              )
              .demandCommand(1, 'You must provide a models subcommand')
              .strict(),
          () => {}
        )
        .demandCommand(1, 'You must provide a config subcommand')
        .strict(),
    () => {}
  )
  .demandCommand(1, 'You must provide a command')
  .strict()
  .parseAsync();
