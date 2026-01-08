import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runLoop } from './src/agent/loop.js';
import { generatePlan } from './src/agent/planAgent.js';
import { exit } from './src/exit.js';
import {
  handleModelsEdit,
  handleModelsList,
  handleModelsValidate,
} from './src/cli/config/models.js';
import {
  handleConfigShow,
  handleConfigGet,
  handleConfigSet,
  handleConfigReset,
} from './src/cli/config/general.js';
import {
  handlePresetsAdd,
  handlePresetsEdit,
  handlePresetsRemove,
  handlePresetsList,
  handlePresetsDefault,
} from './src/cli/config/presets.js';

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
                'edit',
                'Add/remove models in the pool',
                () => {},
                async () => {
                  await handleModelsEdit();
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
                'Validate existing models in pool',
                () => {},
                async () => {
                  await handleModelsValidate();
                }
              )
              .demandCommand(1, 'You must provide a models subcommand')
              .strict(),
          () => {}
        )
        .command(
          'show',
          'Show all general config values',
          (yargs) =>
            yargs.option('json', {
              type: 'boolean',
              description: 'Output as JSON',
              default: false,
            }),
          async (argv) => {
            await handleConfigShow({ json: argv.json as boolean });
          }
        )
        .command(
          'get <key>',
          'Get a specific general config value',
          (yargs) =>
            yargs.positional('key', {
              type: 'string',
              description: 'Config key (e.g., limits.maxIterations)',
              demandOption: true,
            }),
          async (argv) => {
            await handleConfigGet(argv.key as string);
          }
        )
        .command(
          'set <key> <value>',
          'Set a general config value',
          (yargs) =>
            yargs
              .positional('key', {
                type: 'string',
                description: 'Config key (e.g., limits.maxIterations)',
                demandOption: true,
              })
              .positional('value', {
                type: 'string',
                description: 'Positive integer value',
                demandOption: true,
              }),
          async (argv) => {
            await handleConfigSet(argv.key as string, argv.value as string);
          }
        )
        .command(
          'reset [key]',
          'Reset general config value(s) to defaults',
          (yargs) =>
            yargs
              .positional('key', {
                type: 'string',
                description: 'Config key (e.g., limits.maxIterations)',
              })
              .option('all', {
                type: 'boolean',
                description: 'Reset all general config values',
                default: false,
              }),
          async (argv) => {
            await handleConfigReset(argv.key as string | undefined, {
              all: argv.all as boolean,
            });
          }
        )
        .command(
          'presets',
          'Manage model presets',
          (yargs) =>
            yargs
              .command(
                'add',
                'Add a new model preset',
                () => {},
                async () => {
                  await handlePresetsAdd();
                }
              )
              .command(
                'edit',
                'Edit an existing model preset',
                () => {},
                async () => {
                  await handlePresetsEdit();
                }
              )
              .command(
                'remove',
                'Remove a model preset',
                () => {},
                async () => {
                  await handlePresetsRemove();
                }
              )
              .command(
                'list',
                'List all model presets',
                () => {},
                async () => {
                  await handlePresetsList();
                }
              )
              .command(
                'default',
                'Set the default model preset',
                () => {},
                async () => {
                  await handlePresetsDefault();
                }
              )
              .demandCommand(1, 'You must provide a presets subcommand')
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
