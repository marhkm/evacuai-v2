import { loadCampus } from '../load';
import { validate } from '../validate';

for (const dir of process.argv.slice(2)) {
  let snap;
  try {
    snap = loadCampus(dir);
  } catch (err) {
    console.log(`✗ load ${(err as Error).message}`);
    process.exitCode = 1;
    continue;
  }
  const issues = validate(snap);
  if (issues.length === 0) {
    console.log(`✓ ${dir}: ${snap.nodes.length} nodes, ${snap.edges.length} edges`);
  } else {
    for (const i of issues) console.log(`✗ ${i.code} ${i.message}`);
    process.exitCode = 1;
  }
}
