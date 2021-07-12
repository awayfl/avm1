/**
 * Copyright 2015 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
	alDefineObjectProperties, alNewObject, alToBoolean, alToNumber, alToString
} from '../runtime';
import { AVM1Context } from '../context';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Function } from '../runtime/AVM1Function';
import { AVM1Point, toAS3Point } from './AVM1Point';
import { AVM1BitmapData, toAS3BitmapData } from './AVM1BitmapData';
import { AVM1ArrayNative } from '../natives';

// Base class/function for all AVM1 filters.
class AVM1BitmapFilterFunction extends AVM1Function {
	constructor(context: AVM1Context) {
		super(context);
		this.alSetOwnPrototypeProperty(new AVM1BitmapFilterPrototype(context, this));
	}

	alConstruct(args?: any[]): AVM1Object {
		const obj = new AVM1Object(this.context);
		obj.alPrototype = this.alGetPrototypeProperty();
		return obj;
	}
}

class AVM1BitmapFilterPrototype extends AVM1Object {
	asFilterConverter: IFilterConverter;

	constructor(context: AVM1Context, fn: AVM1Function) {
		super(context);
		alDefineObjectProperties(this, {
			constructor: {
				value: fn,
				writable: true
			},
			clone: {
				value: this.clone,
				writable: true
			}
		});
	}

	clone(): AVM1Object {
		const obj = new AVM1Object(this.context);
		obj.alPrototype = this.alGetPrototypeProperty();
		return obj;
	}
}

export type IFilterModel = Record<string, any> & {filterName: string};
interface IFilterConverter {
	toAS3Filter(as2Object: AVM1Object): Record<string, any> & {filterName: string};
	fromAS3Filter(awayFilterModel: Record<string, any>): AVM1Object;
	getAS3Class(): any;
}

// Automates creation of the AVM1 filter classes.
function createFilterClass(context: AVM1Context, filtersObj: AVM1Object, base: AVM1Function,
	name: string, fields: string[]): void {
	// Simple constructor for the class function.
	function construct(args?: any[]): AVM1Object {
		const as2Object = new AVM1Object(context);
		as2Object.alPrototype = wrappedProto;
		if (args) {
			for (let i = 0; i < args.length; i++) {
				as2Object.alPut(fields[i << 1], args[i]);
			}
		}
		return as2Object;
	}

	function clone(): AVM1Object {
		const as2Object = new AVM1Object(context);
		as2Object.alPrototype = wrappedProto;
		for (let i = 0; i < fields.length; i += 2) {
			as2Object.alPut(fields[i], this.alGet(fields[i]));
		}
		return as2Object;
	}

	// function getAS3Class(): AXClass {
	// 	// The AS3 class name shall match
	// 	return context.sec.flash.filters[name].axClass;
	// }

	function toAS3Filter(as2Object: AVM1Object): {filterName: string} & Record<string, any> {
		const awayFilterModel = {
			filterName: name
		};

		// Just copying all defined properties.
		for (let i = 0; i < fields.length; i += 2) {

			const as2Value = as2Object.alGet(fields[i]);

			if (as2Value === undefined) {
				continue; // skipping undefined
			}

			awayFilterModel[fields[i]] = convertToAS3Field(context, as2Value, fields[i + 1]);
		}

		return awayFilterModel;
	}

	function fromAS3Filter(awayObject: Record<string, any>): AVM1Object {
		const as2Object = new AVM1Object(context);
		as2Object.alPrototype = wrappedProto;

		for (let i = 0; i < fields.length; i += 2) {
			as2Object.alPut(fields[i],
				convertFromAS3Field(context, awayObject[fields[i]], fields[i + 1]));
		}

		return as2Object;
	}

	// Creates new prototype object and function for the class.
	const proto = base.alGetPrototypeProperty();
	const wrappedProto: AVM1BitmapFilterPrototype = Object.create(AVM1BitmapFilterPrototype.prototype);
	AVM1Object.call(wrappedProto, context);
	wrappedProto.alPrototype = proto;

	const wrapped: AVM1BitmapFilterFunction = Object.create(AVM1BitmapFilterFunction.prototype);
	AVM1Function.call(wrapped, context);
	wrapped.alSetOwnPrototypeProperty(wrappedProto);
	wrapped.alConstruct = construct;

	alDefineObjectProperties(wrappedProto, {
		constructor: {
			value: wrapped,
			writable: true
		},
		clone: {
			value: clone,
			writable: true
		}
	});

	//... and also attaches conversion utility.
	wrappedProto.asFilterConverter = {
		toAS3Filter: toAS3Filter,
		fromAS3Filter: fromAS3Filter,
		getAS3Class: null
	};

	filtersObj.alPut(name, wrapped);
}

export function createFiltersClasses(context: AVM1Context): AVM1Object {
	const filters = alNewObject(context);
	const base = new AVM1BitmapFilterFunction(context);
	filters.alPut('BitmapFilter', base);
	// TODO make field types non-string
	createFilterClass(context, filters, base, 'BevelFilter',
		['distance', 'Number', 'angle', 'Number', 'highlightColor', 'Number',
			'highlightAlpha', 'Number', 'shadowColor', 'Number', 'shadowAlpha', 'Number',
			'blurX', 'Number', 'blurY', 'Number', 'strength', 'Number', 'quality', 'Number',
			'type', 'String', 'knockout', 'Boolean']);
	createFilterClass(context, filters, base, 'BlurFilter',
		['blurX', 'Number', 'blurY', 'Number', 'quality', 'Number']);
	createFilterClass(context, filters, base, 'ColorMatrixFilter',
		['matrix', 'Numbers']);
	createFilterClass(context, filters, base, 'ConvolutionFilter',
		['matrixX', 'Number', 'matrixY', 'Number', 'matrix', 'Numbers',
			'divisor', 'Number', 'bias', 'Number', 'preserveAlpha', 'Boolean',
			'clamp', 'Boolean', 'color', 'Number', 'alpha', 'Number']);
	createFilterClass(context, filters, base, 'DisplacementMapFilter',
		['mapBitmap', 'BitmapData', 'mapPoint', 'Point', 'componentX', 'Number',
			'componentY', 'Number', 'scaleX', 'Number', 'scaleY', 'Number',
			'mode', 'String', 'color', 'Number', 'alpha', 'Number']);
	createFilterClass(context, filters, base, 'DropShadowFilter',
		['distance', 'Number', 'angle', 'Number', 'color', 'Number',
			'alpha', 'Number', 'blurX', 'Number', 'blurY', 'Number',
			'strength', 'Number', 'quality', 'Number', 'inner', 'Boolean',
			'knockout', 'Boolean', 'hideObject', 'Boolean']);
	createFilterClass(context, filters, base, 'GlowFilter',
		['color', 'Number', 'alpha', 'Number', 'blurX', 'Number', 'blurY', 'Number',
			'strength', 'Number', 'quality', 'Number', 'inner', 'Boolean', 'knockout', 'Boolean']);
	createFilterClass(context, filters, base, 'GradientBevelFilter',
		['distance', 'Number', 'angle', 'Number', 'colors', 'Numbers',
			'alphas', 'Numbers', 'ratios', 'Numbers', 'blurX', 'Number', 'blurY', 'Number',
			'strength', 'Number', 'quality', 'Number', 'type', 'String', 'knockout', 'Boolean']);
	createFilterClass(context, filters, base, 'GradientGlowFilter',
		['distance', 'Number', 'angle', 'Number', 'colors', 'Numbers',
			'alphas', 'Numbers', 'ratios', 'Numbers', 'blurX', 'Number', 'blurY', 'Number',
			'strength', 'Number', 'quality', 'Number', 'type', 'String', 'knockout', 'Boolean']);
	return filters;
}

function convertToAS3Field(context: AVM1Context, value: any, type: string): any {
	switch (type) {
		case 'String':
			return alToString(context, value);
		case 'Boolean':
			return alToBoolean(context, value);
		case 'Number':
			return alToNumber(context, value);
		case 'Numbers': {
			const arr = [];
			if (value) {
				for (let i = 0, length = value.alGet('length'); i < length; i++) {
					arr[i] = alToNumber(context, value.alGet(i));
				}
			}
			return arr;
		}
		case 'BitmapData':
			return toAS3BitmapData(value);
		case 'Point':
			return toAS3Point(value);
		default:
			console.warn('Filters', 'Unknown convertFromAS3Field type: ' + type);
	}
}

function convertFromAS3Field(context: AVM1Context, value: any, type: string): any {
	switch (type) {
		case 'String':
		case 'Boolean':
		case 'Number':
			return value;
		case 'Numbers': {
			const arr = [];
			if (value) {
				for (let i = 0, length = value.value.length; i < length; i++) {
					arr[i] = +value.value[i];
				}
			}
			return new AVM1ArrayNative(context, arr);
		}
		case 'BitmapData':
			return AVM1BitmapData.fromAS3BitmapData(context, value);
		case 'Point':
			return AVM1Point.fromAS3Point(context, value);
		default:
			console.warn('Filters', 'Unknown convertFromAS3Field type: ' + type);
	}
}

const FILTER_TO_SIMPLE_NAME: Record<string, string> = {
	'BevelFilter' : 'bevel',
	'BlurFilter' : 'blur' ,
	'ColorMatrixFilter': 'colorMatrix',
	'ConvolutionFilter': 'convolution', // not supported yet
	'DisplacementMapFilter': 'displacement',
	'DropShadowFilter': 'dropShadow',
	'GlowFilter' : 'glow',
	'GradientBevelFilter': 'bevel',
	'GradientGlowFilter': 'gradientGlow' // not supported yet
};

export function convertToAS3Filter(context: AVM1Context, as2Filter: AVM1Object): IFilterModel {
	let proto = as2Filter ? as2Filter.alPrototype : null;

	while (proto && !(<AVM1BitmapFilterPrototype>proto).asFilterConverter) {
		proto = proto.alPrototype;
	}

	if (proto) {
		return (<AVM1BitmapFilterPrototype>proto).asFilterConverter.toAS3Filter(as2Filter);
	}
	return undefined;
}

export function convertToAS3Filters(context: AVM1Context, as2Filters: AVM1Object): IFilterModel[] {
	const arr: IFilterModel[] = [];

	if (!as2Filters) {
		return arr;
	}

	const length = as2Filters.alGet('length');
	for (let i = 0; i < length; i++) {
		const filterModel = convertToAS3Filter(context, as2Filters.alGet(i));
		if (filterModel && FILTER_TO_SIMPLE_NAME[filterModel.filterName]) {
			filterModel.filterName = FILTER_TO_SIMPLE_NAME[filterModel.filterName];
			arr.push(filterModel);
		}
	}

	return arr;
}

// export function convertFromAS3Filters(context: AVM1Context, as3Filters: ASObject): AVM1Object {
// 	var arr = [];
// 	if (as3Filters) {

// 		var classes = context.globals.filters;
// 		for (var i = 0, length = as3Filters.axGetPublicProperty('length'); i < length; i++) {
// 			var as3Filter = as3Filters.axGetPublicProperty(i);
// 			// TODO inefficient search, refactor
// 			knownFilters.forEach((filterName: string) => {
// 				var filterClass = classes.alGet(filterName);
// 				var proto: AVM1BitmapFilterPrototype = filterClass.alGetPrototypeProperty();
// 				if (proto.asFilterConverter && proto.asFilterConverter.getAS3Class().axIsType(as3Filter)) {
// 					arr.push(proto.asFilterConverter.fromAS3Filter(as3Filter));
// 				}
// 			});
// 		}
// 	}
// 	return new AVM1ArrayNative(context, arr);
// }
