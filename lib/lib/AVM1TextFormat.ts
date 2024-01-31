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

import { AVM1ArrayNative } from '../natives';

import {
	alCoerceString, alNewObject, alToBoolean, alToNumber, alToString,
	AVM1PropertyFlags
} from '../runtime';
import { AVM1Context } from '../context';
import { wrapAVM1NativeClass } from './AVM1Utils';
import { TextField, TextFormat } from '@awayjs/scene';
import { AVM1Object } from '../runtime/AVM1Object';
import { notImplemented } from '@awayfl/swf-loader';

export class AVM1TextFormat extends AVM1Object {
	static createAVM1Class(context: AVM1Context): AVM1Object {
		const members = ['align#', 'blockIndent#', 'bold#', 'bullet#', 'color#', 'font#',
			'getTextExtent', 'indent#', 'italic#', 'kerning#', 'leading#',
			'leftMargin#', 'letterSpacing#', 'rightMargin#', 'size#', 'tabStops#',
			'target#', 'adaptee#','underline#', 'url#'];
		const wrapped = wrapAVM1NativeClass(context, true, AVM1TextFormat,
			[],
			members,
			null, AVM1TextFormat.prototype.avm1Constructor);
		const proto = wrapped.alGetPrototypeProperty();
		let p = null;
		members.forEach((x) => {
			if (x[x.length - 1] === '#') {
				x = x.slice(0, -1);
			}
			p = proto.alGetOwnProperty(x);
			p.flags &= ~AVM1PropertyFlags.DONT_ENUM;
			proto.alSetOwnProperty(x, p);
		});
		return wrapped;
	}

	static createFromNative(context: AVM1Context, awayObject: TextFormat): AVM1Object {
		const TextFormat = context.globals.TextFormat;
		const obj: AVM1TextFormat = new AVM1TextFormat(context);
		obj.alPrototype = TextFormat.alGetPrototypeProperty();
		obj.adaptee = awayObject;
		return obj;
	}

	public alPut(p, v) {
		if (p == 'font') {
			this.setFont(v);
		}
		super.alPut(p, v);
	}

	adaptee: TextFormat

	public avm1Constructor(font?: string, size?: number, color?: number, bold?: boolean,
		italic?: boolean, underline?: boolean, url?: string, target?: string,
		align?: string, leftMargin?: number, rightMargin?: number,
		indent?: number, leading?: number) {
		const context = this.context;
		font = (font == null) ? null : alToString(context, font);
		size = (size == null) ? null : alToNumber(context, size);
		color = (color == null) ? null : alToNumber(context, color);
		bold = (bold == null) ? null : alToBoolean(context, bold);
		italic = (italic == null) ? null : alToBoolean(context, italic);
		underline = (underline == null) ? null : alToBoolean(context, underline);
		url = (url == null) ? null : alToString(context, url);
		target = (target == null) ? null : alToString(context, target);
		align = (align == null) ? null : alToString(context, align);
		leftMargin = (leftMargin == null) ? null : alToNumber(context, leftMargin);
		rightMargin = (rightMargin == null) ? null : alToNumber(context, rightMargin);
		indent = (indent == null) ? null : alToNumber(context, indent);
		leading = (leading == null) ? null : alToNumber(context, leading);
		const awayObject = new TextFormat(
			font, size, color, bold, italic, underline, url, target,
			align, leftMargin, rightMargin, indent, leading);
		this.adaptee = awayObject;
	}

	private static _measureTextField: TextField; // REDUX security domain

	static alInitStatic(context: AVM1Context): void {
		// See _measureTextField usage in the getTextExtent() below.
		const measureTextField = new TextField();
		measureTextField.multiline = true;
		this._measureTextField = measureTextField;
	}

	public getAdaptee(): any {
		return this.adaptee.id;
	}

	public setAdaptee(value: any): void {}

	public getAlign(): string {
		return this.adaptee.align;
	}

	public setAlign(value: string): void {
		let alignAsString: string = alToString(this.context, value);
		if (alignAsString == '') {
			alignAsString = 'center';
		}
		this.adaptee.align = alignAsString;
	}

	public getBlockIndent(): any {
		notImplemented('AVM1TextFormat.getBlockIndent');
		return this.adaptee.blockIndent;
	}

	public setBlockIndent(value: any): void {
		notImplemented('AVM1TextFormat.setBlockIndent');
		this.adaptee.blockIndent = alToNumber(this.context, value);
	}

	public getBold(): any {
		return this.adaptee.bold;
	}

	public setBold(value: any): void {
		this.adaptee.bold = alToBoolean(this.context, value);
	}

	public getBullet(): any {
		notImplemented('AVM1TextFormat.getBullet');
		return this.adaptee.bullet;
	}

	public setBullet(value: any): void {
		notImplemented('AVM1TextFormat.setBullet');
		this.adaptee.bullet = alToBoolean(this.context, value);
	}

	public getColor(): any {
		return this.adaptee.color;
	}

	public setColor(value: any): void {
		this.adaptee.color = alToNumber(this.context, value);
	}

	public getFont(): string {
		return this.adaptee.font_name;
	}

	public setFont(value: string): void {
		// in awayjs "font" is a AwayJS-Font, but if we pass it a string it will stil get the font
		this.adaptee.font_name = alToString(this.context, value);
	}

	public getIndent(): any {
		return this.adaptee.indent;
	}

	public setIndent(value: any): void {
		this.adaptee.indent = alToNumber(this.context, value);
	}

	public getItalic(): any {
		return this.adaptee.italic;
	}

	public setItalic(value: any): void {
		this.adaptee.italic = alToBoolean(this.context, value);
	}

	public getKerning(): any {
		notImplemented('AVM1TextFormat.getKerning');
		return this.adaptee.kerning;
	}

	public setKerning(value: any): void {
		notImplemented('AVM1TextFormat.setKerning');
		this.adaptee.kerning = alToBoolean(this.context, value);
	}

	public getLeading(): any {
		return this.adaptee.leading;
	}

	public setLeading(value: any): void {
		this.adaptee.leading = alToNumber(this.context, value);
	}

	public getLeftMargin(): any {
		return this.adaptee.leftMargin;
	}

	public setLeftMargin(value: any): void {
		this.adaptee.leftMargin = alToNumber(this.context, value);
	}

	public getLetterSpacing(): any {
		return this.adaptee.letterSpacing;
	}

	public setLetterSpacing(value: any): void {
		this.adaptee.letterSpacing = alToNumber(this.context, value);
	}

	public getRightMargin(): any {
		return this.adaptee.rightMargin;
	}

	public setRightMargin(value: any): void {
		this.adaptee.rightMargin = alToNumber(this.context, value);
	}

	public getSize(): any {
		return this.adaptee.size;
	}

	public setSize(value: any): void {
		this.adaptee.size = alToNumber(this.context, value);
	}

	public getTabStops(): AVM1ArrayNative {
		notImplemented('AVM1TextFormat.getTabStops');
		return new AVM1ArrayNative(this.context, this.adaptee.tabStops);
	}

	public setTabStops(value: AVM1ArrayNative): void {
		this.adaptee.tabStops = AVM1ArrayNative.mapToJSArray(value, (item) => alToNumber(this.context, item));
	}

	public getTarget(): string {
		notImplemented('AVM1TextFormat.getTarget');
		// return this.adaptee.target;
		return '';
	}

	public setTarget(value: string): void {
		notImplemented('AVM1TextFormat.setTarget');
		// this.adaptee.target = alToString(this.context, value);
	}

	public getTextExtent(text: string, width?: number) {
		notImplemented('AVM1TextFormat.getTextExtent');
		text = alCoerceString(this.context, text);
		width = +width;

		const staticState: typeof AVM1TextFormat = this.context.getStaticState(AVM1TextFormat);
		const measureTextField = staticState._measureTextField;
		if (!isNaN(width) && width > 0) {
			measureTextField.width = width + 4;
			measureTextField.wordWrap = true;
		} else {
			measureTextField.wordWrap = false;
		}
		measureTextField.newTextFormat = this.adaptee;
		measureTextField.text = text;
		const result: AVM1Object = alNewObject(this.context);
		const textWidth = measureTextField.textWidth;
		const textHeight = measureTextField.textHeight;
		result.alPut('width', textWidth);
		result.alPut('height', textHeight);
		result.alPut('textFieldWidth', textWidth + 4);
		result.alPut('textFieldHeight', textHeight + 4);
		//const metrics = measureTextField.getLineMetrics(0);
		// todo: this causes compile errors:
		//result.alPut('ascent', metrics.axGetPublicProperty('ascent'));
		//result.alPut('descent',	metrics.axGetPublicProperty('descent'));
		return result;
	}

	public getUnderline(): any {
		notImplemented('AVM1TextFormat.getUnderline');
		return this.adaptee.underline;
	}

	public setUnderline(value: any): void {
		notImplemented('AVM1TextFormat.setUnderline');
		this.adaptee.underline = alToBoolean(this.context, value);
	}

	public getUrl(): string {
		notImplemented('AVM1TextFormat.getUrl');
		return this.adaptee.url;
	}

	public setUrl(value: string): void {
		notImplemented('AVM1TextFormat.setUrl');
		this.adaptee.url = alToString(this.context, value);
	}
}
