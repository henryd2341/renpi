import path from 'node:path';
import { installFoundationProject } from './project.mjs';

const [root, source, ...files] = process.argv.slice(2);
if (!root || !source || !files.length) throw new Error('Usage: node foundation-install.mjs PROJECT authoring/SOURCE file.rpy [assets/FILE ...]. Close the GUI and Pi first.');
console.log(JSON.stringify(await installFoundationProject(path.resolve(root), source, files), null, 2));
