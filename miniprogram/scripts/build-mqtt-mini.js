'use strict'
const path = require('node:path')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const resolveFrom = process.env.DORMMATE_MQTT_BUILD_TOOLS || __dirname
const toolRequire = createRequire(path.join(resolveFrom, 'package.json'))
const { build } = toolRequire('esbuild')
const { polyfillNode } = toolRequire('esbuild-plugin-polyfill-node')
const root = path.resolve(__dirname, '..')

async function main() {
  const common = {
    absWorkingDir: root, bundle: true, platform: 'browser', target: 'es2018',
    minify: true, legalComments: 'eof', write: false,
    inject: [path.join(root, 'scripts/mqtt-runtime-globals.js')],
    nodePaths: [path.join(resolveFrom, 'node_modules')],
    plugins: [polyfillNode({ globals: { buffer: true, process: true, navigator: true } })]
  }
  const bootstrap = await build({ ...common, entryPoints: ['scripts/mqtt-mini-bootstrap.js'],
    format: 'iife', outfile: 'vendor/mqtt-bootstrap.tmp.js' })
  const client = await build({ ...common, entryPoints: ['scripts/mqtt-mini-entry.js'],
    format: 'cjs', outfile: 'vendor/mqtt-client.tmp.js' })
  const output = bootstrap.outputFiles[0].text + '\n/* DormMate MQTT.js client phase */\n' + client.outputFiles[0].text
  fs.writeFileSync(path.join(root, 'vendor/mqtt.min.js'), output)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
