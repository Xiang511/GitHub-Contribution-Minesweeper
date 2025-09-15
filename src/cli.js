#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { generateBoardSVG, generateAnimationSVG, OPTION_DOC } from './index.js';

const argv = yargs(hideBin(process.argv))
  .scriptName('gh-contrib-minesweeper')
  .usage('$0 --username <name> [options]')
  .option('username',{ alias:'u', type:'string', demandOption:true, describe:'GitHub username'})
  .option('ratio',{ type:'number', default:0.1, describe:'Mine ratio 0.01~0.5'})
  .option('year',{ type:'number', describe:'Specific year'})
  .option('no-trailing',{ type:'boolean', describe:'Disable trailing 52 weeks normalization'})
  .option('theme',{ type:'string', choices:['light','dark'], default:'light'})
  .option('lighten',{ type:'number', default:0.45, describe:'Lighten factor 0~1'})
  .option('source',{ type:'string', choices:['auto','api','html','mock'], default:'auto', describe:'Data source priority'})
  .option('mock',{ type:'boolean', default:true, describe:'Use mock data on fetch error'})
  .option('out',{ type:'string', describe:'Output board SVG file (default stdout if not set and --animation not used)'})
  .option('animation',{ type:'boolean', describe:'Generate replay animation SVG'})
  .option('anim-out',{ type:'string', describe:'Animation SVG output file (default animation.svg)'})
  .option('step-seconds',{ type:'number', default:1, describe:'Seconds per action for animation'})
  .option('speed',{ type:'number', default:1, describe:'Speed multiplier (overrides timing by dividing step-seconds & fade)'})
  .option('fade',{ type:'number', default:0.25, describe:'Fade duration per cell (animation)'})
  .option('seq-flood',{ type:'boolean', describe:'Sequential flood reveal instead of simultaneous'})
  .option('no-loop',{ type:'boolean', describe:'Do not loop animation'})
  .example('$0 -u octocat --out board.svg','Generate board SVG')
  .example('$0 -u octocat --animation --anim-out replay.svg','Generate animation SVG')
  .help()
  .argv;

(async () => {
  try {
    const common = {
      username: argv.username,
      ratio: argv.ratio,
      year: argv.year || null,
      trailing: !argv['no-trailing'],
      theme: argv.theme,
      lightenFactor: argv.lighten,
  useMockOnError: argv.mock,
  source: argv.source
    };
    if(argv.animation){
      const svg = await generateAnimationSVG({ ...common, stepSeconds: argv['step-seconds'], fadeDuration: argv.fade, speed: argv.speed, simultaneousFlood: !argv['seq-flood'], loop: !argv['no-loop'] });
      const file = argv['anim-out'] || 'animation.svg'; fs.writeFileSync(file, svg, 'utf8');
      console.error('Animation SVG written:', file);
    } else {
  const svg = await generateBoardSVG(common);
      if(argv.out){ fs.writeFileSync(argv.out, svg, 'utf8'); console.error('Board SVG written:', argv.out); }
      else process.stdout.write(svg);
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
