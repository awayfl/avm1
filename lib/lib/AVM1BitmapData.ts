/**
 * Copyright 2014 Mozilla Foundation
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

import { alCoerceNumber, alCoerceString, alToBoolean, alToInt32, alToNumber, alToString } from '../runtime';
import { AVM1Context } from '../context';
import { AVM1Rectangle, toAS3Rectangle } from './AVM1Rectangle';
import { toAS3Point } from './AVM1Point';
import { BlendModesMap, wrapAVM1NativeClass } from './AVM1Utils';
import { toAwayColorTransform, AVM1ColorTransform } from './AVM1ColorTransform';
import { toAS3Matrix } from './AVM1Matrix';
import { Billboard, SceneImage2D } from '@awayjs/scene';
import { AssetLibrary, IAsset, IAssetAdapter, Point } from '@awayjs/core';
import { AVM1Object } from '../runtime/AVM1Object';
import { AVM1Stage } from './AVM1Stage';
import { BitmapImage2D } from '@awayjs/stage';
import { AVM1MovieClip } from './AVM1MovieClip';
import { MaterialManager } from '@awayjs/graphics';

export function toAS3BitmapData(as2Object: AVM1BitmapData): SceneImage2D {
	if (!(as2Object instanceof AVM1BitmapData)) {
		return null;
	}
	return as2Object.as3BitmapData;
}

export class AVM1BitmapData extends AVM1Object {
	static createAVM1Class(context: AVM1Context): AVM1Object {
		return wrapAVM1NativeClass(context, true, AVM1BitmapData,
			['loadBitmap'],
			['height#', 'rectangle#', 'transparent#', 'width#',
				'applyFilter', 'clone', 'colorTransform', 'compare', 'copyChannel',
				'copyPixels', 'dispose', 'draw', 'fillRect', 'floodFill',
				'generateFilterRect', 'getColorBoundsRect', 'getPixel', 'getPixel32',
				'hitTest', 'merge', 'noise', 'paletteMap', 'perlinNoise',
				'pixelDissolve', 'scroll', 'setPixel', 'setPixel32', 'threshold'
			],
			null, AVM1BitmapData.prototype.avm1Constructor);
	}

	private _linkedBillboards: Billboard[] = [];

	public getBillboard(snap: string, smooth: boolean): Billboard {
		const billboardMaterial = MaterialManager.getMaterialForBitmap(<SceneImage2D> this.adaptee, true);
		const billboard = new Billboard(billboardMaterial, snap, smooth);

		this._linkedBillboards.push(billboard);

		return billboard;
	}

	//adaptee: BitmapData;

	get as3BitmapData(): SceneImage2D {
		return <SceneImage2D> this.adaptee;
	}

	public avm1Constructor(width: number, height: number, transparent?: boolean, fillColor?: number) {
		width = alToNumber(this.context, width);
		height = alToNumber(this.context, height);
		transparent = arguments.length < 3 ? true : alToBoolean(this.context, transparent);
		fillColor = arguments.length < 4 ? 0xFFFFFFFF : alToInt32(this.context, fillColor);
		if (width != 0 && height != 0) {
			const awayObject = SceneImage2D.getImage(
				width, height, transparent, fillColor, false, AVM1Stage.avmStage.view.stage
			);

			console.log('Construct:', awayObject.id);
			this.adaptee = awayObject;
		}
	}

	static fromAS3BitmapData(context: AVM1Context, awayObject: SceneImage2D): AVM1Object {
		const as2Object = new AVM1BitmapData(context);
		as2Object.alPrototype = context.globals.BitmapData.alGetPrototypeProperty();
		as2Object.adaptee = <IAsset>awayObject;
		return as2Object;
	}

	static loadBitmap(context: AVM1Context, symbolId: string): AVM1BitmapData {
		symbolId = alToString(context, symbolId);

		/**
		 * @todo FIXME, remove asset hack
		 */
		const bundle = AssetLibrary.getBundle();
		const nss = Object.keys((<any> bundle)._assetDictionary);

		let symbol: IAssetAdapter;
		for (const ns of nss) {
			symbol = bundle.getAsset(symbolId, ns);
			if (symbol) break;
		}

		// REDUX verify
		if (symbol && (<IAsset><any>symbol).isAsset(BitmapImage2D)) {
			const bitmapData = new AVM1BitmapData(context);
			bitmapData.alPrototype = context.globals.BitmapData.alGetPrototypeProperty();

			bitmapData.adaptee = <IAsset><any>symbol;
			return bitmapData;
		}
		/*
		var symbolClass = symbol.symbolProps.symbolClass;
		var bitmapClass = context.sec.flash.display.BitmapData.axClass;
		if (symbol && (bitmapClass === symbolClass ||
				bitmapClass.dPrototype.isPrototypeOf((<any>symbolClass).dPrototype))) {
			var awayObject = constructClassFromSymbol(symbol.symbolProps, bitmapClass);
			bitmap.alPrototype = context.globals.BitmapData.alGetPrototypeProperty();
			bitmap.adaptee = awayObject;
			return bitmap;
		}*/

		console.warn('[AVM1 BitmapData] Missing bitmap:', symbolId);
		return null;
	}

	public getHeight(): number {
		return this.adaptee ? (<SceneImage2D> this.adaptee).height : 0;
	}

	public getRectangle(): AVM1Object {
		const rect = (<SceneImage2D> this.adaptee);
		if (!rect)
			return new AVM1Rectangle(this.context, 0, 0, 0, 0);
		return new AVM1Rectangle(this.context, 0, 0, rect.width, rect.height);
	}

	public getTransparent(): boolean {
		return this.adaptee ? (<SceneImage2D> this.adaptee).transparent : true;
	}

	public getWidth(): number {
		return this.adaptee ? (<SceneImage2D> this.adaptee).width : 0;
	}

	public applyFilter(sourceBitmap: AVM1BitmapData,
		sourceRect: AVM1Object,
		destPoint: AVM1Object,
		filter: AVM1Object): number {
		// TODO handle incorrect arguments
		/*
		const as3BitmapData = sourceBitmap.as3BitmapData;
		const as3SourceRect = toAS3Rectangle(sourceRect);
		const as3DestPoint = toAS3Point(destPoint);*/
		// var as3Filter = convertToAS3Filter(this.context, filter);

		// todo 80pro
		//this.as3BitmapData.applyFilter(as3BitmapData, as3SourceRect, as3DestPoint, as3Filter);
		console.warn('[avm1/AVM1BitmapData] - applyFilter not implemented');
		return 0;
	}

	public clone(): AVM1BitmapData {
		const bitmap = new AVM1BitmapData(this.context);
		bitmap.alPrototype = this.context.globals.BitmapData.alGetPrototypeProperty();
		bitmap.adaptee = this.adaptee ? (<SceneImage2D> this.adaptee).clone() : null;
		return bitmap;
	}

	public colorTransform(rect: AVM1Object, colorTransform: AVM1Object): void {
		const as3Rect = toAS3Rectangle(rect);
		const as3ColorTransform = toAwayColorTransform(<AVM1ColorTransform>colorTransform);
		(<SceneImage2D> this.adaptee).colorTransform(as3Rect, as3ColorTransform);
	}

	public compare(other: AVM1BitmapData): boolean {
		if (!(other instanceof AVM1BitmapData)) {
			return false;
		}
		console.warn('[avm1/AVM1BitmapData] - compare not implemented');
		return true;
	}

	public copyChannel(sourceBitmap: AVM1BitmapData, sourceRect: AVM1Object, destPoint: AVM1Object,
		sourceChannel: number, destChannel: number): void {
		const sourceAdaptee = sourceBitmap.as3BitmapData;
		if (!this.adaptee || !sourceAdaptee)
			return;
		const as3SourceRect = toAS3Rectangle(sourceRect);
		const as3DestPoint = toAS3Point(destPoint);
		sourceChannel = alCoerceNumber(this.context, sourceChannel);
		destChannel = alCoerceNumber(this.context, destChannel);
		(<SceneImage2D> this.adaptee).copyChannel(sourceAdaptee, as3SourceRect, as3DestPoint, sourceChannel, destChannel);
	}

	public copyPixels(sourceBitmap: AVM1BitmapData, sourceRect: AVM1Object, destPoint: AVM1Object,
		alphaBitmap?: AVM1BitmapData, alphaPoint?: AVM1Object,
		mergeAlpha?: boolean): void {

		if (!sourceBitmap) {
			console.warn('[AVM1BitmapData::copyPixels] Empty source!');
			return;
		}
		//console.warn('[avm1/AVM1BitmapData] - copyPixels not implemented');

		const adaptee = (<SceneImage2D> this.adaptee);
		const sourceAdaptee = sourceBitmap.as3BitmapData;
		if (!this.adaptee || !sourceAdaptee)
			return;
		const as3SourceRect = toAS3Rectangle(sourceRect);
		const as3DestPoint = toAS3Point(destPoint);
		const as3AlphaData = alphaBitmap ? alphaBitmap.as3BitmapData : null;
		const as3AlphaPoint = alphaPoint ? toAS3Point(alphaPoint) : null;
		mergeAlpha = alToBoolean(this.context, mergeAlpha);

		adaptee.copyPixels(
			sourceAdaptee, as3SourceRect, as3DestPoint, as3AlphaData, as3AlphaPoint, mergeAlpha);
	}

	dispose(): void {
		if (!this.adaptee)
			return;

		for (const billboard of this._linkedBillboards) {
			billboard.parent.removeChild(billboard);
			billboard.dispose();
		}

		this._linkedBillboards = [];

		(<SceneImage2D> this.adaptee).dispose();
	}

	draw(source: AVM1Object | string, matrix?: AVM1Object, colorTransform?: AVM1ColorTransform, blendMode?: any,
		clipRect?: AVM1Object, smooth?: boolean): void {
		if (!this.adaptee)
			return;
		if (!source) {
			console.warn('[AVM1BitmapData::draw] Empty source!');
			return;
		}

		let avm1Object: AVM1MovieClip = source as AVM1MovieClip;

		if (typeof source === 'string') {
			avm1Object = this.context.resolveTarget(source);

			if (!avm1Object) {
				console.warn(`[AVM1BitmapData::draw] Source ${source}  not resolved!`);
				return;
			}
		}

		const as3BitmapData = (<any>avm1Object).adaptee; // movies and bitmaps
		const as3Matrix = matrix ? toAS3Matrix(matrix) : null;
		const as3ColorTransform = colorTransform ? toAwayColorTransform(colorTransform) : null;
		const as3ClipRect = clipRect ? toAS3Rectangle(clipRect) : null;

		blendMode = typeof blendMode === 'number' ? BlendModesMap[blendMode] : alCoerceString(this.context, blendMode);
		blendMode  = blendMode || null;
		smooth = alToBoolean(this.context, smooth);
		//this.as3BitmapData.fillRect(this.as3BitmapData.rect, 0xffffffff);

		// IMPORTANT! Preventing unregister object after remove from parent.
		avm1Object._locked = true;

		this.as3BitmapData.draw(as3BitmapData, as3Matrix, as3ColorTransform, blendMode, as3ClipRect, smooth);

		avm1Object._locked = false;
	}

	fillRect(rect: AVM1Object, color: number): void {

		if (!this.adaptee)
			return;

		const as3Rect = toAS3Rectangle(rect);
		color = alToInt32(this.context, color);

		this.as3BitmapData.fillRect(as3Rect, color);
	}

	floodFill(x: number, y: number, color: number): void {
		x = alCoerceNumber(this.context, x);
		y = alCoerceNumber(this.context, y);
		color = alToInt32(this.context, color);
		// todo 80pro
		console.warn('[avm1/AVM1BitmapData] - floodFill not implemented');
		//this.adaptee.floodFill(x, y, color);
	}

	generateFilterRect(sourceRect: AVM1Object, filter: AVM1Object): AVM1Object {
		console.warn('[avm1/AVM1BitmapData] - generateFilterRect not implemented');
		return undefined;
	}

	getColorBoundsRect(mask: number, color: number, findColor?: boolean): AVM1Object {
		if (!this.adaptee)
			return;
		mask = alToInt32(this.context, mask) >>> 0;
		color = alToInt32(this.context, color) >>> 0;
		findColor = alToBoolean(this.context, findColor);
		// todo 80pro
		//console.warn('[avm1/AVM1BitmapData] - getColorBoundsRect not implemented');

		const rect = this.as3BitmapData?.getColorBoundsRect(mask, color, findColor);

		return rect
			? new AVM1Rectangle(this.context, rect.x, rect.y, rect.width, rect.height)
			: null;
		//return null;
	}

	getPixel(x: number, y: number): number {
		return this.adaptee ? (<SceneImage2D> this.adaptee).getPixel(x, y) : 0;
	}

	getPixel32(x: number, y: number): number {
		return this.adaptee ? (<SceneImage2D> this.adaptee).getPixel32(x, y) : 0;
	}

	hitTest(firstPoint: AVM1Object, firstAlphaThreshold: number, secondObject: AVM1Object,
		secondBitmapPoint?: AVM1Object, secondAlphaThreshold?: number): boolean {
		//const as3FirstPoint = toAS3Point(firstPoint);
		//firstAlphaThreshold = alToInt32(this.context, firstAlphaThreshold);
		console.warn('[avm1/AVM1BitmapData] - hitTest not implemented');
		return false;
		/*
		// TODO: Check for Rectangle, Point, Bitmap, or BitmapData here. Or whatever AVM1 allows.
		var as3SecondObject = (<any>secondObject).adaptee; // movies and bitmaps
		if (arguments.length < 4) {
			return this.adaptee.hitTest(as3FirstPoint, firstAlphaThreshold, as3SecondObject);
		}
		var as3SecondBitmapPoint = secondBitmapPoint != null ? toAS3Point(secondBitmapPoint) : null;
		if (arguments.length < 4) {
			return this.adaptee.hitTest(as3FirstPoint, firstAlphaThreshold, as3SecondObject,
				as3SecondBitmapPoint);
		}
		secondAlphaThreshold = alToInt32(this.context, secondAlphaThreshold);
		*/
	}

	merge(sourceBitmap: AVM1BitmapData, sourceRect: AVM1Object, destPoint: AVM1Object,
		redMult: number, greenMult: number, blueMult: number, alphaMult: number): void {
		const as3BitmapData = sourceBitmap.as3BitmapData;
		if (!this.adaptee || !as3BitmapData)
			return;
		const as3SourceRect = toAS3Rectangle(sourceRect);
		const as3DestPoint = toAS3Point(destPoint);
		redMult = alToInt32(this.context, redMult);
		greenMult = alToInt32(this.context, greenMult);
		blueMult = alToInt32(this.context, blueMult);
		alphaMult = alToInt32(this.context, alphaMult);

		this.as3BitmapData.merge(as3BitmapData, as3SourceRect, as3DestPoint, redMult, greenMult,
			blueMult, alphaMult);
	}

	noise(randomSeed: number, low?: number, high?: number, channelOptions?: number,
		grayScale?: boolean): void {
		randomSeed = alToInt32(this.context, randomSeed);
		low = arguments.length < 2 ? 0 : alToInt32(this.context, low);
		high = arguments.length < 3 ? 255 : alToInt32(this.context, high);
		channelOptions = arguments.length < 4 ? 1 | 2 | 4 : alToInt32(this.context, channelOptions);
		grayScale = arguments.length < 5 ? false : alToBoolean(this.context, grayScale);

		console.warn('[avm1/AVM1BitmapData] - noise not implemented');
	}

	paletteMap(sourceBitmap: AVM1BitmapData,
		sourceRect: AVM1Object,
		destPoint: AVM1Object,
		redArray?: AVM1Object,
		greenArray?: AVM1Object,
		blueArray?: AVM1Object,
		alphaArray?: AVM1Object): void {
		console.warn('[avm1/AVM1BitmapData] - paletteMap not implemented');
	}

	perlinNoise(baseX: number,
		baseY: number,
		numOctaves: number,
		randomSeed: number,
		stitch: boolean,
		fractalNoise: boolean,
		channelOptions?: number,
		grayScale?: boolean,
		offsets?: AVM1Object): void {
		baseX = alCoerceNumber(this.context, baseX);
		baseY = alCoerceNumber(this.context, baseY);
		numOctaves = alCoerceNumber(this.context, numOctaves);
		randomSeed = alCoerceNumber(this.context, randomSeed);
		stitch = alToBoolean(this.context, stitch);
		fractalNoise = alToBoolean(this.context, fractalNoise);
		channelOptions = channelOptions === undefined ? 7 : alCoerceNumber(this.context, channelOptions);
		grayScale = alToBoolean(this.context, grayScale);
		/*const as3Offsets = isNullOrUndefined(offsets) ?
			null : AVM1ArrayNative.mapToJSArray(offsets, (item) => alCoerceNumber(this.context, item), this);*/

		console.warn('[avm1/AVM1BitmapData] - perlinNoise not implemented');
	}

	pixelDissolve(sourceBitmap: AVM1BitmapData, sourceRect: AVM1Object, destPoint: AVM1Object,
		randomSeed?: number, numberOfPixels?: number, fillColor?: number): number {
		//const as3BitmapData = sourceBitmap.as3BitmapData;
		const as3SourceRect = toAS3Rectangle(sourceRect);
		//const as3DestPoint = toAS3Point(destPoint);
		randomSeed = arguments.length < 4 ? 0 : alToInt32(this.context, randomSeed);
		numberOfPixels = arguments.length < 5 ?
			as3SourceRect.width * as3SourceRect.height / 30 :
			alToInt32(this.context, numberOfPixels);
		fillColor = arguments.length < 6 ? 0 : alToInt32(this.context, fillColor);

		console.warn('[avm1/AVM1BitmapData] - pixelDissolve not implemented');
		return 0;
	}

	scroll(x: number, y: number): void {
		x = alCoerceNumber(this.context, x) | 0;
		y = alCoerceNumber(this.context, y) | 0;

		if (!x && !y) return;
		if (!this.adaptee) return;

		const as3this = this.as3BitmapData;

		as3this.copyPixels(as3this, as3this.rect, new Point(x, y), null, null, false);
		//console.warn('[avm1/AVM1BitmapData] - scroll not implemented');
	}

	setPixel(x: number, y: number, color: number): void {
		if (!this.adaptee)
			return;
		x = alCoerceNumber(this.context, x);
		y = alCoerceNumber(this.context, y);
		color = alToInt32(this.context, color);
		(<SceneImage2D> this.adaptee).setPixel(x, y, color);
	}

	setPixel32(x: number, y: number, color: number): void {
		if (!this.adaptee)
			return;
		x = alCoerceNumber(this.context, x);
		y = alCoerceNumber(this.context, y);
		color = alToInt32(this.context, color);
		(<SceneImage2D> this.adaptee).setPixel32(x, y, color);
	}

	threshold(sourceBitmap: AVM1BitmapData, sourceRect: AVM1Object, destPoint: AVM1Object,
		operation: string, threshold: number, color?: number, mask?: number,
		copySource?: boolean): number {

		const thisAsBitmap = this.as3BitmapData;
		const as3BitmapData = sourceBitmap.as3BitmapData;

		if (!this.adaptee || !as3BitmapData)
			return;

		const as3SourceRect = toAS3Rectangle(sourceRect);
		const as3DestPoint = toAS3Point(destPoint);

		operation = alCoerceString(this.context, operation);
		threshold = alToInt32(this.context, threshold) >>> 0;
		color = arguments.length < 6 ? 0 : alToInt32(this.context, color);
		mask = arguments.length < 7 ? 0xFFFFFFFF : alToInt32(this.context, mask);
		copySource = arguments.length < 8 ? false : alToBoolean(this.context, copySource);

		// if 0, treshold is bugged
		color = color === 0 ? 0x00010101 : color;

		thisAsBitmap.threshold(
			as3BitmapData, as3SourceRect, as3DestPoint,
			operation, threshold, 0x00ff00ff, mask, copySource);

		//console.warn('[avm1/AVM1BitmapData] - scroll not implemented');
		return 0;
	}
}
