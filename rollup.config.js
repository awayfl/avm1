var includePaths = require('rollup-plugin-includepaths');
var commonjs = require('rollup-plugin-commonjs');
var nodeResolve = require('rollup-plugin-node-resolve');

module.exports = {
	input: './dist/index.js',
	output: {
		name: 'AwayflAvm1',
		sourcemap: true,
		format: 'umd',
		file: './bundle/awayfl-avm1.umd.js',
		globals: {
			'@awayjs/core': 'AwayjsCore',
			'@awayjs/graphics': 'AwayjsGraphics',
			'@awayjs/materials': 'AwayjsMaterials',
			'@awayjs/renderer': 'AwayjsRenderer',
			'@awayjs/scene': 'AwayjsScene',
			'@awayjs/stage': 'AwayjsStage',
			'@awayjs/swf-viewer': 'AwayjsSwfViewer',
			'@awayjs/view': 'AwayjsView',
		},
	},
	external: [
		'@awayjs/core',
		'@awayjs/graphics',
		'@awayjs/materials',
		'@awayjs/renderer',
		'@awayjs/scene',
		'@awayjs/stage',
		'@awayjs/swf-viewer',
		'@awayjs/view',
	],
	plugins: [
		nodeResolve({
			jsnext: true,
			main: true,
			module: true
		}),
		commonjs({
			namedExports: {
				'node_modules/random-seed/index.js': [ 'create' ]
			},
			include: /node_modules/
		}) ]
};