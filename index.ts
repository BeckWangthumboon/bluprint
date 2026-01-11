import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
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
import { handleRun } from './src/cli/run.js';
import { handleResume } from './src/cli/resume.js';

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
    'run',
    'Generate plan and execute build from a spec file',
    (yargs) =>
      yargs
        .option('spec', {
          type: 'string',
          description: 'Path to the specification file',
        })
        .option('plan', {
          type: 'boolean',
          description: 'Only generate the plan',
          default: false,
        })
        .option('build', {
          type: 'boolean',
          description: 'Only run build (planning, requires existing plan in cache)',
          default: false,
        })
        .option('preset', {
          type: 'string',
          description: 'Model preset to use (uses default if not specified)',
        })
        .option('graphite', {
          alias: 'g',
          type: 'boolean',
          description: 'Create stacked branches using Graphite CLI',
        })
        .check((argv) => {
          if (argv['plan-only'] && argv['build-only']) {
            throw new Error(
              'Options --plan-only and --build-only cannot be used together. Please choose only one of these flags.'
            );
          }
          return true;
        }),
    async (argv) => {
      await handleRun({
        spec: argv.spec,
        planOnly: argv['plan'],
        buildOnly: argv['build'],
        preset: argv.preset,
        graphite: argv.graphite,
      });
    }
  )
  .command(
    'resume',
    'Resume a previous run from a saved state',
    (yargs) =>
      yargs
        .option('interactive', {
          alias: 'i',
          type: 'boolean',
          description: 'Interactive mode to select from available runs',
          default: false,
        })
        .option('from', {
          type: 'string',
          description: 'Run ID to resume from',
        })
        .check((argv) => {
          if (!argv.interactive && !argv.from) {
            throw new Error('Use --interactive (-i) or --from to resume a run');
          }
          if (argv.interactive && argv.from) {
            throw new Error('Cannot specify both --interactive and --from. Use one or the other.');
          }
          return true;
        }),
    async (argv) => {
      await handleResume({
        interactive: argv.interactive,
        from: argv.from,
      });
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
            await handleConfigShow({ json: argv.json });
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
            await handleConfigGet(argv.key);
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
            await handleConfigSet(argv.key, argv.value);
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
            await handleConfigReset(argv.key, {
              all: argv.all,
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
