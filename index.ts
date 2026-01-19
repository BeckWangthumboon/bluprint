import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { exit } from './src/exit.js';
import {
  handleModelsAdd,
  handleModelsRemove,
  handleModelsList,
  handleModelsValidate,
} from './src/cli/config/models/index.js';
import {
  handleConfigList,
  handleConfigGet,
  handleConfigSet,
  handleConfigReset,
} from './src/cli/config/general.js';
import {
  handlePresetsAdd,
  handlePresetsDefault,
  handlePresetsEdit,
  handlePresetsList,
  handlePresetsRemove,
} from './src/cli/config/presets/index.js';
import { handleRun } from './src/cli/run.js';

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
    'models',
    'Manage the model pool',
    (yargs) =>
      yargs
        .command(
          'add',
          'Add models to the pool',
          (yargs) =>
            yargs
              .option('model', {
                type: 'string',
                description: 'Model identifier in provider/model format',
                array: true,
              })
              .option('yes', {
                alias: 'y',
                type: 'boolean',
                description: 'Skip confirmation prompts',
                default: false,
              }),
          async (argv) => {
            await handleModelsAdd({
              models: argv.model,
              yes: argv.yes,
            });
          }
        )
        .command(
          'remove',
          'Remove models from the pool',
          (yargs) =>
            yargs
              .option('model', {
                type: 'string',
                description: 'Model identifier in provider/model format',
                array: true,
              })
              .option('all', {
                type: 'boolean',
                description: 'Remove all models from the pool',
                default: false,
              })
              .option('yes', {
                alias: 'y',
                type: 'boolean',
                description: 'Skip confirmation prompts',
                default: false,
              }),
          async (argv) => {
            await handleModelsRemove({
              models: argv.model,
              flags: { all: argv.all, yes: argv.yes },
            });
          }
        )
        .command(
          'list',
          'List all models in the pool',
          (yargs) =>
            yargs.option('json', {
              type: 'boolean',
              description: 'Output as JSON',
              default: false,
            }),
          async (argv) => {
            await handleModelsList({ json: argv.json });
          }
        )
        .command(
          'validate',
          'Validate existing models in pool',
          (yargs) =>
            yargs
              .option('json', {
                type: 'boolean',
                description: 'Output as JSON',
                default: false,
              })
              .option('verbose', {
                alias: 'v',
                type: 'boolean',
                description: 'Show all models, not just invalid ones',
                default: false,
              }),
          async (argv) => {
            await handleModelsValidate({ json: argv.json, verbose: argv.verbose });
          }
        )
        .demandCommand(1, 'You must provide a models subcommand')
        .strict(),
    () => {}
  )
  .command(
    'presets',
    'Manage model presets',
    (yargs) =>
      yargs
        .command(
          'add',
          'Add a new model preset',
          (yargs) =>
            yargs
              .option('name', {
                type: 'string',
                description: 'Preset name',
              })
              .option('coding', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('master', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('plan', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('summarizer', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('commit', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              }),
          async (argv) => {
            await handlePresetsAdd({
              name: argv.name,
              models: {
                coding: argv.coding,
                master: argv.master,
                plan: argv.plan,
                summarizer: argv.summarizer,
                commit: argv.commit,
              },
            });
          }
        )
        .command(
          'edit',
          'Edit an existing model preset',
          (yargs) =>
            yargs
              .option('name', {
                type: 'string',
                description: 'Preset name',
              })
              .option('coding', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('master', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('plan', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('summarizer', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              })
              .option('commit', {
                type: 'string',
                description: 'Model identifier in provider/model format',
              }),
          async (argv) => {
            await handlePresetsEdit({
              name: argv.name,
              models: {
                coding: argv.coding,
                master: argv.master,
                plan: argv.plan,
                summarizer: argv.summarizer,
                commit: argv.commit,
              },
            });
          }
        )
        .command(
          'remove',
          'Remove a model preset',
          (yargs) =>
            yargs
              .option('name', {
                type: 'string',
                description: 'Preset name',
              })
              .option('yes', {
                alias: 'y',
                type: 'boolean',
                description: 'Skip confirmation prompts',
                default: false,
              }),
          async (argv) => {
            await handlePresetsRemove({
              name: argv.name,
              yes: argv.yes,
            });
          }
        )
        .command(
          'list',
          'List all model presets',
          (yargs) =>
            yargs.option('json', {
              type: 'boolean',
              description: 'Output as JSON',
              default: false,
            }),
          async (argv) => {
            await handlePresetsList({ json: argv.json });
          }
        )
        .command(
          'default',
          'Set the default model preset',
          (yargs) =>
            yargs
              .option('name', {
                type: 'string',
                description: 'Preset name',
              })
              .option('yes', {
                alias: 'y',
                type: 'boolean',
                description: 'Skip confirmation prompts',
                default: false,
              }),
          async (argv) => {
            await handlePresetsDefault({ name: argv.name, yes: argv.yes });
          }
        )
        .demandCommand(1, 'You must provide a presets subcommand')
        .strict(),
    () => {}
  )
  .command(
    'config',
    'Manage Bluprint configuration',
    (yargs) =>
      yargs
        .command(
          'list',
          'List all general config values',
          (yargs) =>
            yargs.option('json', {
              type: 'boolean',
              description: 'Output as JSON',
              default: false,
            }),
          async (argv) => {
            await handleConfigList({ json: argv.json });
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
        .demandCommand(1, 'You must provide a config subcommand')
        .strict(),
    () => {}
  )
  .demandCommand(1, 'You must provide a command')
  .strict()
  .parseAsync();
