// Writes the normalized CampusSnapshot JSON consumed by the Laravel CampusSeeder (no loader logic duplicated in PHP).
import { writeFileSync } from 'node:fs';
import { loadCampus } from '../load';

for (const dir of process.argv.slice(2)) {
  writeFileSync(`${dir}.snapshot.json`, JSON.stringify(loadCampus(dir), null, 2) + '\n');
  console.log(`wrote ${dir}.snapshot.json`);
}
