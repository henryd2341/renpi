import fs from 'node:fs';
import path from 'node:path';

export const roles = {
  writing: { group: 'renpi-writing-plots', entry: 'write-plots', tools: ['read', 'write', 'edit', 'grep', 'find', 'ls'] },
  image: { group: 'renpi-image-assets', entry: 'create-image-assets', tools: ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'] },
  review: { group: 'renpi-review', entry: 'review-renpy-candidate', tools: ['read', 'grep', 'find', 'ls'] },
};

// Resolve existing ancestors too, so a junction inside the project does not redirect writes elsewhere.
export function canonical(file) {
  try { return fs.realpathSync(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    if (parent === file) throw error;
    return path.join(canonical(parent), path.basename(file));
  }
}

export function inside(root, file) {
  const relative = path.relative(canonical(path.resolve(root)), canonical(path.resolve(file)));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function checkWritePath(project, output, supplied) {
  // Pi expands these forms; accept unambiguous paths rather than checking a different path from the tool.
  if (typeof supplied !== 'string' || !supplied || /^[@~]/.test(supplied) || /[\u00a0\u2000-\u200a\u202f\u205f\u3000]/.test(supplied)) {
    throw new Error('Use a plain absolute path inside the assigned output directory.');
  }
  const target = path.resolve(project, supplied);
  if (!inside(output, target)) throw new Error(`Write is outside the assigned output directory: ${target}`);
}

export function artifactFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Artifact links are not accepted: ${file}`);
    if (entry.isDirectory()) result.push(...artifactFiles(file));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}

export function lastAnswer(messages) {
  const last = messages.findLast(message => message.role === 'assistant');
  if (!last || last.stopReason !== 'stop') {
    throw new Error(last?.errorMessage || `Child turn did not finish: ${last?.stopReason ?? 'no assistant response'}`);
  }
  const text = last.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  if (!text.trim()) throw new Error('Child returned no text report.');
  return text;
}
