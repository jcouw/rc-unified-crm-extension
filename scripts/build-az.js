const { rm, echo, cp, mkdir } = require('shelljs');
const { resolve } = require('path');

const projectPath = resolve(__dirname, '..');
const deployPath = resolve(projectPath, 'build')

echo('clean path...');
rm('-rf', `${deployPath}/*.js`);
rm('-rf', `${deployPath}/*.json`);
rm('-rf', `${deployPath}/models`);
rm('-rf', `${deployPath}/node_modules`);
rm('-rf', `${deployPath}/lib`);
rm('-rf', `${deployPath}/core`);
rm('-rf', `${deployPath}/adapters`);
echo('building...');
mkdir(deployPath)
mkdir(`${deployPath}/scripts/`);
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/scripts/patch-client-oauth2.js`, `${deployPath}/scripts/patch-client-oauth2.js`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp(`${projectPath}/src/index.js`, `${deployPath}/index.js`);
cp(`${projectPath}/src/server-az.js`, `${deployPath}/server.js`);
cp(`${projectPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
cp(`${projectPath}/src/releaseNotes.json`, `${deployPath}/releaseNotes.json`);
cp('-r', `${projectPath}/src/core`, `${deployPath}/core`);
cp('-r', `${projectPath}/src/lib`, `${deployPath}/lib`);
cp('-r', `${projectPath}/src/adapters`, `${deployPath}/adapters`);
cp('-r', `${projectPath}/src/models`, `${deployPath}/models`);

echo(`build done, output in ${deployPath}`);
