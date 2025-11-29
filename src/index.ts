#!/usr/bin/env bun

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { init } from './commands/init.js';
import type { InitArgs } from './types/commands.js';
import { displayError, displaySuccess } from './lib/exit.js';

yargs(hideBin(process.argv))
  .scriptName('bluprint')
  .usage('$0 <command> [options]')
  .command<InitArgs>(
    'init',
    'Initialize a new project',
    (cmd) => {
      cmd.option('spec', {
        type: 'string',
        description: 'Path to the spec YAML file',
        demandOption: true,
      });
      cmd.option('base', {
        type: 'string',
        description: 'Base git branch to work from',
        demandOption: true,
      });
    },
    async (argv) => {
      const result = await init(argv);

      result.match(
        (successInfo) => {
          if (successInfo) {
            displaySuccess(successInfo);
          }
        },
        (error) => {
          displayError(error);
        },
      );
    },
  )
  .strict()
  .demandCommand(1)
  .version('0.0.1')
  .alias('h', 'help')
  .alias('v', 'version').argv;
