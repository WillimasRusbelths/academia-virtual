import { readFileSync } from 'node:fs';
try {
  const result=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const summary={passed:result.numPassedTests,failed:result.numFailedTests,skipped:result.numPendingTests,
    failures:result.testResults.flatMap(file=>file.assertionResults.filter(test=>test.status==='failed').map(test=>test.title))};
  process.stdout.write(JSON.stringify(summary)+'\n');
  process.exitCode=result.success&&summary.passed>0&&summary.failed===0&&summary.skipped===0?0:1;
}catch{process.stderr.write('Ensayo sin resultado válido. Valores omitidos.\n');process.exitCode=1;}
