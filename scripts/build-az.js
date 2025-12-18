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
rm('-rf', `${deployPath}/packages`);
rm('-rf', `${deployPath}/connectors`);
echo('building...');
mkdir(deployPath)
mkdir(`${deployPath}/scripts/`);
cp(`${projectPath}/package.json`, `${deployPath}/package.json`);
cp(`${projectPath}/scripts/preinstall-setup.js`, `${deployPath}/scripts/preinstall-setup.js`);
cp(`${projectPath}/scripts/postinstall-fix-core.js`, `${deployPath}/scripts/postinstall-fix-core.js`);
cp(`${projectPath}/package-lock.json`, `${deployPath}/package-lock.json`);
cp(`${projectPath}/src/index.js`, `${deployPath}/index.js`);
cp(`${projectPath}/src/server-az.js`, `${deployPath}/server.js`);
cp(`${projectPath}/src/dbAccessor.js`, `${deployPath}/dbAccessor.js`);
mkdir(`${deployPath}/packages`);
cp('-r', `${projectPath}/packages/core`, `${deployPath}/packages/core`);
cp(`${projectPath}/src/releaseNotes.json`, `${deployPath}/releaseNotes.json`);
cp('-r', `${projectPath}/src/lib`, `${deployPath}/lib`);
cp('-r', `${projectPath}/src/connectors`, `${deployPath}/connectors`);

echo(`build done, output in ${deployPath}`);
