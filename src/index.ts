#!/usr/bin/env bun

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { init } from './commands/init.js';
import type { InitArgs } from './types/commands.js';
import { exitWithError } from './lib/utils.js';

yargs(hideBin(process.argv))
  .scriptName('bluprint')
  .usage('$0 <command> [options]')
  .command<InitArgs>(
    'init',
    'Initialize a new project',
    (cmd) => {
      cmd.option('spec', {
        type: 'string',
        description: 'Path to the spec markdown file',
        demandOption: true,
      });
      cmd.option('base', {
        type: 'string',
        description: 'Base git branch to work from',
        demandOption: true,
      });
    },
    async (argv) => {
      await init(argv).match(
        () => {},
        (error) => {
          exitWithError(error.message);
        },
      );
    },
  )
  .strict()
  .demandCommand(1)
  .version('0.0.1')
  .alias('h', 'help')
  .alias('v', 'version').argv;
