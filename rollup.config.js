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
			'@awayfl/swf-loader': 'AwayflSwfLoader',
			'@awayjs/core': 'AwayjsCore',
			'@awayjs/graphics': 'AwayjsGraphics',
			'@awayjs/materials': 'AwayjsMaterials',
			'@awayjs/renderer': 'AwayjsRenderer',
			'@awayjs/scene': 'AwayjsScene',
			'@awayjs/stage': 'AwayjsStage',
			'@awayjs/view': 'AwayjsView',
		},
	},
	external: [
		'@awayfl/swf-loader',
		'@awayjs/core',
		'@awayjs/graphics',
		'@awayjs/materials',
		'@awayjs/renderer',
		'@awayjs/scene',
		'@awayjs/stage',
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