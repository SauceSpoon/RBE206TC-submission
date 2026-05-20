import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('simulation 3D workbench is a separate hash route with a main-page entry', async () => {
  const [config, app, simulationPage, simulation3dPage] = await Promise.all([
    read('src/dashboard-config.jsx'),
    read('src/App.jsx'),
    read('src/pages/SimulationPage.jsx'),
    read('src/pages/Simulation3DPage.jsx')
  ]);

  assert.match(config, /id: 'simulation-3d'/);
  assert.match(config, /label: '3D 工作台'/);
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/Simulation3DPage\.jsx'\)\)/);
  assert.match(app, /case 'simulation-3d'/);
  assert.match(simulationPage, /href="#simulation-3d"/);
  assert.match(simulation3dPage, /from 'three'/);
  assert.match(simulation3dPage, /className="[^"]*simulation-3d-workbench/);
  assert.match(app, /handleStopSimulation/);
  assert.match(simulation3dPage, /handleStopSimulation/);
  assert.match(simulation3dPage, />\s*停止\s*</);
  assert.match(simulation3dPage, /addEventListener\('wheel', handleStageWheel, \{ passive: false \}\)/);
  assert.match(simulation3dPage, /event\.preventDefault\(\)/);
});
