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

//module Shumway.AVM1.Lib {
import { AVM1Object } from '../runtime/AVM1Object';
import { wrapAVM1NativeClass } from './AVM1Utils';
import { AVM1ColorTransform, fromAVM1Object } from './AVM1ColorTransform';
import { DisplayObject, DisplayObjectContainer } from '@awayjs/scene';
import { AVM1Context } from '../context';
import { AVM1SymbolBase } from './AVM1SymbolBase';
import { HierarchicalProperty } from '@awayjs/view';

export class AVM1Color extends AVM1Object {
	static createAVM1Class(context: AVM1Context): AVM1Object {
		return wrapAVM1NativeClass(context, true, AVM1Color,
			[],
			['getRGB', 'getTransform', 'setRGB', 'setTransform'],
			null, AVM1Color.prototype.avm1Constructor);
	}

	private _target: AVM1SymbolBase<DisplayObjectContainer>;
	private _targetAwayObject: DisplayObject;

	public avm1Constructor(target_mc) {
		if (target_mc) {
			this._target = this.context.resolveTarget(target_mc);
			if (this._target && this._target.adaptee && !this._target.adaptee.isAVMScene) {
				(<any> this._target).avmColor = this;
				this._targetAwayObject = this._target.adaptee;
			}
		}
	}

	public changeTarget(target_mc) {
		if (target_mc && target_mc instanceof AVM1SymbolBase) {
			this._target = target_mc;
			(<any> this._target).avmColor = this;
			(<any> this._target)._ctBlockedByScript = true;
			this._targetAwayObject = this._target.adaptee;
		} else {
			this._target = null;
		}
	}

	public getRGB(): number {
		const transform = AVM1Color.prototype.getTransform.call(this);
		if (transform)
			return transform.getRgb();
		return null;
	}

	public getTransform(): AVM1ColorTransform {
		if (this._targetAwayObject) {
			return AVM1ColorTransform.fromAwayColorTransform(this.context,
				this._targetAwayObject.transform.colorTransform);
		}
		return null;
	}

	public setRGB(offset): void {
		const transform = AVM1Color.prototype.getTransform.call(this);
		if (transform) {
			transform.setRgb(offset);
			AVM1Color.prototype.setTransform.call(this, transform);
		}
		if (this._target)
			(<any> this._target)._ctBlockedByScript = true;
	}

	public setTransform(transform: AVM1ColorTransform): void {
		if (this._targetAwayObject && transform) {
			let tf = transform;
			if (!(transform instanceof AVM1ColorTransform)) {
				if ((<any>transform) instanceof AVM1Object) {
					tf = <AVM1ColorTransform>fromAVM1Object(transform);
				}
			}
			if (tf) {
				this._targetAwayObject.transform.colorTransform._rawData[0] = tf._rawData[0];
				this._targetAwayObject.transform.colorTransform._rawData[1] = tf._rawData[1];
				this._targetAwayObject.transform.colorTransform._rawData[2] = tf._rawData[2];
				this._targetAwayObject.transform.colorTransform._rawData[3] = tf._rawData[3];
				this._targetAwayObject.transform.colorTransform._rawData[4] = tf._rawData[4];
				this._targetAwayObject.transform.colorTransform._rawData[5] = tf._rawData[5];
				this._targetAwayObject.transform.colorTransform._rawData[6] = tf._rawData[6];
				this._targetAwayObject.transform.colorTransform._rawData[7] = tf._rawData[7];
				this._targetAwayObject.transform.invalidateColorTransform();
				this._targetAwayObject.invalidate();
				this._targetAwayObject._invalidateHierarchicalProperty(HierarchicalProperty.COLOR_TRANSFORM);
			}

		}
		if (this._target)
			(<any> this._target)._ctBlockedByScript = true;
	}
}
